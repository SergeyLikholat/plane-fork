/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * «Контроль» rows for a supervised work item, shared by the issue detail
 * sidebar and the peek overview. Rendered only when the item is under
 * control (state «На контроле» / group `supervised`, or a phase label).
 * Phases: «🗣 Постановка» → «Поставил» → «👁 Проверка» → «Сдал» → «✅ Приёмка».
 *
 * The next touch is the issue's own `target_date`; «Обещал к» and «Частота»
 * live in the side resource `/control/`. A touch is recorded server-side
 * (comment + date/labels/state changes), then mirrored into the MobX store.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import {
  CalendarCheck2,
  CalendarClock,
  CheckCheck,
  Eye,
  Flame,
  Hand,
  Handshake,
  MessagesSquare,
  Repeat,
  Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { promptNextStepAfterStepClosed } from "@/components/issues/big-task/next-step-prompt";
import { DateDropdown } from "@/components/dropdowns/date";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useLabel } from "@/hooks/store/use-label";
import { useProjectState } from "@/hooks/store/use-project-state";
import { IssueControlService } from "@/services/issue/issue-control.service";
import type {
  TControlFrequency,
  TControlPhase,
  TControlTouchPayload,
  TIssueControlUpdate,
} from "@/services/issue/issue-control.service";
import {
  FREQUENCY_OPTIONS,
  PHASE_TITLES,
  RISK_STREAK,
  formatRuDay,
  getControlPhase,
  getFrequencyLabel,
  getTouchDue,
  pluralTimes,
} from "./helpers";
import { announceDescriptionReplaced } from "./description-sync";
import { ControlSetupModal } from "./setup-modal";
import { ControlTouchModal } from "./touch-modal";
import type { TTouchModalMode } from "./touch-modal";

const issueControlService = new IssueControlService();

const PHASE_ICONS: Record<TControlPhase, LucideIcon> = {
  setup: MessagesSquare,
  check: Eye,
  acceptance: CheckCheck,
};

const PHASE_CHIP_CLASSES: Record<TControlPhase, string> = {
  setup: "bg-warning-subtle text-warning-primary",
  check: "bg-accent-subtle text-accent-primary",
  acceptance: "bg-success-subtle text-success-primary",
};

const errorMessage = (error: unknown, fallback: string): string => {
  const data = error as { error?: string; detail?: string } | undefined;
  return data?.error ?? data?.detail ?? fallback;
};

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  /** Button height of neighbouring rows differs between sidebar and peek. */
  labelClassName?: string;
};

export const IssueControlProperties = observer(function IssueControlProperties(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, labelClassName = "text-body-xs-regular" } = props;
  // store hooks
  const {
    issue: { getIssueById },
    rootIssueStore,
    fetchActivities,
    fetchComments,
  } = useIssueDetail();
  const { getLabelById } = useLabel();
  const { getStateById } = useProjectState();
  // state
  const [modalMode, setModalMode] = useState<TTouchModalMode | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  // derived
  const issue = getIssueById(issueId);
  const state = getStateById(issue?.state_id);
  const labelNames = (issue?.label_ids ?? [])
    .map((id) => getLabelById(id)?.name)
    .filter((name): name is string => !!name);
  const phase: TControlPhase | null = issue
    ? getControlPhase({ labelNames, stateGroup: state?.group, stateName: state?.name })
    : null;

  const swrKey = phase && workspaceSlug && projectId ? `ISSUE_CONTROL_${issueId}` : null;
  const { data: control, mutate } = useSWR(swrKey, () =>
    issueControlService.retrieve(workspaceSlug, projectId, issueId)
  );

  if (!issue || !phase) return null;

  const saveControl = async (patch: TIssueControlUpdate) => {
    const previous = control;
    if (previous) void mutate({ ...previous, ...patch }, { revalidate: false });
    try {
      const next = await issueControlService.update(workspaceSlug, projectId, issueId, patch);
      void mutate(next, { revalidate: false });
    } catch (error) {
      void mutate(previous, { revalidate: false });
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: errorMessage(error, "Не удалось сохранить") });
    }
  };

  const touch = async (payload: TControlTouchPayload): Promise<boolean> => {
    try {
      const response = await issueControlService.touch(workspaceSlug, projectId, issueId, payload);
      rootIssueStore.issues.updateIssue(issueId, {
        target_date: response.issue.target_date,
        start_date: response.issue.start_date,
        state_id: response.issue.state_id ?? issue.state_id,
        estimate_point: response.issue.estimate_point,
        label_ids: response.issue.label_ids,
        description_html: response.issue.description_html ?? issue.description_html,
      });
      if (payload.deliverable && response.issue.description_html) {
        announceDescriptionReplaced(issueId, response.issue.description_html);
      }
      void mutate(response.control, { revalidate: false });
      void fetchActivities(workspaceSlug, projectId, issueId);
      void fetchComments(workspaceSlug, projectId, issueId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: payload.outcome === "assigned" ? "Задача поставлена" : "Касание записано",
      });
      return true;
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Ошибка",
        message: errorMessage(error, "Не удалось записать касание"),
      });
      return false;
    }
  };

  const handleModalSubmit = async (payload: TControlTouchPayload) => {
    if (await touch(payload)) setModalMode(null);
  };

  const handleSetupSubmit = async (payload: TControlTouchPayload) => {
    if (await touch(payload)) setIsSetupOpen(false);
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    const isAccepted = await touch({ outcome: "accepted" });
    setIsAccepting(false);
    // Accepted work of a Big task step → «Какой следующий шаг?» (the server
    // tells whether the parent is a Big task).
    if (isAccepted && issue.parent_id) {
      void promptNextStepAfterStepClosed(workspaceSlug, { id: issueId, name: issue.name });
    }
  };

  const streak = control?.no_progress_streak ?? 0;
  const nextTouch = formatRuDay(issue.target_date);
  const PhaseIcon = PHASE_ICONS[phase];
  // Once accepted (or cancelled) the labels stay, but there is nothing left to touch.
  const isClosed = state?.group === "completed" || state?.group === "cancelled";
  const canAct = !disabled && !isClosed;
  const due = isClosed ? null : getTouchDue(issue.target_date);

  return (
    <>
      <SidebarPropertyListItem icon={PhaseIcon} label="Этап">
        <span
          className={cn(
            "inline-flex h-6 items-center rounded-sm px-1.5 text-body-xs-medium",
            PHASE_CHIP_CLASSES[phase]
          )}
        >
          {PHASE_TITLES[phase]}
        </span>
        {streak >= RISK_STREAK && (
          <span
            className="inline-flex h-6 items-center gap-1 rounded-sm bg-danger-subtle px-1.5 text-caption-md-medium text-danger-primary"
            title="Касания без движения подряд"
          >
            <Flame className="size-3" />
            нет движения {streak} {pluralTimes(streak)} подряд
          </span>
        )}
      </SidebarPropertyListItem>

      <SidebarPropertyListItem icon={CalendarCheck2} label="Обещал к">
        <DateDropdown
          value={control?.promised_date ?? null}
          onChange={(date) =>
            void saveControl({ promised_date: date ? (renderFormattedPayloadDate(date) ?? null) : null })
          }
          disabled={disabled || !control}
          placeholder="Не назвал"
          buttonVariant="transparent-with-text"
          className="group w-full grow"
          buttonContainerClassName="w-full text-left h-7.5"
          buttonClassName={cn(labelClassName, !control?.promised_date && "text-placeholder")}
          hideIcon
        />
      </SidebarPropertyListItem>

      <SidebarPropertyListItem icon={Repeat} label="Частота">
        <CustomSelect
          value={control?.frequency}
          onChange={(value: TControlFrequency) => void saveControl({ frequency: value })}
          disabled={disabled || !control}
          customButton={
            <span
              className={cn("flex h-7.5 items-center rounded-sm px-2 hover:bg-layer-transparent-hover", labelClassName)}
            >
              {getFrequencyLabel(control?.frequency)}
            </span>
          }
          customButtonClassName="w-full text-left"
          className="w-full grow"
        >
          {FREQUENCY_OPTIONS.map((option) => (
            <CustomSelect.Option key={option.value} value={option.value}>
              {option.label}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      </SidebarPropertyListItem>

      <SidebarPropertyListItem icon={CalendarClock} label="Касание">
        <div className="flex w-full flex-wrap items-center justify-between gap-2 pl-2">
          <span
            className={cn(labelClassName, {
              "text-placeholder": !nextTouch,
              "text-danger-primary": due === "overdue",
              "text-accent-primary": due === "today",
              "text-primary": due === "soon" || due === "later",
            })}
            title="Следующее касание — дата задачи"
          >
            {nextTouch ?? "Не назначено"}
            {due === "overdue" && " · просрочено"}
            {due === "today" && " · сегодня"}
          </span>
          {canAct && phase === "setup" && (
            <Button
              variant="primary"
              size="base"
              prependIcon={<Handshake />}
              title="Объяснил задачу, договорились о сроке и результате"
              onClick={() => setIsSetupOpen(true)}
            >
              Поставил
            </Button>
          )}
          {canAct && phase === "check" && (
            <Button variant="primary" size="base" prependIcon={<Hand />} onClick={() => setModalMode("touch")}>
              Коснулся
            </Button>
          )}
          {canAct && phase === "acceptance" && (
            <span className="flex gap-1.5">
              <Button
                variant="primary"
                size="base"
                prependIcon={<CheckCheck />}
                loading={isAccepting}
                onClick={() => void handleAccept()}
              >
                Принял
              </Button>
              <Button
                variant="secondary"
                size="base"
                prependIcon={<Undo2 />}
                title="Вернул на доработку"
                onClick={() => setModalMode("return")}
              >
                Вернул
              </Button>
            </span>
          )}
        </div>
      </SidebarPropertyListItem>

      <ControlTouchModal
        isOpen={modalMode !== null}
        mode={modalMode ?? "touch"}
        issueName={issue.name}
        frequency={control?.frequency ?? "twice_week"}
        streak={control?.no_progress_streak ?? 0}
        promisedDate={control?.promised_date ?? null}
        onClose={() => setModalMode(null)}
        onSubmit={handleModalSubmit}
      />

      <ControlSetupModal
        isOpen={isSetupOpen}
        issueName={issue.name}
        frequency={control?.frequency ?? "twice_week"}
        onClose={() => setIsSetupOpen(false)}
        onSubmit={handleSetupSubmit}
      />
    </>
  );
});

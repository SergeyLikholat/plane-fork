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

import { observer } from "mobx-react";
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
import { CustomSelect } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { DateDropdown } from "@/components/dropdowns/date";
import type { TControlFrequency, TControlPhase } from "@/services/issue/issue-control.service";
import { RISK_STREAK, formatRuDay, getFrequencyLabel, getTouchDue, pluralTimes, FREQUENCY_OPTIONS } from "./helpers";
import { ControlPhaseChip } from "./phase-chip";
import { useControlActions } from "./use-control-actions";

const PHASE_ICONS: Record<TControlPhase, LucideIcon> = {
  setup: MessagesSquare,
  check: Eye,
  acceptance: CheckCheck,
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
  const {
    issue,
    phase,
    isClosed,
    canAct,
    control,
    isAccepting,
    saveControl,
    openTouch,
    openSetup,
    openReturn,
    accept,
    modals,
  } = useControlActions({ workspaceSlug, projectId, issueId, disabled });

  if (!issue || !phase) return null;

  const streak = control?.no_progress_streak ?? 0;
  const nextTouch = formatRuDay(issue.target_date);
  const PhaseIcon = PHASE_ICONS[phase];
  const due = isClosed ? null : getTouchDue(issue.target_date);

  return (
    <>
      <SidebarPropertyListItem icon={PhaseIcon} label="Этап">
        <ControlPhaseChip phase={phase} />
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
              onClick={openSetup}
            >
              Поставил
            </Button>
          )}
          {canAct && phase === "check" && (
            <Button variant="primary" size="base" prependIcon={<Hand />} onClick={openTouch}>
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
                onClick={() => void accept()}
              >
                Принял
              </Button>
              <Button
                variant="secondary"
                size="base"
                prependIcon={<Undo2 />}
                title="Вернул на доработку"
                onClick={openReturn}
              >
                Вернул
              </Button>
            </span>
          )}
        </div>
      </SidebarPropertyListItem>

      {modals}
    </>
  );
});

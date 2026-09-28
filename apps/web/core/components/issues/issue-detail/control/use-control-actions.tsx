/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Touch actions of a supervised work item — «Поставил», «Коснулся», «Принял»,
 * «Вернул» — shared by the control block (sidebar / peek) and the quick action
 * on list rows and kanban cards.
 *
 * The phase comes from labels and state, which are already in the issue. The
 * control resource (`/control/`, SWR key `ISSUE_CONTROL_<id>`) is loaded
 * eagerly by the control block and only on demand by the quick action, so a
 * list of 100+ rows makes no extra requests until a button is pressed.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { clone } from "lodash-es";
import useSWR from "swr";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue } from "@plane/types";
import { promptNextStepAfterStepClosed } from "@/components/issues/big-task/next-step-prompt";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useLabel } from "@/hooks/store/use-label";
import { useProjectState } from "@/hooks/store/use-project-state";
import { IssueControlService } from "@/services/issue/issue-control.service";
import type {
  TControlPhase,
  TControlTouchPayload,
  TIssueControl,
  TIssueControlUpdate,
} from "@/services/issue/issue-control.service";
import { announceDescriptionReplaced } from "./description-sync";
import { getControlPhase } from "./helpers";
import { ControlSetupModal } from "./setup-modal";
import { ControlTouchModal } from "./touch-modal";
import type { TTouchModalMode } from "./touch-modal";

const issueControlService = new IssueControlService();

export const getControlSwrKey = (issueId: string) => `ISSUE_CONTROL_${issueId}`;

export const controlErrorMessage = (error: unknown, fallback: string): string => {
  const data = error as { error?: string; detail?: string } | undefined;
  return data?.error ?? data?.detail ?? fallback;
};

type TUseControlActionsInput = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  /**
   * Load the control resource only while a dialog is open and mount the
   * dialogs only when opened (list rows, kanban cards).
   */
  lazy?: boolean;
  /** Called after a touch changed the issue in the store: `before` → `after`. */
  onIssueUpdated?: (after: TIssue, before: TIssue) => void;
};

export type TControlActions = TControlStatus & {
  control: TIssueControl | undefined;
  isAccepting: boolean;
  /** A dialog was requested and waits for the control resource. */
  isPreparing: boolean;
  saveControl: (patch: TIssueControlUpdate) => Promise<void>;
  openTouch: () => void;
  openSetup: () => void;
  openReturn: () => void;
  accept: () => Promise<void>;
  /** The dialogs; render once next to the buttons. */
  modals: ReactNode;
};

type TControlStatus = {
  issue: TIssue | undefined;
  phase: TControlPhase | null;
  /** Completed or cancelled: the labels stay, but there is nothing left to touch. */
  isClosed: boolean;
  /** Under control, open and editable: the touch buttons apply. */
  canAct: boolean;
};

/**
 * Phase of a work item from the stores (labels, state) — no requests. Call
 * inside an observer.
 */
export const useControlStatus = (issueId: string, disabled = false): TControlStatus => {
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getLabelById } = useLabel();
  const { getStateById } = useProjectState();
  const issue = getIssueById(issueId);
  const state = getStateById(issue?.state_id);
  const labelNames = (issue?.label_ids ?? [])
    .map((id) => getLabelById(id)?.name)
    .filter((name): name is string => !!name);
  const phase: TControlPhase | null = issue
    ? getControlPhase({ labelNames, stateGroup: state?.group, stateName: state?.name })
    : null;
  const isClosed = state?.group === "completed" || state?.group === "cancelled";
  return { issue, phase, isClosed, canAct: !!issue && !!phase && !disabled && !isClosed };
};

export const useControlActions = (input: TUseControlActionsInput): TControlActions => {
  const { workspaceSlug, projectId, issueId, disabled = false, lazy = false, onIssueUpdated } = input;
  // store hooks
  const { rootIssueStore, fetchActivities, fetchComments, getIsIssuePeeked } = useIssueDetail();
  const { issue, phase, isClosed, canAct } = useControlStatus(issueId, disabled);
  // state
  const [modalMode, setModalMode] = useState<TTouchModalMode | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  const isDialogRequested = modalMode !== null || isSetupOpen;
  const shouldFetch = !!phase && !!workspaceSlug && !!projectId && (!lazy || isDialogRequested);
  const {
    data: control,
    error: controlError,
    mutate,
  } = useSWR(shouldFetch ? getControlSwrKey(issueId) : null, () =>
    issueControlService.retrieve(workspaceSlug, projectId, issueId)
  );
  // Lazy dialogs wait for the control data (it proposes the next date); on a
  // failed load they open with the defaults — the touch itself still works.
  const isControlReady = !lazy || !!control || !!controlError;
  const isPreparing = lazy && isDialogRequested && !isControlReady;

  const saveControl = async (patch: TIssueControlUpdate) => {
    const previous = control;
    if (previous) void mutate({ ...previous, ...patch }, { revalidate: false });
    try {
      const next = await issueControlService.update(workspaceSlug, projectId, issueId, patch);
      void mutate(next, { revalidate: false });
    } catch (error) {
      void mutate(previous, { revalidate: false });
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Ошибка",
        message: controlErrorMessage(error, "Не удалось сохранить"),
      });
    }
  };

  const touch = async (payload: TControlTouchPayload): Promise<boolean> => {
    if (!issue) return false;
    try {
      const response = await issueControlService.touch(workspaceSlug, projectId, issueId, payload);
      const before = clone(issue);
      const changes: Partial<TIssue> = {
        target_date: response.issue.target_date,
        start_date: response.issue.start_date,
        state_id: response.issue.state_id ?? issue.state_id,
        estimate_point: response.issue.estimate_point,
        label_ids: response.issue.label_ids,
        description_html: response.issue.description_html ?? issue.description_html,
      };
      rootIssueStore.issues.updateIssue(issueId, changes);
      onIssueUpdated?.({ ...before, ...changes }, before);
      if (payload.deliverable && response.issue.description_html) {
        announceDescriptionReplaced(issueId, response.issue.description_html);
      }
      void mutate(response.control, { revalidate: false });
      // A list row has no open detail: refresh it only when it is on screen.
      if (!lazy || getIsIssuePeeked(issueId)) {
        void fetchActivities(workspaceSlug, projectId, issueId);
        void fetchComments(workspaceSlug, projectId, issueId);
      }
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: payload.outcome === "assigned" ? "Задача поставлена" : "Касание записано",
      });
      return true;
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Ошибка",
        message: controlErrorMessage(error, "Не удалось записать касание"),
      });
      return false;
    }
  };

  const promptNextStep = () => {
    if (issue?.parent_id) void promptNextStepAfterStepClosed(workspaceSlug, { id: issueId, name: issue.name });
  };

  const handleModalSubmit = async (payload: TControlTouchPayload) => {
    if (!(await touch(payload))) return;
    setModalMode(null);
    // «Вопрос закрыт» closes the step like «Принял» → ask for the next step.
    if (payload.outcome === "closed") promptNextStep();
  };

  const handleSetupSubmit = async (payload: TControlTouchPayload) => {
    if (await touch(payload)) setIsSetupOpen(false);
  };

  const accept = async () => {
    if (isAccepting) return;
    setIsAccepting(true);
    const isAccepted = await touch({ outcome: "accepted" });
    setIsAccepting(false);
    // Accepted work of a Big task step → «Какой следующий шаг?» (the server
    // tells whether the parent is a Big task).
    if (isAccepted) promptNextStep();
  };

  const isTouchOpen = modalMode !== null && isControlReady;
  const isSetupModalOpen = isSetupOpen && isControlReady;

  const modals =
    issue && phase ? (
      <>
        {(!lazy || isTouchOpen) && (
          <ControlTouchModal
            isOpen={isTouchOpen}
            mode={modalMode ?? "touch"}
            issueName={issue.name}
            frequency={control?.frequency ?? "twice_week"}
            streak={control?.no_progress_streak ?? 0}
            promisedDate={control?.promised_date ?? null}
            onClose={() => setModalMode(null)}
            onSubmit={handleModalSubmit}
          />
        )}
        {(!lazy || isSetupModalOpen) && (
          <ControlSetupModal
            isOpen={isSetupModalOpen}
            issueName={issue.name}
            frequency={control?.frequency ?? "twice_week"}
            onClose={() => setIsSetupOpen(false)}
            onSubmit={handleSetupSubmit}
          />
        )}
      </>
    ) : null;

  return {
    issue,
    phase,
    isClosed,
    canAct,
    control,
    isAccepting,
    isPreparing,
    saveControl,
    openTouch: () => setModalMode("touch"),
    openSetup: () => setIsSetupOpen(true),
    openReturn: () => setModalMode("return"),
    accept,
    modals,
  };
};

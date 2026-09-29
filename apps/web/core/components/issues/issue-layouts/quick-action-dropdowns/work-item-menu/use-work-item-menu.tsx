/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * The ⋯ menu of a work item: reads the stores, builds the entries
 * (`buildMenuGroups`) and owns the dialogs. Dialogs are mounted only while
 * open — a list renders this for every row.
 *
 * Requests happen only after the menu was opened once: the control resource
 * (current frequency), the project modules if not loaded, the Big task
 * context in views without it.
 */

import { useState } from "react";
import useSWR from "swr";
import type { EIssuesStoreType, TIssue } from "@plane/types";
import { copyTextToClipboard, copyUrlToClipboard, generateWorkItemLink } from "@plane/utils";
import { parseWeightValue } from "@/components/estimates/weight-icon";
import { nextStepPrompt } from "@/components/issues/big-task/next-step-prompt";
import { getControlSwrKey, useControlActions } from "@/components/issues/issue-detail/control/use-control-actions";
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useEstimate } from "@/hooks/store/estimates/use-estimate";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useModule } from "@/hooks/store/use-module";
import { useProjectState } from "@/hooks/store/use-project-state";
import { IssueControlService } from "@/services/issue/issue-control.service";
import { buildMenuGroups } from "./build-groups";
import type { TMenuActions, TMenuInput } from "./build-groups";
import {
  MENU_WEIGHTS,
  findBigTasksState,
  findControlState,
  findMaybeState,
  formatWorkItemKey,
  planReschedule,
} from "./helpers";
import { WorkItemMenuDialogs } from "./menu-dialogs";
import type { TMenuDialog } from "./menu-dialogs";
import type { TMenuEntry, TMenuGroup } from "./menu-entries";
import { toastDone, useMenuOperations } from "./use-menu-operations";
import { useWorkItemKind } from "./use-work-item-kind";

const issueControlService = new IssueControlService();

export type TUseWorkItemMenuInput = {
  issue: TIssue;
  projectIdentifier: string | undefined;
  /** Store the create / copy modal writes to (as the variant did before). */
  storeType: EIssuesStoreType;
  isEditingAllowed: boolean;
  isDeletingAllowed: boolean;
  isArchivingAllowed: boolean;
  handleUpdate?: (data: TIssue) => Promise<void>;
  handleDelete: () => Promise<void>;
  handleArchive?: () => Promise<void>;
  extraServiceEntries?: TMenuEntry[];
};

export type TWorkItemMenu = {
  groups: TMenuGroup[];
  /** Mount next to the ⋯ button. */
  dialogs: React.ReactNode;
  /** Call when the menu opens: loads what the entries need. */
  onMenuOpen: () => void;
  /** One of the menu's dialogs is open (the peek must not close on its clicks). */
  isDialogOpen: boolean;
};

/** «Вес» points of the project's active estimate: weight → point id. */
const useWeightPoints = (projectId: string | undefined) => {
  const { currentActiveEstimateIdByProjectId } = useProjectEstimates();
  const estimateId = projectId ? currentActiveEstimateIdByProjectId(projectId) : undefined;
  const { estimatePointIds, estimatePointById } = useEstimate(estimateId);
  return (estimatePointIds ?? [])
    .map((id) => estimatePointById(id))
    .map((point) => ({ pointId: point?.id, weight: parseWeightValue(point?.value) }))
    .filter((p): p is { pointId: string; weight: number } => !!p.pointId && p.weight !== null)
    .filter((p) => (MENU_WEIGHTS as readonly number[]).includes(p.weight));
};

export const useWorkItemMenu = (input: TUseWorkItemMenuInput): TWorkItemMenu => {
  const { issue, projectIdentifier } = input;
  const ops = useMenuOperations({ issue, handleUpdate: input.handleUpdate });
  const { workspaceSlug, projectId } = ops;
  const { getProjectStates } = useProjectState();
  const { setPeekIssue, getIsIssuePeeked } = useIssueDetail();
  const { getProjectModuleDetails, fetchModules } = useModule();
  const weights = useWeightPoints(projectId);
  const [dialog, setDialog] = useState<TMenuDialog | null>(null);
  const [hasOpened, setHasOpened] = useState(false);

  const kind = useWorkItemKind(workspaceSlug, issue, { hasOpened, isReadOnly: !input.isEditingAllowed });
  const control = useControlActions({
    workspaceSlug: workspaceSlug ?? "",
    projectId: projectId ?? "",
    issueId: issue.id,
    disabled: !input.isEditingAllowed,
    lazy: true,
    onIssueUpdated: ops.refileInLayout,
  });
  // Same SWR key as the control block: the current frequency, once the menu was opened.
  const controlKey = hasOpened && kind.controlPhase && workspaceSlug && projectId ? getControlSwrKey(issue.id) : null;
  const { data: controlData } = useSWR(controlKey, () =>
    issueControlService.retrieve(workspaceSlug ?? "", projectId ?? "", issue.id)
  );

  const states = getProjectStates(projectId);
  const bigTasksState = findBigTasksState(states);
  const maybeState = findMaybeState(states);
  const projectModules = projectId ? getProjectModuleDetails(projectId) : null;
  const workItemKey = formatWorkItemKey(projectIdentifier, issue.sequence_id);
  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId,
    issueId: issue.id,
    projectIdentifier,
    sequenceId: issue.sequence_id,
    isArchived: !!issue.archived_at,
  });

  const peek = (targetProjectId: string, issueId: string) => {
    if (!workspaceSlug || getIsIssuePeeked(issueId)) return;
    setPeekIssue({ workspaceSlug, projectId: targetProjectId, issueId });
  };

  const parent = kind.bigTaskParent;
  const actions: TMenuActions = {
    openNextStep: () =>
      workspaceSlug &&
      projectId &&
      nextStepPrompt.open({
        workspaceSlug,
        bigTask: { id: issue.id, projectId, name: issue.name, targetDate: issue.target_date ?? null },
      }),
    showSteps: () => projectId && peek(projectId, issue.id),
    completeBigTask: () => void ops.completeBigTask(),
    openParent: () => parent && peek(parent.projectId, parent.id),
    openNextStepForParent: () => parent && workspaceSlug && nextStepPrompt.open({ workspaceSlug, bigTask: parent }),
    openChildCreate: () => setDialog({ kind: "child" }),
    openHandover: () => setDialog({ kind: "person", mode: "handover" }),
    makeBigTask: () =>
      bigTasksState && void ops.update({ state_id: bigTasksState.id, estimate_point: null }, "Теперь это Big task"),
    openBigTaskPicker: () => setDialog({ kind: "big-task" }),
    touch: control.openTouch,
    setup: control.openSetup,
    accept: () => void control.accept(),
    returnWork: control.openReturn,
    openSwapPerson: () => setDialog({ kind: "person", mode: "swap" }),
    setFrequency: (value) => void ops.setFrequency(value),
    moveTo: ops.moveTo,
    openDatePicker: () => setDialog({ kind: "date" }),
    clearDate: () => void ops.update(planReschedule(issue, null)),
    setWeight: (pointId) => pointId !== issue.estimate_point && void ops.update({ estimate_point: pointId }),
    moveToMaybe: () => maybeState && void ops.update({ state_id: maybeState.id }, "Отложено в «Может быть»"),
    toggleModule: ops.toggleModule,
    copyLink: () =>
      void copyUrlToClipboard(workItemLink).then(() => toastDone("Ссылка скопирована", workItemKey ?? undefined)),
    copyKey: () =>
      workItemKey && void copyTextToClipboard(workItemKey).then(() => toastDone("Номер скопирован", workItemKey)),
    openInNewTab: () => window.open(workItemLink, "_blank"),
    makeCopy: () => setDialog({ kind: "copy" }),
    archive: () => setDialog({ kind: "archive" }),
    remove: () => setDialog({ kind: "delete" }),
  };

  const menuInput: TMenuInput = {
    kind,
    canEdit: input.isEditingAllowed,
    canDelete: input.isDeletingAllowed,
    canArchive: input.isArchivingAllowed && !!input.handleArchive && kind.isClosed,
    hasDate: !!issue.target_date,
    hasKey: !!workItemKey,
    hasBigTasksState: !!bigTasksState,
    hasControlState: !!findControlState(states),
    canMoveToMaybe: !!maybeState && maybeState.id !== issue.state_id,
    weights,
    currentWeight: weights.find((p) => p.pointId === issue.estimate_point)?.weight ?? null,
    modules:
      projectModules
        ?.filter((module) => !module.archived_at)
        .map((module) => ({
          id: module.id,
          name: module.name,
          isSelected: issue.module_ids?.includes(module.id) ?? false,
        })) ?? null,
    frequency: controlData?.frequency,
    extraServiceEntries: input.extraServiceEntries ?? [],
  };

  const onMenuOpen = () => {
    setHasOpened(true);
    if (workspaceSlug && projectId && !projectModules)
      fetchModules(workspaceSlug, projectId).catch((error: unknown) =>
        console.error("work-item-menu: failed to load modules", projectId, error)
      );
  };

  const dialogs = (
    <>
      {control.modals}
      <WorkItemMenuDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        issue={issue}
        projectIdentifier={projectIdentifier}
        storeType={input.storeType}
        handleDelete={input.handleDelete}
        handleArchive={input.handleArchive}
        ops={ops}
      />
    </>
  );

  return {
    groups: buildMenuGroups(menuInput, actions),
    dialogs,
    onMenuOpen,
    isDialogOpen: dialog !== null || control.isDialogOpen,
  };
};

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * What a work item is, for its ⋯ menu:
 * - a Big task — its state is «💼 Big Tasks»;
 * - a step — its parent is a Big task (list context → parent in the store →
 *   one `big-task-context` request once the menu was opened);
 * - under control — a control phase by labels and state;
 * - an own task otherwise. A step is also own or under control.
 * Call inside an observer.
 */

import type { TIssue } from "@plane/types";
import { useBigTaskContext, useBigTaskInfo } from "@/components/issues/big-task/use-big-task-context";
import type { TNextStepBigTask } from "@/components/issues/big-task/next-step-prompt";
import { useControlStatus } from "@/components/issues/issue-detail/control/use-control-actions";
import { isBigTaskStateName } from "@/components/issues/issue-layouts/state-accent";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
import type { TControlPhase } from "@/services/issue/issue-control.service";
import { CLOSED_STATE_GROUPS } from "./helpers";

export type TWorkItemKind = {
  isClosed: boolean;
  isBigTask: boolean;
  /** The Big task this item is a step of; null when it is not a step (or not known yet). */
  bigTaskParent: TNextStepBigTask | null;
  /** Control phase; null for work that is not supervised. */
  controlPhase: TControlPhase | null;
  /** Under control, open and editable: «Коснулся» / «Поставил» / «Принял» apply. */
  canControlAct: boolean;
};

export const useWorkItemKind = (
  workspaceSlug: string | undefined,
  issue: TIssue,
  options: { hasOpened: boolean; isReadOnly: boolean }
): TWorkItemKind => {
  const { getStateById } = useProjectState();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const state = getStateById(issue.state_id);
  const { parent: listParent } = useBigTaskInfo(issue.id);
  const { phase, canAct } = useControlStatus(issue.id, options.isReadOnly);

  const storeParent = issue.parent_id ? getIssueById(issue.parent_id) : undefined;
  const isStoreParentBig = !!storeParent && isBigTaskStateName(getStateById(storeParent.state_id)?.name);
  // Kanban and spreadsheet have no list context: ask the server, but only
  // after the menu was opened once.
  const shouldAsk = options.hasOpened && !!issue.parent_id && !listParent && !storeParent;
  const lazyContext = useBigTaskContext(workspaceSlug, shouldAsk ? [issue.id] : []);
  const lazyParent = lazyContext?.parents[issue.id];

  let bigTaskParent: TNextStepBigTask | null = null;
  if (listParent) {
    bigTaskParent = {
      id: listParent.id,
      projectId: listParent.project_id,
      name: listParent.name,
      targetDate: listParent.target_date,
    };
  } else if (storeParent && isStoreParentBig && storeParent.project_id) {
    bigTaskParent = {
      id: storeParent.id,
      projectId: storeParent.project_id,
      name: storeParent.name,
      targetDate: storeParent.target_date ?? null,
    };
  } else if (lazyParent?.is_big_task) {
    bigTaskParent = {
      id: lazyParent.id,
      projectId: lazyParent.project_id,
      name: lazyParent.name,
      targetDate: lazyParent.target_date,
    };
  }

  const isBigTask = isBigTaskStateName(state?.name);
  return {
    isClosed: CLOSED_STATE_GROUPS.has(state?.group ?? ""),
    isBigTask,
    bigTaskParent: isBigTask ? null : bigTaskParent,
    // A Big task is never supervised itself — its steps are.
    controlPhase: isBigTask ? null : phase,
    canControlAct: !isBigTask && canAct,
  };
};

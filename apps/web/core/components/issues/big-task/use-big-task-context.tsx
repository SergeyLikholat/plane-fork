/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Big tasks — one `big-task-context` request per view, not per row.
 *
 * A list root (or the week board) wraps its rows in `BigTaskContextProvider`
 * with the ids it shows; rows read their slice through `useBigTaskInfo`.
 * Only ids that can have something to show are sent: sub-issues (parent
 * caption) and items in the «💼 Big Tasks» state (progress, current step).
 */
import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import useSWR from "swr";
import type { TIssue } from "@plane/types";
import { BigTaskService } from "@/services/issue/big-task.service";
import type { TBigTaskContext, TBigTaskParent, TBigTaskSummary } from "@/services/issue/big-task.service";
import { bigTaskContextKey } from "./helpers";

const bigTaskService = new BigTaskService();
/** Same cap as the endpoint. */
const MAX_IDS = 500;

export const useBigTaskContext = (workspaceSlug: string | undefined, issueIds: string[]) => {
  const ids = issueIds.slice(0, MAX_IDS);
  const key = workspaceSlug && ids.length > 0 ? bigTaskContextKey(workspaceSlug, ids) : null;
  const { data } = useSWR(key, ([, slug, joined]) => bigTaskService.getContext(slug, joined.split(",")), {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  return data;
};

/** Every issue id of a (sub)grouped or flat list / kanban payload. */
export const flattenGroupedIssueIds = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((id): id is string => typeof id === "string");
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenGroupedIssueIds);
  return [];
};

/** Ids worth asking about: sub-issues and Big tasks. */
export const pickBigTaskContextIds = (issues: (TIssue | undefined)[], isBigTask: (issue: TIssue) => boolean) =>
  issues
    .filter((issue): issue is TIssue => !!issue && !issue.tempId && (!!issue.parent_id || isBigTask(issue)))
    .map((issue) => issue.id);

const BigTaskContext = createContext<TBigTaskContext | undefined>(undefined);

type ProviderProps = { workspaceSlug: string | undefined; issueIds: string[]; children: ReactNode };

export function BigTaskContextProvider({ workspaceSlug, issueIds, children }: ProviderProps) {
  const data = useBigTaskContext(workspaceSlug, issueIds);
  return <BigTaskContext.Provider value={data}>{children}</BigTaskContext.Provider>;
}

export type TBigTaskInfo = {
  /** Parent Big task of a step; undefined when the item is not a step. */
  parent?: TBigTaskParent;
  /** Progress when the item itself is a Big task. */
  summary?: TBigTaskSummary;
};

/** Slice of the nearest provider's data for one work item. */
export const useBigTaskInfo = (issueId: string | undefined): TBigTaskInfo => {
  const data = useContext(BigTaskContext);
  return useMemo(() => {
    if (!data || !issueId) return {};
    const parent = data.parents[issueId];
    return { parent: parent?.is_big_task ? parent : undefined, summary: data.big_tasks[issueId] };
  }, [data, issueId]);
};

/**
 * Week board — data hook: open work items, live refresh and date moves.
 *
 * Refresh points: mount, every 30 s while the tab is visible, window focus /
 * tab becoming visible, after each drop or weight change, and after the
 * «следующий шаг» dialog changed a Big task. The last good list is kept while
 * refetching so the board never flickers to empty.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue } from "@plane/types";
import { BIG_TASK_CHANGED_EVENT } from "@/components/issues/big-task/helpers";
import { StoreContext } from "@/lib/store-context";
import { fetchOpenProfileIssues, patchIssueDates, patchIssueWeight } from "./fetch-open-issues";
import type { TProfileViewType } from "./fetch-open-issues";

const POLL_INTERVAL_MS = 30_000;

type TDatePatch = Pick<Partial<TIssue>, "target_date" | "start_date">;

/** New dates for a move; clears start_date when it would end up after the deadline. */
export const buildDatePatch = (issue: TIssue, targetDate: string | null): TDatePatch => {
  const patch: TDatePatch = { target_date: targetDate };
  if (targetDate && issue.start_date && issue.start_date > targetDate) patch.start_date = null;
  return patch;
};

export const useWeekBoardData = (
  workspaceSlug: string | undefined,
  userId: string | undefined,
  viewType: TProfileViewType
) => {
  const rootStore = useContext(StoreContext);
  const [issues, setIssues] = useState<TIssue[] | undefined>(undefined);
  const [hasError, setHasError] = useState(false);
  // Bumped on every local mutation: a fetch that started before a move
  // would otherwise overwrite the optimistic state with stale dates.
  const mutationSeqRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!workspaceSlug || !userId) return;
    const seqAtStart = mutationSeqRef.current;
    try {
      const next = await fetchOpenProfileIssues(workspaceSlug, userId, viewType);
      if (seqAtStart !== mutationSeqRef.current) return;
      setIssues(next);
      setHasError(false);
    } catch (error) {
      console.error("week-board: failed to load work items", error);
      setHasError(true);
    }
  }, [workspaceSlug, userId, viewType]);

  // Scope change → drop the previous tab's list, then load.
  useEffect(() => {
    setIssues(undefined);
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, POLL_INTERVAL_MS);
    // A next step was set or a Big task closed from the «следующий шаг» dialog.
    const onBigTaskChanged = () => void refetch();
    window.addEventListener("focus", onVisible);
    window.addEventListener(BIG_TASK_CHANGED_EVENT, onBigTaskChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(BIG_TASK_CHANGED_EVENT, onBigTaskChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  /** Apply patches to local state and to the shared MobX issue map (if loaded there). */
  const applyLocal = useCallback(
    (patches: Map<string, Partial<TIssue>>) => {
      setIssues((prev) => prev?.map((it) => (patches.has(it.id) ? { ...it, ...patches.get(it.id) } : it)));
      patches.forEach((patch, id) => rootStore.issue.issues.updateIssue(id, patch));
    },
    [rootStore]
  );

  const moveIssues = useCallback(
    async (issueIds: string[], targetDate: string | null) => {
      if (!workspaceSlug || !issues) return;
      const moving = issues.filter(
        (it) => issueIds.includes(it.id) && it.project_id && (it.target_date ?? null) !== targetDate
      );
      if (moving.length === 0) return;

      mutationSeqRef.current += 1;
      const forward = new Map<string, Partial<TIssue>>();
      const rollback = new Map<string, Partial<TIssue>>();
      moving.forEach((it) => {
        forward.set(it.id, buildDatePatch(it, targetDate));
        rollback.set(it.id, { target_date: it.target_date, start_date: it.start_date });
      });
      applyLocal(forward);

      const results = await Promise.allSettled(
        moving.map((it) => patchIssueDates(workspaceSlug, it.project_id as string, it.id, forward.get(it.id) ?? {}))
      );
      const failed = new Map<string, Partial<TIssue>>();
      results.forEach((res, index) => {
        if (res.status === "rejected") {
          const id = moving[index].id;
          failed.set(id, rollback.get(id) ?? {});
          console.error("week-board: failed to move work item", id, res.reason);
        }
      });
      if (failed.size > 0) {
        applyLocal(failed);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Не удалось перенести",
          message:
            failed.size === moving.length
              ? "Изменения не сохранены, задачи вернулись на место."
              : `Не сохранено задач: ${failed.size} из ${moving.length}. Они вернулись на место.`,
        });
      }
      mutationSeqRef.current += 1;
      await refetch();
    },
    [workspaceSlug, issues, applyLocal, refetch]
  );

  /** Set the «Вес» point of one work item. Resolves false (after rollback + toast) on failure. */
  const setIssueWeight = useCallback(
    async (issueId: string, pointId: string | null): Promise<boolean> => {
      const issue = issues?.find((it) => it.id === issueId);
      if (!workspaceSlug || !issue?.project_id) return false;
      if ((issue.estimate_point ?? null) === pointId) return true;

      mutationSeqRef.current += 1;
      applyLocal(new Map([[issueId, { estimate_point: pointId }]]));
      let isSaved = true;
      try {
        await patchIssueWeight(workspaceSlug, issue.project_id, issueId, pointId);
      } catch (error) {
        isSaved = false;
        console.error("week-board: failed to set weight", issueId, error);
        applyLocal(new Map([[issueId, { estimate_point: issue.estimate_point ?? null }]]));
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Не удалось изменить вес",
          message: "Изменение не сохранено, вес вернулся к прежнему.",
        });
      }
      mutationSeqRef.current += 1;
      await refetch();
      return isSaved;
    },
    [workspaceSlug, issues, applyLocal, refetch]
  );

  return { issues, hasError, isLoading: issues === undefined && !hasError, refetch, moveIssues, setIssueWeight };
};

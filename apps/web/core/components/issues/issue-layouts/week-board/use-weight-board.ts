/**
 * Week board — weight confirmation wiring for the whole board: the context
 * value cards read, the «не подтверждено» count and its highlight toggle.
 */
import { useCallback, useMemo, useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue } from "@plane/types";
import type { TBoardModel } from "./use-board-model";
import { needsWeightConfirmation, useWeightConfirmations } from "./weight-confirmations";
import type { TWeekBoardWeightContext } from "./weight-confirmations";

type TSetIssueWeight = (issueId: string, pointId: string | null) => Promise<boolean>;

export const useWeightBoard = (
  workspaceSlug: string | undefined,
  issues: TIssue[] | undefined,
  model: TBoardModel,
  setIssueWeight: TSetIssueWeight
) => {
  const { isConfirmed, confirm } = useWeightConfirmations(workspaceSlug, issues);
  const [isHighlightOn, setIsHighlightOn] = useState(false);

  const pickWeight = useCallback(
    async (issue: TIssue, pointId: string) => {
      if ((issue.estimate_point ?? null) !== pointId) {
        // setIssueWeight rolls back and shows its own toast on failure.
        const isSaved = await setIssueWeight(issue.id, pointId);
        if (!isSaved) return;
      }
      try {
        await confirm(issue.id);
      } catch (error) {
        console.error("week-board: failed to confirm weight", issue.id, error);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Не удалось подтвердить вес",
          message: "Попробуйте ещё раз чуть позже.",
        });
      }
    },
    [setIssueWeight, confirm]
  );

  // Own tasks, briefings and acceptances only: checks sit in person groups, not in singles.
  const unconfirmedCount = [model.backlog, ...model.days]
    .flatMap((column) => column.summary.singles)
    .filter((entry) => needsWeightConfirmation(entry.info, isConfirmed(entry.item.issue.id))).length;
  // Everything confirmed → the toggle disappears; don't let it come back switched on.
  if (isHighlightOn && unconfirmedCount === 0 && issues !== undefined) setIsHighlightOn(false);
  const isHighlightingUnconfirmed = isHighlightOn && unconfirmedCount > 0;

  const contextValue = useMemo<TWeekBoardWeightContext>(
    () => ({ isConfirmed, pickWeight, isHighlightingUnconfirmed }),
    [isConfirmed, pickWeight, isHighlightingUnconfirmed]
  );

  return {
    contextValue,
    unconfirmedCount,
    isHighlightingUnconfirmed,
    toggleHighlightUnconfirmed: () => setIsHighlightOn((v) => !v),
  };
};

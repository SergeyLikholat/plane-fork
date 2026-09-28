/**
 * Calendar-week — weighs work items with the week-board rules (weights.ts).
 *
 * Mirrors `weighIssue` from week-board/use-board-model.ts: estimate point →
 * explicit weight, labels (with parent names) → person and `cal:*` default,
 * state → control kind. Kept here instead of refactoring the board so the
 * board's behaviour stays untouched.
 *
 * Must be called from an observer component: it reads MobX stores.
 */
import useSWR from "swr";
import type { TIssue } from "@plane/types";
import { WORKSPACE_ESTIMATES } from "@/constants/fetch-keys";
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useLabel } from "@/hooks/store/use-label";
import { useProjectState } from "@/hooks/store/use-project-state";
import { computeWeight } from "../week-board/weights";
import type { TWeightInfo, TWeightLabel } from "../week-board/weights";
import { isBigTaskStateName, isControlStateName } from "../state-accent";

export type TIssueWeigher = (issue: TIssue) => TWeightInfo;

const BIG_TASK_WEIGHT: TWeightInfo = { weight: 0, isImplicit: false, kind: "own", person: null };

export const useIssueWeigher = (workspaceSlug: string | undefined): TIssueWeigher => {
  const { labelMap } = useLabel();
  const { stateMap } = useProjectState();
  const { estimates, getWorkspaceEstimates } = useProjectEstimates();

  // Estimate points are per project and «Ваша работа» spans all projects.
  // Same SWR key as the week board, so the two layouts share one request.
  useSWR(
    workspaceSlug ? WORKSPACE_ESTIMATES(workspaceSlug) : null,
    workspaceSlug ? () => getWorkspaceEstimates(workspaceSlug) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const estimateValues = new Map<string, string>();
  Object.values(estimates ?? {}).forEach((estimate) => {
    Object.values(estimate.estimatePoints ?? {}).forEach((point) => {
      if (point.id && point.value) estimateValues.set(point.id, point.value);
    });
  });

  // Rebuilt every render on purpose: labels, states and estimates are MobX
  // observables read during render, so memoising on identity would go stale.
  return (issue: TIssue): TWeightInfo => {
    const labels = (issue.label_ids ?? []).map((id) => labelMap[id]).filter((l) => l !== undefined);
    const weightLabels: TWeightLabel[] = labels.map((l) => ({
      name: l.name ?? "",
      parentName: l.parent ? (labelMap[l.parent]?.name ?? null) : null,
    }));
    const state = issue.state_id ? stateMap[issue.state_id] : undefined;
    // A Big task adds no load: it is counted by its steps.
    if (isBigTaskStateName(state?.name)) return BIG_TASK_WEIGHT;
    return computeWeight({
      estimateValue: issue.estimate_point ? estimateValues.get(issue.estimate_point) : null,
      labels: weightLabels,
      stateGroup: state?.group ?? issue.state__group ?? null,
      isControlState: isControlStateName(state?.name),
    });
  };
};

/**
 * Week board — turns the flat list of open work items into columns:
 * «Не распределено» (no date or overdue) plus the seven days of the shown week.
 * Must be called from an observer component: it reads MobX stores for
 * labels, states, projects and estimate points.
 */
import type { TIssue } from "@plane/types";
import { toPayloadDate } from "../calendar-week/project-root";
import { isControlStateName } from "../state-accent";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useProjectEstimates } from "@/hooks/store/estimates";
import { computeWeight, summarizeDay } from "./weights";
import type { TDaySummary, TWeighed, TWeightLabel } from "./weights";

const CAL_LABEL_PREFIX = "cal:";
export const BACKLOG_KEY = "backlog";
const DAYS_IN_WEEK = 7;

export type TBoardIssue = {
  issue: TIssue;
  stripeColor: string | null;
  /** `YYYY-MM-DD` when the deadline has passed, else null. */
  overdueDate: string | null;
};

export type TBoardColumn = {
  key: string;
  /** Value written to `target_date` when dropping here. */
  targetDate: string | null;
  date: Date | null;
  isToday: boolean;
  isPast: boolean;
  count: number;
  summary: TDaySummary<TBoardIssue>;
};

export type TBoardModel = { backlog: TBoardColumn; days: TBoardColumn[] };

export const addDays = (d: Date, days: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

/** Backlog order: overdue first (oldest deadline on top), then heaviest. Sorts a copy (lib is ES2022, no toSorted). */
const sortBacklog = (items: TWeighed<TBoardIssue>[]): TWeighed<TBoardIssue>[] =>
  [...items].sort((a, b) => {
    const da = a.item.overdueDate;
    const db = b.item.overdueDate;
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return b.info.weight - a.info.weight;
  });

export const useBoardModel = (issues: TIssue[], weekStart: Date, today: Date): TBoardModel => {
  const { labelMap } = useLabel();
  const { stateMap } = useProjectState();
  const { getProjectById } = useProject();
  const { estimates } = useProjectEstimates();

  const estimateValues = new Map<string, string>();
  Object.values(estimates ?? {}).forEach((estimate) => {
    Object.values(estimate.estimatePoints ?? {}).forEach((point) => {
      if (point.id && point.value) estimateValues.set(point.id, point.value);
    });
  });

  const weighIssue = (issue: TIssue): TWeighed<TBoardIssue> => {
    const labels = (issue.label_ids ?? []).map((id) => labelMap[id]).filter((l) => l !== undefined);
    const weightLabels: TWeightLabel[] = labels.map((l) => ({
      name: l.name ?? "",
      parentName: l.parent ? (labelMap[l.parent]?.name ?? null) : null,
    }));
    const state = issue.state_id ? stateMap[issue.state_id] : undefined;
    const info = computeWeight({
      estimateValue: issue.estimate_point ? estimateValues.get(issue.estimate_point) : null,
      labels: weightLabels,
      stateGroup: state?.group ?? issue.state__group ?? null,
      isControlState: isControlStateName(state?.name),
    });
    const calColor = labels.find((l) => (l.name ?? "").startsWith(CAL_LABEL_PREFIX) && l.color)?.color;
    const projectColor = getProjectById(issue.project_id)?.logo_props?.icon?.color;
    return { item: { issue, stripeColor: calColor ?? projectColor ?? null, overdueDate: null }, info };
  };

  const todayKey = toPayloadDate(today);
  const dayKeys = Array.from({ length: DAYS_IN_WEEK }, (_, i) => toPayloadDate(addDays(weekStart, i)));
  const buckets = new Map<string, TWeighed<TBoardIssue>[]>(dayKeys.map((k) => [k, []]));
  const backlogItems: TWeighed<TBoardIssue>[] = [];

  issues.forEach((issue) => {
    const entry = weighIssue(issue);
    const target = issue.target_date ? issue.target_date.slice(0, 10) : null;
    if (!target || target < todayKey) {
      backlogItems.push({ ...entry, item: { ...entry.item, overdueDate: target } });
      return;
    }
    buckets.get(target)?.push(entry);
  });

  const backlogSummary = summarizeDay(backlogItems);
  const backlog: TBoardColumn = {
    key: BACKLOG_KEY,
    targetDate: null,
    date: null,
    isToday: false,
    isPast: false,
    count: backlogItems.length,
    summary: { ...backlogSummary, singles: sortBacklog(backlogSummary.singles) },
  };

  const days: TBoardColumn[] = dayKeys.map((key, i) => {
    const items = buckets.get(key) ?? [];
    return {
      key,
      targetDate: key,
      date: addDays(weekStart, i),
      isToday: key === todayKey,
      isPast: key < todayKey,
      count: items.length,
      summary: summarizeDay(items),
    };
  });

  return { backlog, days };
};

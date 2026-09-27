/**
 * Calendar-week — day load («Σ/13») shown in each day header.
 *
 * Uses the week-board rules: a day's load is summarizeDay() over every open
 * work item whose deadline (target_date) falls on it — all-day and timed
 * alike. Completed items are left out: the number answers "how much is still
 * on this day", same as the board, which only loads open work.
 */
import type { TIssue } from "@plane/types";
import { DAY_LIMIT, getLoadLevel, summarizeDay } from "../week-board/weights";
import type { TWeighed } from "../week-board/weights";
import type { TIssueWeigher } from "./use-issue-weigher";

/** Local `YYYY-MM-DD`, matching the date part of `target_date`. */
const localDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Load total per day, keyed by `Date.toDateString()` (the calendar's day key). */
export const computeDayLoads = (
  issues: TIssue[],
  days: Date[],
  weigh: TIssueWeigher,
  completedIds: Set<string>
): Map<string, number> => {
  const buckets = new Map<string, TWeighed<TIssue>[]>(days.map((d) => [localDateKey(d), []]));
  for (const issue of issues) {
    if (completedIds.has(issue.id) || !issue.target_date) continue;
    const bucket = buckets.get(issue.target_date.slice(0, 10));
    if (bucket) bucket.push({ item: issue, info: weigh(issue) });
  }
  return new Map(days.map((d) => [d.toDateString(), summarizeDay(buckets.get(localDateKey(d)) ?? []).total]));
};

type DayLoadBadgeProps = { total: number };

/** Small muted «Σ 9/13»; turns red when the day is over DAY_LIMIT. */
export function DayLoadBadge(props: DayLoadBadgeProps) {
  const { total } = props;
  const level = getLoadLevel(total);
  if (level === "empty") return null;
  const isOver = level === "over";
  return (
    <span
      className={`ml-1 text-[10px] tabular-nums ${isOver ? "font-medium text-danger-primary" : "font-normal text-tertiary"}`}
      title={
        isOver
          ? `Нагрузка ${total} при норме ${DAY_LIMIT} — день перегружен`
          : `Нагрузка ${total} из ${DAY_LIMIT} (открытые задачи со сроком на этот день)`
      }
    >
      Σ{total}/{DAY_LIMIT}
    </span>
  );
}

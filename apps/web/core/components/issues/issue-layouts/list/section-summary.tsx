/**
 * Right side of a list section header on «Моя работа»: how many work items
 * the section has for today (overdue included) and what they weigh against
 * the day limit — the same weights and limit as the week board and the day
 * calendar («13», or the value set by hand for this day).
 *
 * The meter shows the whole day: the section's own weight dark, the other
 * sections' weight light behind it, red once the day is over its limit.
 */
import { createContext, useContext } from "react";
import type { TIssue, TIssueMap } from "@plane/types";
import { cn, getDate } from "@plane/utils";
import type { TIssueWeigher } from "../calendar-week/use-issue-weigher";
import { summarizeDay } from "../week-board/weights";

type TDayLoad = {
  weigh: TIssueWeigher;
  limit: number;
  /** Weight of everything due by today on the page. */
  dayTotal: number;
};

export const DayLoadContext = createContext<TDayLoad | null>(null);
export const useDayLoad = (): TDayLoad | null => useContext(DayLoadContext);

const endOfToday = (now: Date = new Date()): number =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

/** Dated today or earlier: today's work, overdue included. */
export const isDueByToday = (issue: TIssue | undefined, limitMs: number = endOfToday()): issue is TIssue => {
  const date = getDate(issue?.target_date ?? undefined);
  return !!date && date.getTime() < limitMs;
};

/** Day load of the given items (checks of one person capped, as on the board). */
export const weighDueToday = (ids: string[], issuesMap: TIssueMap, weigh: TIssueWeigher) => {
  const limitMs = endOfToday();
  const due = ids.map((id) => issuesMap[id]).filter((issue) => isDueByToday(issue, limitMs));
  return { count: due.length, weight: summarizeDay(due.map((item) => ({ item, info: weigh(item) }))).total };
};

/** «1 задача», «3 задачи», «7 задач». */
const pluralTasks = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "задача";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "задачи";
  return "задач";
};

type Props = { count: number; weight: number; dayTotal: number; limit: number };

export function SectionLoadSummary({ count, weight, dayTotal, limit }: Props) {
  if (count === 0) return null;
  const isDayOver = dayTotal > limit;
  const scale = Math.max(limit, dayTotal, 1);
  const pct = (value: number) => `${Math.min(100, (value / scale) * 100)}%`;
  return (
    <span
      className="flex items-center gap-2 text-caption-md-medium whitespace-nowrap text-[#8A7C63] tabular-nums"
      title={`На сегодня с просроченными: ${count} ${pluralTasks(count)}, вес ${weight}. Весь день: ${dayTotal} из ${limit}.`}
    >
      {count} {pluralTasks(count)}
      {weight > 0 && (
        <>
          <span aria-hidden className="text-[#C9BCA4]">
            ·
          </span>
          <span className={cn(isDayOver && "text-danger-primary")}>
            вес {weight} из {limit}
          </span>
          <span aria-hidden className="relative h-[5px] w-20 overflow-hidden rounded-full bg-[#E3DACA]">
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full", isDayOver ? "bg-[#E8B4AA]" : "bg-[#D4C29F]")}
              style={{ width: pct(dayTotal) }}
            />
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full", isDayOver ? "bg-danger-primary" : "bg-[#B08A4A]")}
              style={{ width: pct(weight) }}
            />
          </span>
        </>
      )}
    </span>
  );
}

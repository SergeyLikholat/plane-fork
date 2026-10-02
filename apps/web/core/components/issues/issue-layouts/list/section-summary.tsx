/**
 * Right side of a list section header on «Моя работа»: how many work items
 * the section shows and what they weigh (week-board weights: checks of one
 * person capped). No limit here: the day limit is shared by all sections,
 * so the page-wide «вес N из 13» lives in the date navigator.
 */
import { createContext, useContext } from "react";
import type { TIssueMap } from "@plane/types";
import type { TIssueWeigher } from "../calendar-week/use-issue-weigher";
import { summarizeDay } from "../week-board/weights";

type TListWeigher = { weigh: TIssueWeigher };

export const ListWeigherContext = createContext<TListWeigher | null>(null);
export const useListWeigher = (): TListWeigher | null => useContext(ListWeigherContext);

/** Count and load of the given work items (as on the week board). */
export const weighIssues = (ids: string[], issuesMap: TIssueMap, weigh: TIssueWeigher) => {
  const issues = ids.map((id) => issuesMap[id]).filter((issue) => !!issue);
  return { count: issues.length, weight: summarizeDay(issues.map((item) => ({ item, info: weigh(item) }))).total };
};

/** «1 задача», «3 задачи», «7 задач». */
const pluralTasks = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "задача";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "задачи";
  return "задач";
};

type Props = { count: number; weight: number };

export function SectionLoadSummary({ count, weight }: Props) {
  if (count === 0) return null;
  return (
    <span
      className="flex items-center gap-1.5 text-caption-md-medium whitespace-nowrap text-[#8A7C63] tabular-nums"
      title="Вес — как на доске «Неделя»: проверки одного человека за день не больше 3"
    >
      {count} {pluralTasks(count)}
      {weight > 0 && (
        <>
          <span aria-hidden className="text-[#C9BCA4]">
            ·
          </span>
          вес {weight}
        </>
      )}
    </span>
  );
}

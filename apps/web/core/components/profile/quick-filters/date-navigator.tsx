/**
 * «Срок» navigator of «Моя работа»: ‹ period › with a «Сегодня» jump, a popup
 * with ready periods and a two-click range calendar, and the page's load
 * against the day limit. It drives the same `target_date` condition as the
 * «Срок» chip of the filter bar, so the two never disagree.
 *
 * Arrows move the period by its own length: a day by a day, a week by a week.
 */
import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Calendar } from "@plane/propel/calendar";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import type { TIssue } from "@plane/types";
import { COMPARISON_OPERATOR, EIssuesStoreType, EQUALITY_OPERATOR, LOGICAL_OPERATOR } from "@plane/types";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
import { useIssueWeigher } from "@/components/issues/issue-layouts/calendar-week/use-issue-weigher";
import { useDayCapacity } from "@/components/issues/issue-layouts/week-board/use-day-capacity";
import { summarizeDay } from "@/components/issues/issue-layouts/week-board/weights";
import { useIssues } from "@/hooks/store/use-issues";
import { useOutsideClickDetector } from "@plane/hooks";

type TRange = { from: Date; to: Date };

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date): boolean => startOfDay(a).getTime() === startOfDay(b).getTime();
const spanDays = (r: TRange): number =>
  Math.round((startOfDay(r.to).getTime() - startOfDay(r.from).getTime()) / DAY_MS) + 1;
const mondayOf = (d: Date): Date => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

type TPreset = { key: string; label: string; range: () => TRange };

const PRESETS: TPreset[] = [
  { key: "today", label: "Сегодня", range: () => ({ from: startOfDay(new Date()), to: startOfDay(new Date()) }) },
  { key: "tomorrow", label: "Завтра", range: () => ({ from: addDays(new Date(), 1), to: addDays(new Date(), 1) }) },
  { key: "yesterday", label: "Вчера", range: () => ({ from: addDays(new Date(), -1), to: addDays(new Date(), -1) }) },
  {
    key: "week",
    label: "Эта неделя",
    range: () => ({ from: mondayOf(new Date()), to: addDays(mondayOf(new Date()), 6) }),
  },
  {
    key: "next-week",
    label: "Следующая неделя",
    range: () => ({ from: addDays(mondayOf(new Date()), 7), to: addDays(mondayOf(new Date()), 13) }),
  },
  {
    key: "next-7",
    label: "7 дней вперёд",
    range: () => ({ from: startOfDay(new Date()), to: addDays(new Date(), 6) }),
  },
];

const isSameRange = (a: TRange, b: TRange): boolean => sameDay(a.from, b.from) && sameDay(a.to, b.to);

const shortDate = (d: Date): string => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
const weekdayDate = (d: Date): string =>
  d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });

/** «Сегодня · чт, 2 окт.», «Эта неделя», «28 сент. – 4 окт.». */
const describeRange = (r: TRange): string => {
  const preset = PRESETS.find((p) => isSameRange(p.range(), r));
  if (spanDays(r) === 1) return preset ? `${preset.label} · ${weekdayDate(r.from)}` : weekdayDate(r.from);
  if (preset) return preset.label;
  return `${shortDate(r.from)} – ${shortDate(r.to)}`;
};

/** The live «Срок» condition: a range, or an exact day read as a one-day range. */
const useDueDateCondition = (filter: IWorkItemFilterInstance) => {
  // Read through the computed (see use-condition-values.ts): actions are untracked.
  const condition = filter.allConditionsForDisplay.find(
    (c) =>
      c.property === "target_date" &&
      (c.operator === COMPARISON_OPERATOR.RANGE || c.operator === EQUALITY_OPERATOR.EXACT)
  );
  const values = condition?.value === undefined || condition?.value === null ? [] : [condition.value].flat();
  const from = getDate(String(values[0] ?? "")) ?? undefined;
  const to = getDate(String(values[1] ?? values[0] ?? "")) ?? undefined;
  const range: TRange | null = from && to ? { from, to } : null;

  const setRange = (next: TRange) => {
    const value = [renderFormattedPayloadDate(next.from), renderFormattedPayloadDate(next.to)].filter(
      (v): v is string => !!v
    );
    if (!condition) {
      filter.addCondition(
        LOGICAL_OPERATOR.AND,
        { property: "target_date", operator: COMPARISON_OPERATOR.RANGE, value },
        false
      );
      return;
    }
    if (condition.operator !== COMPARISON_OPERATOR.RANGE)
      filter.updateConditionOperator(condition.id, COMPARISON_OPERATOR.RANGE, false);
    filter.updateConditionValue(condition.id, value);
  };
  const clear = () => condition && filter.removeCondition(condition.id);

  return { range, setRange, clear };
};

/** Load of the page's work items, day by day, against the summed day limits. */
const usePageLoad = (range: TRange | null) => {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const weigh = useIssueWeigher(slug);
  const { limitFor } = useDayCapacity(slug);
  const { issues, issueMap } = useIssues(EIssuesStoreType.PROFILE);
  if (!range || spanDays(range) > 31) return null;
  const grouped = (issues?.groupedIssueIds ?? {}) as Record<string, unknown>;
  const ids = Object.values(grouped).flatMap((value) => (Array.isArray(value) ? (value as string[]) : []));
  const byDay = new Map<string, TIssue[]>();
  for (const id of new Set(ids)) {
    const issue = issueMap[id];
    if (!issue?.target_date) continue;
    const key = issue.target_date.slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), issue]);
  }
  let weight = 0;
  let limit = 0;
  for (let day = startOfDay(range.from); day <= range.to; day = addDays(day, 1)) {
    const items = byDay.get(renderFormattedPayloadDate(day) ?? "") ?? [];
    weight += summarizeDay(items.map((item) => ({ item, info: weigh(item) }))).total;
    limit += limitFor(day);
  }
  return { weight, limit };
};

type Props = { filter: IWorkItemFilterInstance };

export const DateNavigator = observer(function DateNavigator({ filter }: Props) {
  const { range, setRange, clear } = useDueDateCondition(filter);
  const load = usePageLoad(range);
  const [isOpen, setIsOpen] = useState(false);
  // First click of a custom range: its start, waiting for the end.
  const [pendingFrom, setPendingFrom] = useState<Date | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useOutsideClickDetector(ref, () => {
    setIsOpen(false);
    setPendingFrom(null);
  });

  const today = startOfDay(new Date());
  const isToday = !!range && spanDays(range) === 1 && sameDay(range.from, today);
  const shift = (direction: 1 | -1) => {
    const base = range ?? { from: today, to: today };
    const step = spanDays(base) * direction;
    setRange({ from: addDays(base.from, step), to: addDays(base.to, step) });
  };
  const pick = (next: TRange) => {
    setRange(next);
    setIsOpen(false);
    setPendingFrom(null);
  };
  const onDayClick = (day: Date) => {
    if (!pendingFrom) {
      setPendingFrom(startOfDay(day));
      return;
    }
    const [from, to] = day < pendingFrom ? [startOfDay(day), pendingFrom] : [pendingFrom, startOfDay(day)];
    pick({ from, to });
  };

  const isOver = !!load && load.weight > load.limit;
  const fill = load ? Math.min(100, (load.weight / Math.max(load.limit, 1)) * 100) : 0;
  const navButton =
    "grid size-7 shrink-0 place-items-center rounded-md text-icon-secondary transition-colors hover:bg-layer-1-hover hover:text-icon-primary";

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <div className="flex h-7 items-center rounded-md border border-[#E0D5C1] bg-surface-1">
        <button type="button" className={navButton} aria-label="Раньше" onClick={() => shift(-1)}>
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((v) => !v)}
          className="flex h-7 items-center gap-1.5 px-1.5 text-13 font-medium whitespace-nowrap text-primary hover:bg-layer-1-hover"
        >
          <CalendarDays className="size-3.5 text-icon-secondary" />
          {range ? describeRange(range) : "Любой срок"}
        </button>
        <button type="button" className={navButton} aria-label="Позже" onClick={() => shift(1)}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      {!isToday && (
        <button
          type="button"
          onClick={() => pick({ from: today, to: today })}
          className="h-7 rounded-md px-2 text-13 font-medium text-secondary transition-colors hover:bg-layer-1-hover hover:text-primary"
        >
          Сегодня
        </button>
      )}
      {load && load.limit > 0 && (
        <span
          className={cn(
            "ml-1 flex items-center gap-2 text-caption-md-medium whitespace-nowrap tabular-nums",
            isOver ? "text-danger-primary" : "text-[#8A7C63]"
          )}
          title="Вес задач на странице за выбранные дни против лимита этих дней (как на доске «Неделя»)"
        >
          вес {load.weight} из {load.limit}
          <span aria-hidden className="h-[5px] w-16 overflow-hidden rounded-full bg-[#E3DACA] max-md:hidden">
            <span
              className={cn("block h-full rounded-full", isOver ? "bg-danger-primary" : "bg-[#B08A4A]")}
              style={{ width: `${fill}%` }}
            />
          </span>
        </span>
      )}

      {isOpen && (
        <div
          data-prevent-outside-click
          className="absolute top-full left-0 z-30 mt-1 flex overflow-hidden rounded-lg border border-subtle-1 bg-surface-1 shadow-overlay-200 max-md:flex-col"
        >
          <div className="flex min-w-60 flex-col gap-0.5 border-subtle-1 p-1.5 md:border-r">
            {PRESETS.map((preset) => {
              const presetRange = preset.range();
              const isActive = !!range && isSameRange(presetRange, range);
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => pick(presetRange)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-13 whitespace-nowrap",
                    isActive ? "bg-[#2F3640] text-white" : "text-primary hover:bg-layer-1-hover"
                  )}
                >
                  {preset.label}
                  <span className={cn("text-11", isActive ? "text-white/70" : "text-tertiary")}>
                    {spanDays(presetRange) === 1
                      ? shortDate(presetRange.from)
                      : `${shortDate(presetRange.from)} – ${shortDate(presetRange.to)}`}
                  </span>
                </button>
              );
            })}
            {range && (
              <button
                type="button"
                onClick={() => {
                  clear();
                  setIsOpen(false);
                }}
                className="mt-1 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-13 text-tertiary hover:bg-layer-1-hover hover:text-secondary"
              >
                <X className="size-3" />
                Любой срок
              </button>
            )}
          </div>
          <div className="p-2">
            <div className="px-2 pb-1 text-11 text-tertiary">
              {pendingFrom
                ? `С ${shortDate(pendingFrom)} — выберите конец`
                : "Свой период: клик — начало, второй — конец"}
            </div>
            <Calendar
              className="p-1 text-12"
              mode="range"
              selected={pendingFrom ? { from: pendingFrom, to: undefined } : (range ?? undefined)}
              // Selection is ours (two clicks: start, end); RDP only highlights.
              onSelect={(_value, day) => day && onDayClick(day)}
              defaultMonth={range?.from ?? today}
              weekStartsOn={1}
              showOutsideDays
              fixedWeeks
            />
          </div>
        </div>
      )}
    </div>
  );
});

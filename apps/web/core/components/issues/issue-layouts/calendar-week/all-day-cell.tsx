/**
 * Calendar-week — one day's cell in the «весь день» strip.
 *
 * Two jobs:
 *   1. Height cap. The cell never grows past `maxHeightPx`; extra rows
 *      scroll inside it, so the hour grid below stays on screen even on a
 *      day with dozens of all-day items. Each cell scrolls on its own —
 *      a shared scroll container would put a scrollbar into the strip and
 *      shift its columns against the hour grid below.
 *   2. Control-check grouping. Checks («на контроле», «проверка») of one
 *      person collapse into a single chip «👁 Фурсов А. · 9» that opens on
 *      click. Grouping rules come from week-board/weights.ts.
 *
 * The cards themselves are rendered by the parent via `renderCard`, so drag,
 * peek and completion behave exactly like the rest of the calendar.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { TIssue } from "@plane/types";
import { summarizeDay } from "../week-board/weights";
import type { TWeighed } from "../week-board/weights";
import type { TIssueWeigher } from "./use-issue-weigher";

/** A person with fewer checks than this shows them as plain cards. */
const MIN_GROUP_SIZE = 2;
const CHECK_ICON = "👁";

type TEntry = { it: TIssue };

type TRow<E extends TEntry> =
  | { kind: "single"; key: string; entry: E; muted: boolean }
  | { kind: "group"; key: string; person: string; entries: E[]; muted: boolean };

/** Open rows first, then fully completed ones; order inside each part kept. */
const openFirst = <R extends { muted: boolean }>(rows: R[]): R[] => [
  ...rows.filter((r) => !r.muted),
  ...rows.filter((r) => r.muted),
];

const buildRows = <E extends TEntry>(entries: E[], weigh: TIssueWeigher, completedIds: Set<string>): TRow<E>[] => {
  const weighed: TWeighed<E>[] = entries.map((entry) => ({ item: entry, info: weigh(entry.it) }));
  const summary = summarizeDay(weighed);
  const single = (w: TWeighed<E>): TRow<E> => ({
    kind: "single",
    key: w.item.it.id,
    entry: w.item,
    muted: completedIds.has(w.item.it.id),
  });
  const singles: TRow<E>[] = summary.singles.map(single);
  const groups: TRow<E>[] = [];
  for (const group of summary.groups) {
    if (group.items.length < MIN_GROUP_SIZE) {
      singles.push(...group.items.map(single));
      continue;
    }
    const groupEntries = group.items.map((w) => w.item);
    groups.push({
      kind: "group",
      key: `group:${group.person}`,
      person: group.person,
      entries: groupEntries,
      muted: groupEntries.every((e) => completedIds.has(e.it.id)),
    });
  }
  return [...openFirst(singles), ...openFirst(groups)];
};

const rowTaskCount = <E extends TEntry>(row: TRow<E>): number => (row.kind === "group" ? row.entries.length : 1);

/**
 * Lets the wheel scroll the cell while it can, then hands the wheel back to
 * the calendar's own 2-hour snap scrolling (a native listener on the scroll
 * container that calls preventDefault, which would otherwise swallow it).
 */
const useInnerWheelScroll = (ref: React.RefObject<HTMLDivElement | null>) => {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollHeight <= el.clientHeight) return;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) e.stopPropagation();
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref]);
};

type AllDayCellProps<E extends TEntry> = {
  entries: E[];
  weigh: TIssueWeigher;
  completedIds: Set<string>;
  /** Rows (cards or chips) visible while the day is collapsed. */
  collapsedCap: number;
  expanded: boolean;
  onToggleExpand: () => void;
  minHeightPx: number;
  maxHeightPx: number;
  /** Room reserved on top for multi-day strips passing over this day. */
  paddingTopPx: number;
  rowHeightPx: number;
  isWeekend: boolean;
  renderCard: (entry: E) => ReactNode;
};

export function AllDayCell<E extends TEntry>(props: AllDayCellProps<E>) {
  const {
    entries,
    weigh,
    completedIds,
    collapsedCap,
    expanded,
    onToggleExpand,
    minHeightPx,
    maxHeightPx,
    paddingTopPx,
    rowHeightPx,
    isWeekend,
    renderCard,
  } = props;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set());
  useInnerWheelScroll(scrollRef);

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows = buildRows(entries, weigh, completedIds);
  const visibleRows = expanded ? rows : rows.slice(0, collapsedCap);
  const hiddenTaskCount = rows.slice(visibleRows.length).reduce((acc, r) => acc + rowTaskCount(r), 0);
  const linkClass =
    "block w-full shrink-0 rounded px-1 text-left text-[10px] text-tertiary hover:bg-layer-transparent-hover";

  return (
    <div
      ref={scrollRef}
      className={`vertical-scrollbar flex scrollbar-xs flex-col gap-0.5 overflow-y-auto overscroll-contain border-b border-l border-subtle-1 p-0.5 ${
        isWeekend ? "bg-surface-2" : "bg-surface-1"
      }`}
      style={{
        minHeight: minHeightPx,
        maxHeight: maxHeightPx,
        // Only days with a strip overhead get extra padding,
        // so single-day pills on strip-free days stay at top.
        paddingTop: paddingTopPx ? `${paddingTopPx + 2}px` : undefined,
      }}
    >
      {visibleRows.map((row) => {
        if (row.kind === "single")
          return (
            <div key={row.key} className="shrink-0">
              {renderCard(row.entry)}
            </div>
          );
        const isOpen = openGroups.has(row.key);
        return (
          <div key={row.key} className="flex shrink-0 flex-col gap-0.5">
            <button
              type="button"
              aria-expanded={isOpen}
              className={`focus-visible:ring-accent-primary flex w-full shrink-0 items-center gap-1 rounded border border-subtle-1 px-1 text-left text-[10px] text-secondary transition-colors hover:bg-layer-2-hover focus-visible:ring-1 focus-visible:outline-none ${
                isOpen ? "bg-layer-2" : "bg-layer-1"
              } ${row.muted ? "opacity-50" : ""}`}
              style={{ height: rowHeightPx, lineHeight: `${rowHeightPx - 2}px` }}
              title={`Проверки: ${row.person} — ${row.entries.length}`}
              onClick={() => toggleGroup(row.key)}
            >
              <ChevronRight
                className={`h-2.5 w-2.5 shrink-0 text-tertiary transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
              <span className="shrink-0">{CHECK_ICON}</span>
              <span className="min-w-0 flex-1 truncate">{row.person}</span>
              <span className="shrink-0 text-tertiary tabular-nums">· {row.entries.length}</span>
            </button>
            {isOpen && (
              <div className="ml-1.5 flex flex-col gap-0.5 border-l border-subtle-1 pl-1">
                {row.entries.map((entry) => (
                  <div key={entry.it.id} className="shrink-0">
                    {renderCard(entry)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {hiddenTaskCount > 0 && (
        <button type="button" className={linkClass} onClick={onToggleExpand}>
          + ещё {hiddenTaskCount}
        </button>
      )}
      {expanded && rows.length > collapsedCap && (
        <button type="button" className={linkClass} onClick={onToggleExpand}>
          свернуть
        </button>
      )}
    </div>
  );
}

/**
 * Week board — one column: header with the day's load against the limit,
 * then its cards. The column body scrolls on its own and is a drop target.
 */
import { useState } from "react";
import type { DragEvent } from "react";
import { observer } from "mobx-react";
import type { TIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { ColumnLoad } from "./column-load";
import type { THighlightProps } from "./column-load";
import type { TDayLimitActions } from "./day-limit-popover";
import { WeekBoardIssueCard } from "./issue-card";
import type { TCardDragHandlers } from "./issue-card";
import { WeekBoardPersonGroup } from "./person-group";
import type { TBoardColumn } from "./use-board-model";
import { isUnrated } from "./weights";

export type TColumnDropHandlers = {
  isDropTarget: boolean;
  canDrop: boolean;
  onDragOver: (column: TBoardColumn, event: DragEvent<HTMLElement>) => void;
  onDragLeave: (column: TBoardColumn, event: DragEvent<HTMLElement>) => void;
  onDrop: (column: TBoardColumn, event: DragEvent<HTMLElement>) => void;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Markers shown per header before the rest folds into «+N». */
const MAX_DEADLINE_MARKERS = 2;

/** «⚑ <Big task>» — final deadlines of Big tasks on this day; a click opens the peek. */
function BigTaskDeadlines(props: { issues: TIssue[]; isOverdue: boolean; onOpen: (issue: TIssue) => void }) {
  const { issues, isOverdue, onOpen } = props;
  if (issues.length === 0) return null;
  const shown = issues.slice(0, MAX_DEADLINE_MARKERS);
  const hidden = issues.slice(MAX_DEADLINE_MARKERS);
  const prefix = isOverdue ? "Финальный срок Big task прошёл" : "Финальный срок Big task";
  return (
    <ul className="mt-1 flex flex-col gap-px">
      {shown.map((issue) => (
        <li key={issue.id} className="min-w-0">
          <button
            type="button"
            onClick={() => onOpen(issue)}
            title={`${prefix}: ${issue.name}`}
            className={cn(
              "-mx-1 flex w-[calc(100%+0.5rem)] min-w-0 items-baseline gap-1 rounded-sm px-1 text-left text-11 leading-4 transition-colors hover:bg-layer-1-hover",
              isOverdue ? "text-danger-primary" : "text-secondary hover:text-primary"
            )}
          >
            <span aria-hidden className={cn("shrink-0", !isOverdue && "text-accent-primary")}>
              ⚑
            </span>
            <span className="min-w-0 truncate">{issue.name}</span>
          </button>
        </li>
      ))}
      {hidden.length > 0 && (
        <li className="text-10 text-tertiary" title={hidden.map((issue) => `⚑ ${issue.name}`).join("\n")}>
          ⚑ ещё {hidden.length}
        </li>
      )}
    </ul>
  );
}

type THeaderProps = {
  column: TBoardColumn;
  limitActions: TDayLimitActions;
  onOpen: (issue: TIssue) => void;
} & THighlightProps;

function ColumnHeader(props: THeaderProps) {
  const { column, limitActions, isHighlighting, onToggleHighlight, onOpen } = props;
  if (!column.date) {
    return (
      <>
        <div className="flex items-baseline justify-between gap-1">
          <span className="truncate text-13 font-semibold text-primary">Не распределено</span>
          <span className="text-11 text-tertiary tabular-nums">{column.count}</span>
        </div>
        <div className="mt-1.5 text-11 text-tertiary">
          без даты и просроченные · Σ <span className="tabular-nums">{column.summary.total}</span>
        </div>
        <BigTaskDeadlines issues={column.bigTaskDeadlines} isOverdue onOpen={onOpen} />
      </>
    );
  }
  const weekday = capitalize(column.date.toLocaleDateString("ru-RU", { weekday: "short" }));
  const dayMonth = column.date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return (
    <>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-13 font-semibold text-primary">{weekday}</span>
        {column.isToday ? (
          <span className="flex items-baseline gap-1 text-11">
            <span className="rounded-sm bg-layer-3 px-1 font-medium text-primary">сегодня</span>
            <span className="text-secondary">{dayMonth}</span>
          </span>
        ) : (
          <span className="text-11 text-tertiary">{dayMonth}</span>
        )}
      </div>
      <ColumnLoad
        column={column}
        date={column.date}
        limit={column.limit ?? 0}
        limitActions={limitActions}
        isHighlighting={isHighlighting}
        onToggleHighlight={onToggleHighlight}
      />
      <BigTaskDeadlines issues={column.bigTaskDeadlines} isOverdue={false} onOpen={onOpen} />
    </>
  );
}

type Props = TCardDragHandlers &
  TColumnDropHandlers & {
    column: TBoardColumn;
    limitActions: TDayLimitActions;
    onOpen: (issue: TIssue) => void;
  };

export const WeekBoardColumn = observer(function WeekBoardColumn(props: Props) {
  const {
    column,
    limitActions,
    onOpen,
    onDragStart,
    onDragEnd,
    isDropTarget,
    canDrop,
    onDragOver,
    onDragLeave,
    onDrop,
  } = props;
  const { singles, groups } = column.summary;
  const cardHandlers = { onOpen, onDragStart, onDragEnd };
  const [isHighlighting, setIsHighlighting] = useState(false);

  return (
    <section
      aria-label={column.date ? column.date.toLocaleDateString("ru-RU") : "Не распределено"}
      onDragOver={(e) => onDragOver(column, e)}
      onDragLeave={(e) => onDragLeave(column, e)}
      onDrop={(e) => onDrop(column, e)}
      className={cn(
        // Columns are sheets separated by the board's white gap, not by rules.
        "flex min-h-0 min-w-0 flex-col rounded-t-md transition-colors",
        // Today is a white sheet lifted over a grey stack: depth instead of colour.
        // Plane's raised-* shadows are ~5% / 1px and invisible here, hence the explicit one.
        // «Не распределено» — an inbox tray: fine diagonal hatch, not another grey.
        column.date === null &&
          "bg-layer-1 bg-[repeating-linear-gradient(135deg,rgb(41_47_61/0.06)_0_1px,transparent_1px_7px)]",
        column.date !== null && !column.isToday && "bg-canvas",
        column.isToday &&
          "relative z-[1] bg-surface-1 shadow-[0_0_0_1px_rgb(41_47_61/0.10),0_10px_28px_-8px_rgb(41_47_61/0.28)]",
        column.isPast && "opacity-60",
        isDropTarget && canDrop && "bg-layer-1-hover"
      )}
    >
      <header
        className={cn(
          "shrink-0 border-b px-2 pt-2 pb-1.5",
          "border-subtle-1",
          isDropTarget && canDrop && "border-accent-strong"
        )}
      >
        <ColumnHeader
          column={column}
          limitActions={limitActions}
          isHighlighting={isHighlighting && column.summary.unweightedCount > 0}
          onToggleHighlight={() => setIsHighlighting((v) => !v)}
          onOpen={onOpen}
        />
      </header>
      <div
        className={cn(
          "m-1 min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md border border-dashed border-transparent p-0.5",
          isDropTarget && canDrop && "border-accent-strong"
        )}
      >
        {singles.map((entry) => (
          <WeekBoardIssueCard
            key={entry.item.issue.id}
            entry={entry}
            isHighlighted={isHighlighting && isUnrated(entry.info)}
            {...cardHandlers}
          />
        ))}
        {groups.map((group) => (
          <WeekBoardPersonGroup key={group.person} group={group} {...cardHandlers} />
        ))}
      </div>
    </section>
  );
});

/**
 * Week board — one column: header with the day's load against the limit,
 * then its cards. The column body scrolls on its own and is a drop target.
 */
import type { DragEvent } from "react";
import { observer } from "mobx-react";
import type { TIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { WeekBoardIssueCard } from "./issue-card";
import type { TCardDragHandlers } from "./issue-card";
import { WeekBoardPersonGroup } from "./person-group";
import type { TBoardColumn } from "./use-board-model";
import { DAY_LIMIT, getLoadLevel } from "./weights";

export type TColumnDropHandlers = {
  isDropTarget: boolean;
  canDrop: boolean;
  onDragOver: (column: TBoardColumn, event: DragEvent<HTMLElement>) => void;
  onDragLeave: (column: TBoardColumn, event: DragEvent<HTMLElement>) => void;
  onDrop: (column: TBoardColumn, event: DragEvent<HTMLElement>) => void;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function DayLoad(props: { column: TBoardColumn }) {
  const { total, heavyCount, unweightedCount } = props.column.summary;
  const level = getLoadLevel(total);
  const fill = Math.min(100, (total / DAY_LIMIT) * 100);
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between gap-1 text-11">
        <span
          className={cn(
            "font-semibold tabular-nums",
            level === "empty" && "text-tertiary",
            level === "ok" && "text-success-primary",
            level === "over" && "text-danger-primary"
          )}
        >
          {unweightedCount > 0 && "≈"}
          {total}
          <span className="font-normal text-tertiary"> / {DAY_LIMIT}</span>
        </span>
        {heavyCount > 1 && (
          <span
            title="Тяжёлая задача (8+) — не больше одной в день"
            className="rounded-sm bg-warning-subtle px-1 font-medium text-warning-primary"
          >
            {heavyCount} тяжёлых
          </span>
        )}
      </div>
      <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-layer-3">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            level === "ok" && "bg-success-primary",
            level === "over" && "bg-danger-primary"
          )}
          style={{ width: `${fill}%` }}
        />
      </div>
      {unweightedCount > 0 && <div className="mt-0.5 text-10 text-tertiary">без веса: {unweightedCount}</div>}
    </div>
  );
}

function ColumnHeader(props: { column: TBoardColumn }) {
  const { column } = props;
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
      </>
    );
  }
  const weekday = capitalize(column.date.toLocaleDateString("ru-RU", { weekday: "short" }));
  const dayMonth = column.date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return (
    <>
      <div className="flex items-baseline justify-between gap-1">
        <span className={cn("text-13 font-semibold", column.isToday ? "text-accent-primary" : "text-primary")}>
          {weekday}
        </span>
        <span className={cn("text-11", column.isToday ? "font-medium text-accent-primary" : "text-tertiary")}>
          {column.isToday ? `сегодня, ${dayMonth}` : dayMonth}
        </span>
      </div>
      <DayLoad column={column} />
    </>
  );
}

type Props = TCardDragHandlers &
  TColumnDropHandlers & {
    column: TBoardColumn;
    onOpen: (issue: TIssue) => void;
  };

export const WeekBoardColumn = observer(function WeekBoardColumn(props: Props) {
  const { column, onOpen, onDragStart, onDragEnd, isDropTarget, canDrop, onDragOver, onDragLeave, onDrop } = props;
  const { singles, groups } = column.summary;
  const cardHandlers = { onOpen, onDragStart, onDragEnd };

  return (
    <section
      aria-label={column.date ? column.date.toLocaleDateString("ru-RU") : "Не распределено"}
      onDragOver={(e) => onDragOver(column, e)}
      onDragLeave={(e) => onDragLeave(column, e)}
      onDrop={(e) => onDrop(column, e)}
      className={cn(
        "flex min-h-0 min-w-0 flex-col border-r border-subtle transition-colors",
        column.date ? "bg-surface-1" : "bg-surface-2",
        column.isToday && "bg-accent-subtle",
        column.isPast && "opacity-60",
        isDropTarget && canDrop && "bg-layer-1-hover"
      )}
    >
      <header
        className={cn(
          "shrink-0 border-b px-2 pt-2 pb-1.5",
          column.isToday ? "border-accent-strong" : "border-subtle",
          isDropTarget && canDrop && "border-accent-strong"
        )}
      >
        <ColumnHeader column={column} />
      </header>
      <div
        className={cn(
          "m-1 min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md border border-dashed border-transparent p-0.5",
          isDropTarget && canDrop && "border-accent-strong"
        )}
      >
        {singles.map((entry) => (
          <WeekBoardIssueCard key={entry.item.issue.id} entry={entry} {...cardHandlers} />
        ))}
        {groups.map((group) => (
          <WeekBoardPersonGroup key={group.person} group={group} {...cardHandlers} />
        ))}
      </div>
    </section>
  );
});

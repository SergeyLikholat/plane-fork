/**
 * Week board — a day's load in the column header: «Σ / limit», the bar and
 * the «не оценено» toggle. The limit is a button that opens its editor.
 * A day off (limit 0) with nothing on it reads «выходной» instead of a bar.
 */
import type { ReactNode } from "react";
import { cn } from "@plane/utils";
import { DayLimitPopover } from "./day-limit-popover";
import type { TDayLimitActions } from "./day-limit-popover";
import type { TBoardColumn } from "./use-board-model";
import { getLoadLevel } from "./weights";

export type THighlightProps = { isHighlighting: boolean; onToggleHighlight: () => void };

const OverrideMark = () => (
  <span aria-hidden className="ml-0.5 size-1.5 shrink-0 self-center rounded-full bg-accent-primary" />
);

type Props = THighlightProps & { column: TBoardColumn; date: Date; limit: number; limitActions: TDayLimitActions };

export function ColumnLoad(props: Props) {
  const { column, date, limit, limitActions, isHighlighting, onToggleHighlight } = props;
  const { total, heavyCount, unweightedCount } = column.summary;
  const level = getLoadLevel(total, limit);
  const isDayOff = limit === 0 && total === 0;
  const fill = limit > 0 ? Math.min(100, (total / limit) * 100) : 100;
  const overrideNote = column.hasLimitOverride ? ", исключение для этого дня" : "";
  const triggerLabel = `Лимит дня: ${isDayOff ? "выходной" : limit}${overrideNote}. Нажмите, чтобы изменить`;
  const limitPopover = (content: ReactNode, className?: string) => (
    <DayLimitPopover
      date={date}
      limit={limit}
      hasOverride={column.hasLimitOverride}
      actions={limitActions}
      triggerLabel={triggerLabel}
      triggerClassName={className}
    >
      {content}
      {column.hasLimitOverride && <OverrideMark />}
    </DayLimitPopover>
  );

  if (isDayOff) {
    return <div className="mt-1.5 text-11">{limitPopover("выходной", "-ml-0.5 italic text-tertiary")}</div>;
  }

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between gap-1 text-11">
        <span
          className={cn(
            "flex items-baseline font-semibold tabular-nums",
            level === "empty" && "text-tertiary",
            level === "ok" && "text-success-primary",
            level === "over" && "text-danger-primary"
          )}
        >
          {unweightedCount > 0 && "≈"}
          {total}
          <span className="font-normal ml-0.5 text-tertiary">{limitPopover(`/ ${limit}`)}</span>
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
          style={{ width: `${level === "empty" ? 0 : fill}%` }}
        />
      </div>
      {unweightedCount > 0 && (
        <button
          type="button"
          onClick={onToggleHighlight}
          aria-pressed={isHighlighting}
          title="Вес угадан по метке, оценка в задаче не проставлена. Нажмите, чтобы подсветить эти задачи"
          className={cn(
            "mt-0.5 rounded-sm px-1 text-10 transition-colors",
            isHighlighting
              ? "bg-accent-subtle font-medium text-accent-primary"
              : "-ml-1 text-tertiary hover:bg-layer-1-hover hover:text-secondary"
          )}
        >
          не оценено: {unweightedCount}
        </button>
      )}
    </div>
  );
}

/**
 * Week board — compact work-item card: colour rail, title, weight picker.
 * Native HTML5 drag; a click (no drag) opens the standard peek overview.
 */
import type { DragEvent } from "react";
import { observer } from "mobx-react";
import type { TIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { useBigTaskInfo } from "@/components/issues/big-task/use-big-task-context";
import { stripTimeNotation } from "../calendar-week/project-root";
import type { TBoardIssue } from "./use-board-model";
import { RESCHEDULE_ALERT_AFTER, useRescheduleCount } from "./reschedule-counts";
import { needsWeightConfirmation, useWeekBoardWeight } from "./weight-confirmations";
import { WeekBoardWeightPicker } from "./weight-picker";
import type { TWeighed, TWorkKind } from "./weights";

const PHASE_ICON: Record<TWorkKind, string | null> = { own: null, setup: "🗣", check: "👁", acceptance: "✅" };

/** "2026-09-25" → "25.09". */
const shortDate = (isoDate: string): string => `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}`;

export type TCardDragHandlers = {
  onDragStart: (issueIds: string[], event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

type Props = TCardDragHandlers & {
  entry: TWeighed<TBoardIssue>;
  onOpen: (issue: TIssue) => void;
  /** Rendered inside a person group — flatter look, no phase icon. */
  nested?: boolean;
  /** Outlined while the column's «не оценено» filter is on (the board-wide «не подтверждено» one is read from context). */
  isHighlighted?: boolean;
};

export const WeekBoardIssueCard = observer(function WeekBoardIssueCard(props: Props) {
  const { entry, onOpen, onDragStart, onDragEnd, nested = false, isHighlighted = false } = props;
  const { issue, stripeColor, overdueDate } = entry.item;
  const { kind } = entry.info;
  const phaseIcon = nested ? null : PHASE_ICON[kind];
  const title = stripTimeNotation(issue.name ?? "") || issue.name;
  const rescheduleCount = useRescheduleCount(issue.id);
  const { parent: bigTask } = useBigTaskInfo(issue.id);
  const isStuck = rescheduleCount > RESCHEDULE_ALERT_AFTER;
  const { isConfirmed, isHighlightingUnconfirmed } = useWeekBoardWeight();
  const isMarked =
    isHighlighted || (isHighlightingUnconfirmed && needsWeightConfirmation(entry.info, isConfirmed(issue.id)));

  return (
    // A div, not a <button>: Firefox does not start native drags from buttons.
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        // Nested inside a draggable person group: the card moves alone.
        e.stopPropagation();
        onDragStart([issue.id], e);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(issue)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(issue);
        }
      }}
      className={cn(
        "group/card relative flex cursor-pointer items-start gap-1.5 rounded-md border py-1 pr-1 pl-2.5 text-12 leading-snug transition-colors",
        "outline-none focus-visible:border-accent-strong active:cursor-grabbing",
        nested
          ? "border-transparent bg-transparent hover:bg-layer-1-hover"
          : "border-subtle bg-surface-1 shadow-raised-100 hover:border-strong hover:bg-layer-1-hover",
        isMarked && "border-accent-strong bg-accent-subtle"
      )}
    >
      <span
        aria-hidden
        className={cn("absolute top-1 bottom-1 left-1 w-[3px] rounded-full", !stripeColor && "bg-layer-3")}
        style={stripeColor ? { backgroundColor: stripeColor } : undefined}
      />
      <div className="min-w-0 flex-1">
        {bigTask && (
          <div className="truncate text-10 leading-4 text-tertiary" title={`Шаг Big task «${bigTask.name}»`}>
            ↳ 💼 {bigTask.name}
          </div>
        )}
        <div className={cn("line-clamp-2 break-words", kind === "own" ? "text-primary" : "text-secondary")}>
          {phaseIcon && <span className="mr-1">{phaseIcon}</span>}
          {title}
        </div>
        {overdueDate && (
          <div className="mt-0.5 text-11 font-medium text-danger-primary">просрочено {shortDate(overdueDate)}</div>
        )}
        {isStuck && (
          <div
            className="mt-0.5 text-11 font-medium text-warning-primary"
            title="Срок переносили несколько раз: разбить на шаги или отложить в «Может быть»"
          >
            ↻ перенос {rescheduleCount} раз
          </div>
        )}
      </div>
      <WeekBoardWeightPicker issue={issue} info={entry.info} />
    </div>
  );
});

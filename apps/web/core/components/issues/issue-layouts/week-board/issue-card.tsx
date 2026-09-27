/**
 * Week board — compact work-item card: colour rail, title, weight chip.
 * Native HTML5 drag; a click (no drag) opens the standard peek overview.
 */
import type { DragEvent } from "react";
import { observer } from "mobx-react";
import type { TIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { stripTimeNotation } from "../calendar-week/project-root";
import type { TBoardIssue } from "./use-board-model";
import { HEAVY_THRESHOLD } from "./weights";
import type { TWeighed, TWorkKind } from "./weights";

const PHASE_ICON: Record<TWorkKind, string | null> = { own: null, check: "👁", acceptance: "✅" };

/** "2026-09-25" → "25.09". */
const shortDate = (isoDate: string): string => `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}`;

export type TCardDragHandlers = {
  onDragStart: (issueIds: string[], event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

type WeightChipProps = { weight: number; isImplicit: boolean; title?: string; className?: string };

export function WeightChip(props: WeightChipProps) {
  const { weight, isImplicit, title, className } = props;
  const isHeavy = weight >= HEAVY_THRESHOLD;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm px-1 text-11 font-semibold tabular-nums",
        isHeavy ? "bg-warning-subtle text-warning-primary" : "bg-layer-2 text-primary",
        className
      )}
    >
      {isImplicit && <span className="font-normal text-tertiary">~</span>}
      {weight}
    </span>
  );
}

type Props = TCardDragHandlers & {
  entry: TWeighed<TBoardIssue>;
  onOpen: (issue: TIssue) => void;
  /** Rendered inside a person group — flatter look, no phase icon. */
  nested?: boolean;
};

export const WeekBoardIssueCard = observer(function WeekBoardIssueCard(props: Props) {
  const { entry, onOpen, onDragStart, onDragEnd, nested = false } = props;
  const { issue, stripeColor, overdueDate } = entry.item;
  const { weight, isImplicit, kind } = entry.info;
  const phaseIcon = nested ? null : PHASE_ICON[kind];
  const title = stripTimeNotation(issue.name ?? "") || issue.name;

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
          : "border-subtle bg-surface-1 shadow-raised-100 hover:border-strong hover:bg-layer-1-hover"
      )}
    >
      <span
        aria-hidden
        className={cn("absolute top-1 bottom-1 left-1 w-[3px] rounded-full", !stripeColor && "bg-layer-3")}
        style={stripeColor ? { backgroundColor: stripeColor } : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className={cn("line-clamp-2 break-words", kind === "own" ? "text-primary" : "text-secondary")}>
          {phaseIcon && <span className="mr-1">{phaseIcon}</span>}
          {title}
        </div>
        {overdueDate && (
          <div className="mt-0.5 text-11 font-medium text-danger-primary">просрочено {shortDate(overdueDate)}</div>
        )}
      </div>
      <WeightChip
        weight={weight}
        isImplicit={isImplicit}
        title={isImplicit ? "Вес по умолчанию — оценка не проставлена" : "Вес из оценки"}
      />
    </div>
  );
});

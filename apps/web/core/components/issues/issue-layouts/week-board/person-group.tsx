/**
 * Week board — checks of one person on one day, collapsed into a single
 * block whose cost is capped (see GROUP_COST_CAP). Dragging the header moves
 * every check in the group; expanded cards can still be dragged one by one.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { ChevronRight } from "lucide-react";
import type { TIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { WeekBoardIssueCard, WeightChip } from "./issue-card";
import type { TCardDragHandlers } from "./issue-card";
import type { TBoardIssue } from "./use-board-model";
import type { TPersonGroup } from "./weights";

type Props = TCardDragHandlers & {
  group: TPersonGroup<TBoardIssue>;
  onOpen: (issue: TIssue) => void;
};

export const WeekBoardPersonGroup = observer(function WeekBoardPersonGroup(props: Props) {
  const { group, onOpen, onDragStart, onDragEnd } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const issueIds = group.items.map((e) => e.item.issue.id);
  const hasOverdue = group.items.some((e) => e.item.overdueDate);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(issueIds, e)}
      onDragEnd={onDragEnd}
      className="rounded-md border border-dashed border-subtle-1 bg-layer-1 transition-colors hover:border-strong"
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((v) => !v)}
        title={`Проверок: ${group.items.length}, суммарно ${group.rawSum}. В нагрузку дня идёт ${group.cost}.`}
        className="flex w-full items-center gap-1 rounded-md py-1 pr-1 pl-1 text-left text-12 outline-none focus-visible:bg-layer-1-hover"
      >
        <ChevronRight
          className={cn("size-3 shrink-0 text-tertiary transition-transform", isExpanded && "rotate-90")}
          strokeWidth={2}
        />
        <span className="min-w-0 flex-1 truncate text-secondary">
          <span className="mr-1">👁</span>
          <span className="font-medium text-primary">{group.person}</span>
          <span className="text-tertiary"> · {group.rawSum}</span>
          {hasOverdue && <span className="ml-1 text-danger-primary">!</span>}
        </span>
        <WeightChip weight={group.cost} isImplicit={false} />
      </button>
      {isExpanded && (
        <div className="space-y-0.5 border-t border-subtle px-0.5 py-0.5">
          {group.items.map((entry) => (
            <WeekBoardIssueCard
              key={entry.item.issue.id}
              entry={entry}
              onOpen={onOpen}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
});

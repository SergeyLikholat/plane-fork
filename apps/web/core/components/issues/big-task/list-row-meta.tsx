/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Big task lines of a list row («Ваша работа», project lists).
 *
 * - The parent caption of a step is a chip of its own, a direct child of the
 *   row (list/block.tsx): a line above the title in the stacked grid and on
 *   phones, before the title in the one-line layout. It never sits inside
 *   the title, so the checkbox and key stay level with the title's first line.
 * - The summary of a Big task renders INSIDE the title `<p>` (phrasing
 *   content only), a line under the title.
 * Clicks never reach the row link: they open the parent / step in the peek.
 */

import type { MouseEvent } from "react";
import { Briefcase, TriangleAlert } from "lucide-react";
import { cn } from "@plane/utils";
import type { TBigTaskParent, TBigTaskSummary } from "@/services/issue/big-task.service";
import { describeStep, formatShortDay } from "./helpers";

/** Click handler that keeps the click away from the row / card link. */
export const stop = (handler: () => void) => (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  handler();
};

type CaptionProps = { parent: TBigTaskParent; onOpen: (parent: TBigTaskParent) => void; className?: string };

const CAPTION_CHIP_CLASS = [
  "inline-flex w-fit max-w-full items-center gap-1 rounded-md border px-1.5 py-px text-left text-caption-md-medium",
  "border-[#E4DDF5] bg-[#F3F0FA] text-[#5B4A8A] transition-colors hover:bg-[#ECE6F8]",
  "focus-visible:ring-1 focus-visible:ring-[#7c3aed] focus-visible:outline-none",
].join(" ");

/**
 * «💼 <Big task>» chip above the title of a step. Violet like the «💼 Big
 * Tasks» column (#7c3aed), light enough not to compete with the title.
 */
export function BigTaskParentCaption({ parent, onOpen, className }: CaptionProps) {
  return (
    <button
      type="button"
      // Kanban cards are draggable: a press on the chip must not start a drag.
      data-no-card-drag=""
      title={`Шаг Big task «${parent.name}» — открыть`}
      onClick={stop(() => onOpen(parent))}
      // Joined by hand, not `cn`: tailwind-merge reads `text-caption-md-medium`
      // and `text-[#5B4A8A]` as two colours and would drop the type style.
      className={`${CAPTION_CHIP_CLASS} ${className ?? ""}`}
    >
      <Briefcase className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{parent.name}</span>
    </button>
  );
}

type SummaryProps = {
  summary: TBigTaskSummary;
  /** Final deadline of the Big task (its own target_date). */
  deadline: string | null | undefined;
  isClosed: boolean;
  onOpenStep: (stepId: string) => void;
};

/** «→ сейчас: <шаг> · <кто> · <когда>» or «⚠ нет следующего шага», plus progress and the final deadline. */
export function BigTaskRowSummary({ summary, deadline, isClosed, onOpenStep }: SummaryProps) {
  const step = summary.current_step;
  const deadlineLabel = formatShortDay(deadline);
  return (
    <span
      className={cn(
        "mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-caption-md-regular font-regular text-secondary",
        "@min-[100rem]/issue:mt-0 @min-[100rem]/issue:ml-3 @min-[100rem]/issue:inline-flex @min-[100rem]/issue:flex-nowrap @min-[100rem]/issue:align-bottom"
      )}
    >
      {step ? (
        <button
          type="button"
          title="Текущий шаг — открыть"
          onClick={stop(() => onOpenStep(step.id))}
          className="min-w-0 truncate rounded-sm text-left hover:text-primary hover:underline"
        >
          <span className="text-tertiary">→ сейчас: </span>
          {describeStep(step)}
        </button>
      ) : (
        !isClosed && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-warning-subtle px-1.5 text-caption-md-medium text-warning-primary">
            <TriangleAlert className="size-3" />
            нет следующего шага
          </span>
        )
      )}
      <span className="shrink-0 text-tertiary tabular-nums">{summary.done} готово</span>
      {deadlineLabel && (
        <span className="shrink-0 text-tertiary" title="Финальный срок Big task">
          ⚑ {deadlineLabel}
        </span>
      )}
    </span>
  );
}

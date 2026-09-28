/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Big task lines of a list row («Ваша работа», project lists).
 *
 * Both render INSIDE the row's title `<p>` (phrasing content only: spans and
 * buttons), so the row's container-query grid (list/block.tsx) keeps its
 * cells. How they flow in each layout of the row:
 * - stacked grid (md+, row < 100rem): the caption is a line above the title,
 *   the summary a line under it;
 * - phone: the caption runs inline before the title, the summary below;
 * - one-line (row ≥ 100rem): both inline, the caption capped in width.
 * Clicks never reach the row link: they open the parent / step in the peek.
 */

import type { MouseEvent } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@plane/utils";
import type { TBigTaskParent, TBigTaskSummary } from "@/services/issue/big-task.service";
import { describeStep, formatShortDay } from "./helpers";

const stop = (handler: () => void) => (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  handler();
};

type CaptionProps = { parent: TBigTaskParent; onOpen: (parent: TBigTaskParent) => void };

/** «↳ 💼 <Big task>» above the title of a step. */
export function BigTaskParentCaption({ parent, onOpen }: CaptionProps) {
  return (
    <button
      type="button"
      title={`Шаг Big task «${parent.name}» — открыть`}
      onClick={stop(() => onOpen(parent))}
      className={cn(
        "mb-0.5 block w-fit max-w-full truncate rounded-sm text-left text-caption-md-regular font-regular text-tertiary transition-colors hover:text-secondary hover:underline",
        "max-md:mr-1.5 max-md:mb-0 max-md:inline",
        "@min-[100rem]/issue:mr-2 @min-[100rem]/issue:mb-0 @min-[100rem]/issue:inline-block @min-[100rem]/issue:max-w-[16rem] @min-[100rem]/issue:align-bottom"
      )}
    >
      ↳ 💼 {parent.name}
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

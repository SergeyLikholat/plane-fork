/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Big task progress on a kanban card, in place of Plane's sub-issue count:
 *
 *   ▰▰▰▱▱  3 из 5 шагов  ⚑ 15 окт.
 *   → Согласовать узлы · Фурсов А. · 1 окт.      (or «⚠ нет следующего шага»)
 *
 * Data comes from the board's `BigTaskContextProvider` (one request per board).
 * Clicks never reach the card link: the step opens in the peek.
 */

import { TriangleAlert } from "lucide-react";
import type { TBigTaskSummary } from "@/services/issue/big-task.service";
import { describeStep, formatShortDay, pluralSteps } from "./helpers";
import { stop } from "./list-row-meta";

/** Number of segments in the progress bar. */
const PROGRESS_SEGMENTS = 5;

/**
 * Filled segments for `done` of `total`. Any progress shows at least one
 * segment, an unfinished Big task never shows all of them.
 */
export const filledSegments = (done: number, total: number, segments = PROGRESS_SEGMENTS): number => {
  if (total <= 0 || done <= 0) return 0;
  if (done >= total) return segments;
  return Math.min(segments - 1, Math.max(1, Math.round((done / total) * segments)));
};

function ProgressBar({ done, total }: { done: number; total: number }) {
  const filled = filledSegments(done, total);
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
      {Array.from({ length: PROGRESS_SEGMENTS }, (_, index) => (
        <span key={index} className={`h-1.5 w-2.5 rounded-full ${index < filled ? "bg-[#7c3aed]" : "bg-[#E4DDF5]"}`} />
      ))}
    </span>
  );
}

type Props = {
  summary: TBigTaskSummary;
  /** Final deadline of the Big task (its own target_date). */
  deadline: string | null | undefined;
  isClosed: boolean;
  onOpenStep: (stepId: string) => void;
};

export function BigTaskCardProgress({ summary, deadline, isClosed, onOpenStep }: Props) {
  const step = summary.current_step;
  const deadlineLabel = formatShortDay(deadline);
  const progressLabel =
    summary.total > 0 ? `${summary.done} из ${summary.total} ${pluralSteps(summary.total)}` : "шагов нет";
  return (
    <div className="flex min-w-0 flex-col gap-1 text-caption-md-regular text-secondary">
      <div className="flex min-w-0 items-center gap-2" title={`Готово шагов: ${summary.done} из ${summary.total}`}>
        <ProgressBar done={summary.done} total={summary.total} />
        <span className="shrink-0 text-tertiary tabular-nums">{progressLabel}</span>
        {deadlineLabel && (
          <span className="ml-auto shrink-0 text-tertiary" title="Финальный срок Big task">
            ⚑ {deadlineLabel}
          </span>
        )}
      </div>
      {step ? (
        <button
          type="button"
          data-no-card-drag=""
          title="Текущий шаг — открыть"
          onClick={stop(() => onOpenStep(step.id))}
          className="min-w-0 truncate rounded-sm text-left hover:text-primary hover:underline focus-visible:ring-1 focus-visible:ring-[#7c3aed] focus-visible:outline-none"
        >
          <span className="text-tertiary">→ </span>
          {describeStep(step)}
        </button>
      ) : (
        !isClosed && (
          <span className="inline-flex w-fit items-center gap-1 rounded-sm bg-warning-subtle px-1.5 text-caption-md-medium text-warning-primary">
            <TriangleAlert className="size-3" aria-hidden />
            нет следующего шага
          </span>
        )
      )}
    </div>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { cn } from "../utils";

export type TIssuePriorities = "urgent" | "high" | "medium" | "low" | "none";

interface IPriorityIcon {
  className?: string;
  containerClassName?: string;
  priority: TIssuePriorities | undefined | null;
  size?: number;
  withContainer?: boolean;
}

/**
 * Priority glyphs — a family of «seals».
 *
 * One silhouette (a circle) for every level, so the column reads as a calm,
 * even row; the level is how dense the seal is. Weight already uses bars, so
 * priority deliberately avoids anything bar- or arrow-like.
 *
 *   urgent  solid seal with a white «!»   — the only loud mark
 *   high    ring with a solid core
 *   medium  ring with a dot
 *   low     thin ring
 *   none    dotted ring — present, but almost silent
 */
const RING = { cx: 8, cy: 8, r: 5.9, fill: "none", stroke: "currentColor" } as const;

const GLYPHS: Record<TIssuePriorities, React.ReactNode> = {
  urgent: (
    <>
      <circle cx="8" cy="8" r="6.6" fill="currentColor" />
      <path d="M8 4.9V8.6" stroke="var(--color-neutral-white, #fff)" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.95" fill="var(--color-neutral-white, #fff)" />
    </>
  ),
  high: (
    <>
      <circle {...RING} strokeWidth="1.5" />
      <circle cx="8" cy="8" r="3.1" fill="currentColor" />
    </>
  ),
  medium: (
    <>
      <circle {...RING} strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.55" fill="currentColor" />
    </>
  ),
  low: <circle {...RING} strokeWidth="1.3" />,
  none: <circle {...RING} strokeWidth="1.3" strokeDasharray="1.4 2.3" strokeLinecap="round" />,
};

/** Only these two are filled — see rule 2 above. */
const FILLED = new Set<TIssuePriorities>(["urgent", "high"]);

const TEXT_CLASSES: Record<TIssuePriorities, string> = {
  urgent: "text-priority-urgent",
  high: "text-priority-high",
  medium: "text-priority-medium",
  low: "text-priority-low",
  none: "text-priority-none",
};

/** Container styling kept per level so the old `withContainer` API still works. */
const CONTAINER_CLASSES: Record<TIssuePriorities, string> = {
  urgent: "bg-layer-2 text-priority-urgent border-priority-urgent",
  high: "bg-layer-2 text-priority-high border-priority-high",
  medium: "bg-layer-2 text-priority-medium border-priority-medium",
  low: "bg-layer-2 text-priority-low border-priority-low",
  none: "bg-layer-2 text-priority-none border-priority-none",
};

export function PriorityIcon(props: IPriorityIcon) {
  const { priority, className = "", containerClassName = "", size = 14, withContainer = false } = props;
  const level = priority ?? "none";

  const glyph = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={cn("flex-shrink-0", TEXT_CLASSES[level], className)}
    >
      {GLYPHS[level]}
    </svg>
  );

  if (!withContainer) return glyph;

  return (
    <div
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-sm border p-0.5",
        CONTAINER_CLASSES[level],
        containerClassName
      )}
    >
      {glyph}
    </div>
  );
}

/** Whether this level renders as a filled glyph — consumers use it to decide
 *  how much extra emphasis (borders, backgrounds) a control still needs. */
export const isFilledPriority = (priority: TIssuePriorities | undefined | null): boolean =>
  FILLED.has(priority ?? "none");

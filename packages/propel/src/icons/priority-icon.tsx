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
 * Priority glyphs.
 *
 * Upstream encoded priority as signal bars (SignalHigh / SignalMedium /
 * SignalLow) — the same shape differing by one 3px bar, in two neighbouring
 * hues. At 12–14px in a dense list that is unreadable: the eye counts
 * elements slowly but recognises shapes instantly.
 *
 * Two rules replace it:
 *
 * 1. **Shape carries the meaning**, not the number of bars. Each level is a
 *    distinct silhouette: exclamation, triangle up, diamond, chevron down, dash.
 * 2. **Asymmetric weight.** Urgent and high are FILLED; medium is an outline;
 *    low and none are thin strokes. Important work is visible because the
 *    unimportant stops shouting — every level being equally loud is why
 *    nothing stood out before.
 */
const GLYPHS: Record<TIssuePriorities, React.ReactNode> = {
  // Filled rounded square + white exclamation — the loudest mark available.
  urgent: (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="currentColor" />
      <path d="M8 4.75V9" stroke="var(--color-neutral-white, #fff)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="1" fill="var(--color-neutral-white, #fff)" />
    </>
  ),
  // Solid triangle up: reads as "up" at any size, no counting involved.
  high: <path d="M8 2.6 14.2 13.4H1.8L8 2.6Z" fill="currentColor" />,
  // Outline diamond — same visual weight class as high, but hollow.
  medium: (
    <path
      d="M8 2.9 13.1 8 8 13.1 2.9 8 8 2.9Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  ),
  // Thin chevron down — clearly "less", and quiet enough to ignore.
  low: (
    <path
      d="M3.6 6.2 8 10.6l4.4-4.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  // Dash — present, but as close to silence as a glyph gets.
  none: <path d="M4.2 8h7.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
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

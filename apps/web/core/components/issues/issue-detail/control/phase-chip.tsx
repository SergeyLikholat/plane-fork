/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";
import type { TControlPhase } from "@/services/issue/issue-control.service";
import { PHASE_NAMES, PHASE_PALETTE } from "./phase-palette";

type Props = {
  phase: TControlPhase;
  className?: string;
};

/** «● Постановка» — the phase of a supervised work item in the «paper» palette. */
export function ControlPhaseChip({ phase, className }: Props) {
  const tone = PHASE_PALETTE[phase];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-body-xs-medium",
        tone.chipClassName,
        className
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone.dotClassName)} />
      {PHASE_NAMES[phase]}
    </span>
  );
}

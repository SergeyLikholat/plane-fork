/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Calm «paper» palette of the control phases: a soft fill, a thin border in
 * tone, a small dot and medium text. The dot colour is also the colour of the
 * phase label itself (backend `MARK_LABELS` in `plane/utils/control_touch.py`,
 * planner `PHASE_LABELS`), so label chips on cards match the phase chip.
 *
 * Class strings are spelled out in full so Tailwind picks up the arbitrary values.
 */

import type { TControlPhase } from "@/services/issue/issue-control.service";

type TPhaseTone = {
  /** Dot colour = phase label colour. */
  color: string;
  /** Fill, border and text of the chip. */
  chipClassName: string;
  dotClassName: string;
};

export const PHASE_PALETTE: Record<TControlPhase, TPhaseTone> = {
  setup: {
    color: "#B08A4A",
    chipClassName: "border-[#E6D9BF] bg-[#F5EFE3] text-[#6E5424]",
    dotClassName: "bg-[#B08A4A]",
  },
  check: {
    color: "#6F8A94",
    chipClassName: "border-[#D5DFE2] bg-[#EEF2F3] text-[#3E555D]",
    dotClassName: "bg-[#6F8A94]",
  },
  acceptance: {
    color: "#6B8F63",
    chipClassName: "border-[#D3E1CF] bg-[#EEF3EC] text-[#3F5B39]",
    dotClassName: "bg-[#6B8F63]",
  },
};

/** Phase names for the chip: the dot stands in for the label's emoji. */
export const PHASE_NAMES: Record<TControlPhase, string> = {
  setup: "Постановка",
  check: "Проверка",
  acceptance: "Приёмка",
};

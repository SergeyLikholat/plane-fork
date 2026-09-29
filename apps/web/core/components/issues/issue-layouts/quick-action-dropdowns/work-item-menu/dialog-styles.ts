/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Shared look of the small ⋯ menu dialogs — same as «Какой следующий шаг?» and «Поставил». */

export const DIALOG_BODY = "flex flex-col gap-4 px-5 py-4";
export const DIALOG_TITLE = "text-h5-medium text-primary";
export const DIALOG_FOOTER = "flex items-center justify-end gap-2 border-t border-subtle pt-3";
export const FIELD_LABEL = "text-caption-md-medium tracking-wide text-tertiary uppercase";

const CHIP_BASE =
  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-body-xs-medium transition-colors outline-none focus-visible:border-accent-strong";
const CHIP_ACTIVE = "border-accent-strong bg-accent-subtle text-accent-primary";
const CHIP_IDLE =
  "border-subtle bg-layer-2 text-secondary hover:border-strong hover:bg-layer-2-hover hover:text-primary";

/**
 * A pickable chip (person, weight). Joined by hand, not `cn`: tailwind-merge
 * reads `text-body-xs-medium` and `text-secondary` as two colours and would
 * drop the type style.
 */
export const choiceChipClass = (isActive: boolean) => `${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_IDLE}`;

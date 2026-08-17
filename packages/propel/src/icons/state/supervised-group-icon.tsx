/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";

/**
 * Icon for the fork-only «На контроле» state group.
 *
 * Reads as an eye: the work is watched, not carried out. Deliberately distinct
 * from StartedGroupIcon's progress ring so the two never blur together in a
 * dense list.
 */
export function SupervisedGroupIcon({ width = "20", height = "20", className, color = "#FCB900" }: ISvgIcons) {
  return (
    <svg width={width} height={height} viewBox="0 0 16 16" className={className} fill="none">
      <path
        d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={8} cy={8} r={2} fill={color} />
    </svg>
  );
}

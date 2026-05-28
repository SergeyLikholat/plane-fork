/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LayoutPanelLeft } from "lucide-react";
import {
  ListLayoutIcon,
  BoardLayoutIcon,
  CalendarLayoutIcon,
  SheetLayoutIcon,
  TimelineLayoutIcon,
} from "@plane/propel/icons";
import type { ISvgIcons } from "@plane/propel/icons";
import { EIssueLayoutTypes } from "@plane/types";

export function IssueLayoutIcon({
  layout,
  size,
  ...props
}: { layout: EIssueLayoutTypes; size?: number } & Omit<ISvgIcons, "width" | "height">) {
  const iconProps = {
    ...props,
    ...(size && { width: size, height: size }),
  };

  switch (layout) {
    case EIssueLayoutTypes.LIST:
      return <ListLayoutIcon {...iconProps} />;
    case EIssueLayoutTypes.KANBAN:
      return <BoardLayoutIcon {...iconProps} />;
    case EIssueLayoutTypes.CALENDAR:
      return <CalendarLayoutIcon {...iconProps} />;
    case EIssueLayoutTypes.CALENDAR_WEEK:
      return <CalendarLayoutIcon {...iconProps} />;
    case EIssueLayoutTypes.PLANNER:
      // Lucide icon used because @plane/propel/icons has no split-pane glyph
      // and adding one would require rebuilding the package.
      return (
        <LayoutPanelLeft
          width={iconProps.width as number | undefined}
          height={iconProps.height as number | undefined}
          className={iconProps.className}
          strokeWidth={2}
        />
      );
    case EIssueLayoutTypes.SPREADSHEET:
      return <SheetLayoutIcon {...iconProps} />;
    case EIssueLayoutTypes.GANTT:
      return <TimelineLayoutIcon {...iconProps} />;
    default:
      return null;
  }
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { ru } from "date-fns/locale";
import { DayPicker } from "react-day-picker";
import { ChevronLeftIcon } from "../icons/arrows/chevron-left";

import { cn } from "../utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, showOutsideDays = true, components, ...props }: CalendarProps) {
  const currentYear = new Date().getFullYear();
  const thirtyYearsAgoFirstDay = new Date(currentYear - 30, 0, 1);
  const thirtyYearsFromNowFirstDay = new Date(currentYear + 30, 11, 31);

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      // react-day-picker builds its own month/weekday captions and does NOT
      // read date-fns' global default options, so the locale has to be passed
      // explicitly or the popup stays English while everything else is Russian.
      locale={props.locale ?? ru}
      weekStartsOn={props.weekStartsOn ?? 1}
      components={{
        Chevron: ({ className: chevronClassName, ...chevronProps }) => (
          <ChevronLeftIcon
            className={cn(
              "size-4",
              {
                "rotate-180": chevronProps.orientation === "right",
                "-rotate-90": chevronProps.orientation === "down",
              },
              chevronClassName
            )}
            {...chevronProps}
          />
        ),
        // Merge, don't replace: callers overriding a single slot (e.g.
        // DayButton) would otherwise drop the Chevron above and lose the
        // month navigation arrows.
        ...components,
      }}
      startMonth={thirtyYearsAgoFirstDay}
      endMonth={thirtyYearsFromNowFirstDay}
      {...props}
    />
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// types
import type { TIssue } from "@plane/types";
// components
import { DateTimeDurationPopup } from "@/components/issues/date-time-duration-popup";
import { useCalendarOptions } from "@/components/issues/use-calendar-options";

type Props = {
  issue: TIssue;
  onClose: () => void;
  onChange: (issue: TIssue, data: Partial<TIssue>, updates: any) => void;
  disabled: boolean;
};

export const SpreadsheetStartDateColumn = observer(function SpreadsheetStartDateColumn(props: Props) {
  const { issue, onChange, disabled } = props;
  const calendarOpts = useCalendarOptions(issue.project_id, issue.label_ids);

  return (
    <div className="flex h-11 items-center border-b-[0.5px] border-subtle px-page-x">
      <DateTimeDurationPopup
        value={{
          target_date: issue.target_date ?? null,
          target_time: issue.target_time ?? null,
          start_date: issue.start_date ?? null,
          start_time: issue.start_time ?? null,
        }}
        onChange={(patch) =>
          onChange(issue, patch, { changed_property: "start_date", change_details: patch.start_date })
        }
        disabled={disabled}
        placeholder="Начало"
        calendars={{
          options: calendarOpts.options,
          selectedId: calendarOpts.selectedId,
          onChange: (id) =>
            onChange(
              issue,
              { label_ids: calendarOpts.buildNextLabelIds(issue.label_ids, id) } as Partial<TIssue>,
              { changed_property: "labels", change_details: id }
            ),
        }}
      />
    </div>
  );
});

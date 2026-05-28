/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EIssueLayoutTypes } from "@plane/types";
// components
import { CalendarLayoutLoader } from "@/components/ui/loader/layouts/calendar-layout-loader";
import { GanttLayoutLoader } from "@/components/ui/loader/layouts/gantt-layout-loader";
import { KanbanLayoutLoader } from "@/components/ui/loader/layouts/kanban-layout-loader";
import { ListLayoutLoader } from "@/components/ui/loader/layouts/list-layout-loader";
import { SpreadsheetLayoutLoader } from "@/components/ui/loader/layouts/spreadsheet-layout-loader";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
// local imports
import { IssueLayoutEmptyState } from "./empty-states";

function ActiveLoader(props: { layout: EIssueLayoutTypes }) {
  const { layout } = props;
  switch (layout) {
    case EIssueLayoutTypes.LIST:
      return <ListLayoutLoader />;
    case EIssueLayoutTypes.KANBAN:
      return <KanbanLayoutLoader />;
    case EIssueLayoutTypes.SPREADSHEET:
      return <SpreadsheetLayoutLoader />;
    case EIssueLayoutTypes.CALENDAR:
      return <CalendarLayoutLoader />;
    case EIssueLayoutTypes.GANTT:
      return <GanttLayoutLoader />;
    default:
      return null;
  }
}

interface Props {
  children: string | React.ReactNode | React.ReactNode[];
  layout: EIssueLayoutTypes;
}

export const IssueLayoutHOC = observer(function IssueLayoutHOC(props: Props) {
  const { layout } = props;

  const storeType = useIssueStoreType();
  const { issues } = useIssues(storeType);

  const issueCount = issues.getGroupIssueCount(undefined, undefined, false);
  const loader = issues?.getIssueLoader();

  let inner: React.ReactNode;
  // Skeleton only on the very first load. Background `mutation` refetches —
  // triggered after every issueUpdate/filter change — also briefly clear
  // groupedIssueCount, but flashing the skeleton each time looked like the
  // whole list was reloading. Keep showing whatever children we already
  // rendered while the mutation is in flight.
  if (loader === "init-loader" || (issueCount === undefined && loader !== "mutation")) {
    inner = <ActiveLoader layout={layout} />;
  } else if (issueCount === 0 && layout !== EIssueLayoutTypes.CALENDAR) {
    inner = <IssueLayoutEmptyState storeType={storeType} />;
  } else {
    inner = props.children;
  }

  // Wrap in a stable canvas div so the user's optional background image
  // (set via Preferences → Custom theme) renders ONLY inside the issue
  // layout area — not under the sidebar, top header, or filter bar.
  // Sized as size-full + relative so it doesn't disturb the existing
  // flex/grid layouts inside; CSS rules in user-background.css attach
  // the image and dim overlay via the [data-layout-canvas] selector.
  return (
    <div data-layout-canvas={layout} className="relative size-full">
      {inner}
    </div>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import { EIssuesStoreType } from "@plane/types";
// components
import { CalendarWeekLayout } from "@/components/issues/issue-layouts/calendar-week/project-root";
import { ProfileIssuesKanBanLayout } from "@/components/issues/issue-layouts/kanban/roots/profile-issues-root";
import { ProfileIssuesListLayout } from "@/components/issues/issue-layouts/list/roots/profile-issues-root";
import { ProfilePlannerLayout } from "@/components/issues/issue-layouts/planner/profile-planner-root";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { QuickFiltersRow } from "@/components/profile/quick-filters/root";
import { WorkspaceLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/workspace-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useLabel } from "@/hooks/store/use-label";
import { useModule } from "@/hooks/store/use-module";
import { useProjectState } from "@/hooks/store/use-project-state";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";

type Props = {
  type: "assigned" | "subscribed" | "created";
};

export const ProfileIssuesPage = observer(function ProfileIssuesPage(props: Props) {
  const { type } = props;
  const { workspaceSlug, userId } = useParams();
  // store hooks
  const {
    issues: { setViewId },
    issuesFilter: { issueFilters, fetchFilters, updateFilterExpression },
  } = useIssues(EIssuesStoreType.PROFILE);
  const { fetchWorkspaceLabels } = useLabel();
  const { fetchWorkspaceStates } = useProjectState();
  const { fetchWorkspaceModules } = useModule();
  // derived values
  const activeLayout = issueFilters?.displayFilters?.layout || undefined;

  useEffect(() => {
    if (setViewId) setViewId(type);
  }, [type, setViewId]);

  useSWR(
    workspaceSlug && userId ? `CURRENT_WORKSPACE_PROFILE_ISSUES_${workspaceSlug}_${userId}` : null,
    async () => {
      if (workspaceSlug && userId) {
        await fetchFilters(workspaceSlug, userId);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // Profile views show issues across many projects, so labels and states are
  // not loaded by any per-project page. Without these fetches the issue rows
  // render without label chips and cal:* colors (works only after the user
  // first visits a project page, which populates the maps as a side effect).
  // Workspace-level endpoints return everything in one call.
  useSWR(
    workspaceSlug ? `WORKSPACE_LABELS_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchWorkspaceLabels(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  useSWR(
    workspaceSlug ? `WORKSPACE_STATES_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchWorkspaceStates(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // Same reason as labels/states: the module quick filter and the module
  // filter config need the whole workspace's modules, which no per-project
  // page has loaded here.
  useSWR(
    workspaceSlug ? `WORKSPACE_MODULES_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchWorkspaceModules(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.PROFILE}>
      <WorkspaceLevelWorkItemFiltersHOC
        entityId={userId}
        entityType={EIssuesStoreType.PROFILE}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.profile_issues.filters}
        initialWorkItemFilters={issueFilters}
        updateFilters={updateFilterExpression.bind(updateFilterExpression, workspaceSlug, userId)}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: profileWorkItemsFilter }) => (
          <>
            <div className="flex h-full w-full flex-col">
              {profileWorkItemsFilter && <WorkItemFiltersRow filter={profileWorkItemsFilter} />}
              {profileWorkItemsFilter && <QuickFiltersRow filter={profileWorkItemsFilter} />}
              <div className="relative h-full w-full overflow-auto">
                {activeLayout === "planner" ? (
                  <ProfilePlannerLayout />
                ) : activeLayout === "list" ? (
                  <ProfileIssuesListLayout />
                ) : activeLayout === "kanban" ? (
                  <ProfileIssuesKanBanLayout />
                ) : activeLayout === "calendar_week" ? (
                  <CalendarWeekLayout />
                ) : null}
              </div>
            </div>
            {/* peek overview */}
            <IssuePeekOverview />
          </>
        )}
      </WorkspaceLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});

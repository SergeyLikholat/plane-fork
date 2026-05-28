/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// icons
import { Circle, Plus } from "lucide-react";
// plane imports
import {
  EUserPermissions,
  EUserPermissionsLevel,
  SPACE_BASE_PATH,
  SPACE_BASE_URL,
  WORK_ITEM_TRACKER_ELEMENTS,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { NewTabIcon, WorkItemsIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { EIssuesStoreType } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { CountChip } from "@/components/common/count-chip";
// constants
import { HeaderFilters } from "@/components/issues/filters";
// helpers
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

export const IssuesHeader = observer(function IssuesHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const {
    issues: { getGroupIssueCount },
  } = useIssues(EIssuesStoreType.PROJECT);
  // i18n
  const { t } = useTranslation();

  const { currentProjectDetails, loader } = useProject();

  const { toggleCreateIssueModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  const { isMobile } = usePlatformOS();

  const SPACE_APP_URL = (SPACE_BASE_URL.trim() === "" ? window.location.origin : SPACE_BASE_URL) + SPACE_BASE_PATH;
  const publishedURL = `${SPACE_APP_URL}/issues/${currentProjectDetails?.anchor}`;

  // base-issues.store.clear() resets `groupedIssueCount = {}` on every
  // refetch (including silent 15-second mutation polls fired by the calendar
  // layout). That blanks `getGroupIssueCount(undefined, undefined, false)`
  // for ~200 ms each cycle and made the header CountChip blink. Keep the
  // last positive count in a ref and prefer it whenever the live value is
  // missing, so the badge stays steady through background refetches.
  const liveIssuesCount = getGroupIssueCount(undefined, undefined, false);
  const lastIssuesCountRef = useRef<number | undefined>(liveIssuesCount);
  if (typeof liveIssuesCount === "number") lastIssuesCountRef.current = liveIssuesCount;
  const issuesCount = liveIssuesCount ?? lastIssuesCountRef.current;
  const canUserCreateIssue = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-2.5">
          <Breadcrumbs onBack={() => router.back()} isLoading={loader === "init-loader"} className="flex-grow-0">
            <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
            {/* Mobile-aggressive cleanup (<lg = <1024px): hide the
                "Рабочие элементы" breadcrumb item — it's redundant on
                mobile because the user is obviously on the work-items
                view and the count chip is right next to the project
                icon. Frees ~120 px to fit the action button. */}
            <span className="hidden lg:contents">
              <Breadcrumbs.Item
                component={
                  <BreadcrumbLink
                    label="Рабочие элементы"
                    href={`/${workspaceSlug}/projects/${projectId}/issues/`}
                    icon={<WorkItemsIcon className="h-4 w-4 text-tertiary" />}
                    isLast
                  />
                }
                isLast
              />
            </span>
          </Breadcrumbs>
          {issuesCount && issuesCount > 0 ? (
            <Tooltip
              isMobile={isMobile}
              tooltipContent={`There are ${issuesCount} ${issuesCount > 1 ? "work items" : "work item"} in this project`}
              position="bottom"
            >
              <CountChip count={issuesCount} />
            </Tooltip>
          ) : null}
        </div>
        {currentProjectDetails?.anchor ? (
          <a
            href={publishedURL}
            className="group flex items-center gap-1.5 rounded-sm bg-accent-primary/10 px-2.5 py-1 text-11 font-medium text-accent-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Circle className="h-1.5 w-1.5 fill-accent-primary" strokeWidth={2} />
            {t("workspace_projects.network.public.title")}
            <NewTabIcon className="hidden h-3 w-3 group-hover:block" strokeWidth={2} />
          </a>
        ) : (
          <></>
        )}
      </Header.LeftItem>
      <Header.RightItem>
        <div className="hidden gap-2 md:flex">
          <HeaderFilters
            projectId={projectId}
            currentProjectDetails={currentProjectDetails}
            workspaceSlug={workspaceSlug}
            canUserCreateIssue={canUserCreateIssue}
          />
        </div>
        {canUserCreateIssue && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              toggleCreateIssueModal(true, EIssuesStoreType.PROJECT);
            }}
            data-ph-element={WORK_ITEM_TRACKER_ELEMENTS.HEADER_ADD_BUTTON.WORK_ITEMS}
            // Tighter horizontal padding on mobile so the icon-only
            // button is square-ish, not stretched out. Default `size="lg"`
            // ships with px-4 which makes a 40-ish-pixel-wide "+" pill.
            className="!px-2 lg:!px-4"
            aria-label={t("issue.add.label")}
          >
            {/* Mobile-aggressive (<lg): icon-only "+" — saves ~120 px so
                the breadcrumb left column doesn't get clipped. Desktop
                keeps the full text label. */}
            <span className="block lg:hidden" aria-hidden="true">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <span className="hidden lg:block">{t("issue.add.label")}</span>
          </Button>
        )}
      </Header.RightItem>
    </Header>
  );
});

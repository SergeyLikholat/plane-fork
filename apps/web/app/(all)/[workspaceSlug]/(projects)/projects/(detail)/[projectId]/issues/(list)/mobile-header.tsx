/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EIssuesStoreType } from "@plane/types";
// components
import { MobileWorkItemsBar } from "@/components/issues/issue-layouts/filters/header/mobile-work-items-bar";
// hooks
import { useIssues } from "@/hooks/store/use-issues";

export const ProjectIssuesMobileHeader = observer(function ProjectIssuesMobileHeader() {
  const { workspaceSlug, projectId } = useParams();
  const {
    issuesFilter: { issueFilters, updateFilters },
  } = useIssues(EIssuesStoreType.PROJECT);

  if (!workspaceSlug || !projectId) return null;

  return (
    <MobileWorkItemsBar
      storeType={EIssuesStoreType.PROJECT}
      entityId={projectId.toString()}
      issueFilters={issueFilters}
      onUpdateFilters={(type, value) => updateFilters(workspaceSlug.toString(), projectId.toString(), type, value)}
    />
  );
});

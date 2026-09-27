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
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssues } from "@/hooks/store/use-issues";

export const CycleIssuesMobileHeader = observer(function CycleIssuesMobileHeader() {
  const { workspaceSlug, projectId, cycleId } = useParams();
  const { getCycleById } = useCycle();
  const {
    issuesFilter: { issueFilters, updateFilters },
  } = useIssues(EIssuesStoreType.CYCLE);

  if (!workspaceSlug || !projectId || !cycleId) return null;

  return (
    <MobileWorkItemsBar
      storeType={EIssuesStoreType.CYCLE}
      entityId={cycleId.toString()}
      issueFilters={issueFilters}
      onUpdateFilters={(type, value) =>
        updateFilters(workspaceSlug.toString(), projectId.toString(), type, value, cycleId.toString())
      }
      ignoreGroupedFilters={["cycle"]}
      cycleDetails={getCycleById(cycleId.toString()) ?? undefined}
    />
  );
});

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
import { useModule } from "@/hooks/store/use-module";

export const ModuleIssuesMobileHeader = observer(function ModuleIssuesMobileHeader() {
  const { workspaceSlug, projectId, moduleId } = useParams();
  const { getModuleById } = useModule();
  const {
    issuesFilter: { issueFilters, updateFilters },
  } = useIssues(EIssuesStoreType.MODULE);

  if (!workspaceSlug || !projectId || !moduleId) return null;

  return (
    <MobileWorkItemsBar
      storeType={EIssuesStoreType.MODULE}
      entityId={moduleId.toString()}
      issueFilters={issueFilters}
      onUpdateFilters={(type, value) =>
        updateFilters(workspaceSlug.toString(), projectId.toString(), type, value, moduleId.toString())
      }
      ignoreGroupedFilters={["module"]}
      moduleDetails={getModuleById(moduleId.toString()) ?? undefined}
    />
  );
});

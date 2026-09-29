/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EIssuesStoreType } from "@plane/types";
// hooks
import { useProject } from "@/hooks/store/use-project";
// local imports
import type { IQuickActionProps } from "../list/list-view-types";
import { WorkItemQuickActions } from "./work-item-menu/work-item-quick-actions";

/** Workspace views (global spreadsheet): permissions come from the view (`readOnly`). */
export const AllIssueQuickActions = observer(function AllIssueQuickActions(props: IQuickActionProps) {
  const { issue, handleArchive, readOnly = false } = props;
  const { getProjectIdentifierById } = useProject();
  const isEditingAllowed = !readOnly;

  return (
    <WorkItemQuickActions
      {...props}
      storeType={EIssuesStoreType.GLOBAL}
      projectIdentifier={getProjectIdentifierById(issue.project_id)}
      isEditingAllowed={isEditingAllowed}
      isDeletingAllowed={isEditingAllowed}
      isArchivingAllowed={!!handleArchive && isEditingAllowed}
      defaultPlacement="bottom-start"
      useCaptureForOutsideClick
    />
  );
});

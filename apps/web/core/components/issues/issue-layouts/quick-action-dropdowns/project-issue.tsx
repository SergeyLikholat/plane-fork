/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { EIssuesStoreType } from "@plane/types";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { IQuickActionProps } from "../list/list-view-types";
import { WorkItemQuickActions } from "./work-item-menu/work-item-quick-actions";

/** Project lists / boards / spreadsheet and «Моя работа» (profile). */
export const ProjectIssueQuickActions = observer(function ProjectIssueQuickActions(props: IQuickActionProps) {
  const { issue, handleArchive, readOnly = false } = props;
  const { workspaceSlug } = useParams();
  const { allowPermissions } = useUserPermissions();
  const { getProjectIdentifierById } = useProject();
  const isEditingAllowed =
    allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
      EUserPermissionsLevel.PROJECT,
      workspaceSlug?.toString(),
      issue.project_id ?? undefined
    ) && !readOnly;

  return (
    <WorkItemQuickActions
      {...props}
      storeType={EIssuesStoreType.PROJECT}
      projectIdentifier={getProjectIdentifierById(issue.project_id)}
      isEditingAllowed={isEditingAllowed}
      isDeletingAllowed={isEditingAllowed}
      isArchivingAllowed={!!handleArchive && isEditingAllowed}
      defaultPlacement="bottom-end"
    />
  );
});

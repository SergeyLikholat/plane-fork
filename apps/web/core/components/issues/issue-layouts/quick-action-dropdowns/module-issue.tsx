/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { XCircle } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { EIssuesStoreType } from "@plane/types";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { IQuickActionProps } from "../list/list-view-types";
import type { TMenuEntry } from "./work-item-menu/menu-entries";
import { WorkItemQuickActions } from "./work-item-menu/work-item-quick-actions";

export const ModuleIssueQuickActions = observer(function ModuleIssueQuickActions(props: IQuickActionProps) {
  const { issue, handleArchive, handleRemoveFromView, readOnly = false } = props;
  const { allowPermissions } = useUserPermissions();
  const { getProjectIdentifierById } = useProject();
  const isEditingAllowed =
    allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT) && !readOnly;

  const extraServiceEntries = useMemo<TMenuEntry[]>(
    () =>
      isEditingAllowed && handleRemoveFromView
        ? [
            {
              key: "remove-from-view",
              title: "Убрать из модуля",
              icon: XCircle,
              action: () => void handleRemoveFromView(),
            },
          ]
        : [],
    [isEditingAllowed, handleRemoveFromView]
  );

  return (
    <WorkItemQuickActions
      {...props}
      storeType={EIssuesStoreType.MODULE}
      projectIdentifier={getProjectIdentifierById(issue.project_id)}
      isEditingAllowed={isEditingAllowed}
      isDeletingAllowed={isEditingAllowed}
      isArchivingAllowed={!!handleArchive && isEditingAllowed}
      defaultPlacement="bottom-start"
      useCaptureForOutsideClick
      extraServiceEntries={extraServiceEntries}
    />
  );
});

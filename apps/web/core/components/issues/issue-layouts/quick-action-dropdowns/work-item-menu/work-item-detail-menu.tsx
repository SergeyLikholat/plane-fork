/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * The ⋯ menu inside an open work item — the peek header and the full-page
 * header. Same entries and dialogs as on list rows (`useWorkItemMenu`); the
 * caller only decides what «Удалить» / «Архивировать» / «Восстановить» do
 * afterwards (close the peek, leave the page).
 *
 * Works outside a layout: the update goes through the layout store of the
 * current route (the row under the peek moves between groups), and the
 * activity of the open item is refreshed after every change.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { ArchiveRestore, Ellipsis } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { IconButton } from "@plane/propel/icon-button";
import type { TIssue } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import { MENU_TEXT_CLASS, WorkItemMenuItems } from "./menu-entries";
import type { TMenuEntry } from "./menu-entries";
import { useWorkItemMenu } from "./use-work-item-menu";

type Props = {
  issue: TIssue;
  workspaceSlug: string;
  /** No editing entries (peek without edit rights). */
  readOnly?: boolean;
  handleDelete: () => Promise<void>;
  handleArchive?: () => Promise<void>;
  handleRestore?: () => Promise<void>;
  /** A dialog of the menu opened / closed: the peek keeps itself open meanwhile. */
  onDialogOpenChange?: (isOpen: boolean) => void;
};

export const WorkItemDetailMenu = observer(function WorkItemDetailMenu(props: Props) {
  const { issue, workspaceSlug, readOnly = false, handleDelete, handleArchive, handleRestore } = props;
  const { onDialogOpenChange } = props;
  const { allowPermissions } = useUserPermissions();
  const { getProjectIdentifierById } = useProject();
  const { fetchActivities } = useIssueDetail();
  const storeType = useIssueStoreType();
  const { updateIssue } = useIssuesActions(storeType);

  const projectId = issue.project_id ?? undefined;
  const isArchived = !!issue.archived_at;
  const hasProjectRights =
    allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
      EUserPermissionsLevel.PROJECT,
      workspaceSlug,
      projectId
    ) && !readOnly;
  // An archived item is read-only: only restore and delete are left.
  const isEditingAllowed = hasProjectRights && !isArchived;

  const handleUpdate = updateIssue
    ? async (data: TIssue) => {
        await updateIssue(projectId, issue.id, data);
        if (projectId) void fetchActivities(workspaceSlug, projectId, issue.id);
      }
    : undefined;

  const restoreEntries: TMenuEntry[] =
    isArchived && hasProjectRights && handleRestore
      ? [{ key: "restore", title: "Восстановить", icon: ArchiveRestore, action: () => void handleRestore() }]
      : [];

  const { groups, dialogs, onMenuOpen, isDialogOpen } = useWorkItemMenu({
    issue,
    projectIdentifier: getProjectIdentifierById(issue.project_id),
    storeType,
    isEditingAllowed,
    isDeletingAllowed: hasProjectRights,
    isArchivingAllowed: isEditingAllowed && !!handleArchive,
    handleUpdate,
    handleDelete,
    handleArchive,
    extraServiceEntries: restoreEntries,
  });

  useEffect(() => {
    onDialogOpenChange?.(isDialogOpen);
  }, [isDialogOpen, onDialogOpenChange]);
  useEffect(() => () => onDialogOpenChange?.(false), [onDialogOpenChange]);

  return (
    <>
      {dialogs}
      <CustomMenu
        ellipsis
        ariaLabel="Действия с задачей"
        placement="bottom-end"
        customButton={<IconButton size="lg" variant="secondary" icon={Ellipsis} />}
        menuItemsClassName="z-[14]"
        optionsClassName={`max-h-[min(32rem,75vh)] min-w-[15rem] ${MENU_TEXT_CLASS}`}
        menuButtonOnClick={onMenuOpen}
        closeOnSelect
      >
        <WorkItemMenuItems groups={groups} />
      </CustomMenu>
    </>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * The ⋯ button and the right-click menu of a work item in lists, boards and
 * the spreadsheet. The project / workspace / module / cycle variants only
 * work out permissions and pass them here.
 */

import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { observer } from "mobx-react";
import type { EIssuesStoreType } from "@plane/types";
import { ContextMenu, CustomMenu } from "@plane/ui";
import type { IQuickActionProps } from "../../list/list-view-types";
import { MENU_TEXT_CLASS, WorkItemMenuItems, toContextMenuItems } from "./menu-entries";
import type { TMenuEntry } from "./menu-entries";
import { useWorkItemMenu } from "./use-work-item-menu";

// Dialogs are portalled, but React still bubbles their clicks to the row /
// card link around the menu (which would open the peek). Stop them here and
// keep their default action (checkboxes, links inside the dialogs).
const stopPortalClick = (event: MouseEvent<HTMLElement>) => {
  event.stopPropagation();
  if (event.currentTarget.contains(event.target as Node)) event.preventDefault();
};

export type TWorkItemQuickActionsProps = IQuickActionProps & {
  storeType: EIssuesStoreType;
  projectIdentifier: string | undefined;
  isEditingAllowed: boolean;
  isDeletingAllowed: boolean;
  isArchivingAllowed: boolean;
  defaultPlacement: NonNullable<IQuickActionProps["placements"]>;
  useCaptureForOutsideClick?: boolean;
  extraServiceEntries?: TMenuEntry[];
};

export const WorkItemQuickActions = observer(function WorkItemQuickActions(props: TWorkItemQuickActionsProps) {
  const {
    issue,
    customActionButton,
    portalElement,
    placements,
    parentRef,
    defaultPlacement,
    useCaptureForOutsideClick = false,
  } = props;

  const { groups, dialogs, onMenuOpen } = useWorkItemMenu({
    issue,
    projectIdentifier: props.projectIdentifier,
    storeType: props.storeType,
    isEditingAllowed: props.isEditingAllowed,
    isDeletingAllowed: props.isDeletingAllowed,
    isArchivingAllowed: props.isArchivingAllowed,
    handleUpdate: props.handleUpdate,
    handleDelete: props.handleDelete,
    handleArchive: props.handleArchive,
    extraServiceEntries: props.extraServiceEntries,
  });

  // The right-click menu needs the same lazy data (modules, frequency) as ⋯.
  const onMenuOpenRef = useRef(onMenuOpen);
  onMenuOpenRef.current = onMenuOpen;
  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;
    const handleContextMenu = () => onMenuOpenRef.current();
    element.addEventListener("contextmenu", handleContextMenu);
    return () => element.removeEventListener("contextmenu", handleContextMenu);
  }, [parentRef]);

  return (
    <>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- only stops portal clicks from reaching the row link */}
      <span className="contents" onClick={stopPortalClick}>
        {dialogs}
      </span>
      <ContextMenu parentRef={parentRef} items={toContextMenuItems(groups)} />
      <CustomMenu
        ellipsis
        ariaLabel="Действия с задачей"
        placement={placements ?? defaultPlacement}
        customButton={customActionButton}
        portalElement={portalElement}
        menuItemsClassName="z-[14]"
        optionsClassName={`max-h-[min(32rem,75vh)] min-w-[15rem] ${MENU_TEXT_CLASS}`}
        menuButtonOnClick={onMenuOpen}
        closeOnSelect
        useCaptureForOutsideClick={useCaptureForOutsideClick}
      >
        <WorkItemMenuItems groups={groups} />
      </CustomMenu>
    </>
  );
});

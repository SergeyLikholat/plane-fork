/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { observer } from "mobx-react";
import { Disclosure, Transition } from "@headlessui/react";
// plane imports
import { EditIcon, TrashIcon, ChevronDownIcon } from "@plane/propel/icons";
import type { IIssueLabel } from "@plane/types";
// components
import type { TLabelOperationsCallbacks } from "./create-update-label-inline";
import { CreateUpdateLabelInline } from "./create-update-label-inline";
import type { ICustomMenuItem } from "./label-block/label-item-block";
import { LabelItemBlock } from "./label-block/label-item-block";
import { LabelDndHOC } from "./label-drag-n-drop-HOC";
import { ProjectSettingLabelItem } from "./project-setting-label-item";

type Props = {
  label: IIssueLabel;
  labelChildren: IIssueLabel[];
  handleLabelDelete: (label: IIssueLabel) => void;
  isUpdating: boolean;
  setIsUpdating: Dispatch<SetStateAction<boolean>>;
  isLastChild: boolean;
  onDrop: (
    draggingLabelId: string,
    droppedParentId: string | null,
    droppedLabelId: string | undefined,
    dropAtEndOfList: boolean
  ) => void;
  labelOperationsCallbacks: TLabelOperationsCallbacks;
  isEditable?: boolean;
  availableParents?: IIssueLabel[];
};

export const ProjectSettingLabelGroup = observer(function ProjectSettingLabelGroup(props: Props) {
  const {
    label,
    labelChildren,
    handleLabelDelete,
    isUpdating,
    setIsUpdating,
    isLastChild,
    onDrop,
    isEditable = false,
    labelOperationsCallbacks,
    availableParents = [],
  } = props;

  // states
  const [isEditLabelForm, setEditLabelForm] = useState(false);

  const customMenuItems: ICustomMenuItem[] = [
    {
      CustomIcon: EditIcon,
      onClick: () => {
        setEditLabelForm(true);
        setIsUpdating(true);
      },
      isVisible: true,
      text: "Edit label",
      key: "edit_label",
    },
    {
      CustomIcon: TrashIcon,
      onClick: () => {
        handleLabelDelete(label);
      },
      isVisible: true,
      text: "Delete label",
      key: "delete_label",
    },
  ];

  return (
    <LabelDndHOC label={label} isGroup isChild={false} isLastChild={isLastChild} onDrop={onDrop}>
      {(isDragging, isDroppingInLabel, dragHandleRef) => (
        <div
          className={`rounded-sm ${isDroppingInLabel ? "border-[2px] border-accent-strong" : "border-[1.5px] border-transparent"}`}
        >
          <Disclosure
            as="div"
            className={`rounded-sm text-primary ${
              !isDroppingInLabel ? "border-[0.5px] border-subtle" : ""
            } ${isDragging ? "bg-layer-1" : "bg-surface-1"}`}
            defaultOpen
          >
            {({ open }) => (
              <>
                <div className={`py-3 pr-3 pl-1 ${!isUpdating && "max-h-full overflow-y-hidden"}`}>
                  <>
                    <div className="relative flex cursor-pointer items-center justify-between gap-2">
                      {isEditLabelForm ? (
                        <CreateUpdateLabelInline
                          labelForm={isEditLabelForm}
                          setLabelForm={setEditLabelForm}
                          isUpdating
                          labelToUpdate={label}
                          labelOperationsCallbacks={labelOperationsCallbacks}
                          availableParents={availableParents}
                          onClose={() => {
                            setEditLabelForm(false);
                            setIsUpdating(false);
                          }}
                        />
                      ) : (
                        <LabelItemBlock
                          label={label}
                          isDragging={isDragging}
                          customMenuItems={customMenuItems}
                          handleLabelDelete={handleLabelDelete}
                          isLabelGroup
                          dragHandleRef={dragHandleRef}
                        />
                      )}

                      {/* LabelItemBlock renders its action section ("...", delete)
                       *  as `position: absolute; right: 2.5` and for categories it stays
                       *  always-visible (opacity-100), overlapping the right edge of the
                       *  row. Without `relative z-10` here the chevron sits BELOW that
                       *  overlay and clicks fall through to the action section instead
                       *  of toggling the disclosure (expand worked once because of
                       *  defaultOpen, but subsequent clicks were intercepted). */}
                      <Disclosure.Button
                        className="relative z-10 ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-placeholder transition-colors hover:bg-surface-2 hover:text-secondary"
                        aria-label="Развернуть категорию"
                      >
                        <ChevronDownIcon
                          className={`size-4 transition-transform ${!open ? "rotate-90" : ""}`}
                        />
                      </Disclosure.Button>
                    </div>
                    <Transition
                      show={open}
                      enter="transition duration-100 ease-out"
                      enterFrom="transform opacity-0"
                      enterTo="transform opacity-100"
                      leave="transition duration-75 ease-out"
                      leaveFrom="transform opacity-100"
                      leaveTo="transform opacity-0"
                    >
                      <Disclosure.Panel>
                        <div className="ml-6">
                          {labelChildren.map((child, index) => (
                            <div key={child.id} className={`group flex w-full items-center text-13`}>
                              <div className="w-full">
                                <ProjectSettingLabelItem
                                  label={child}
                                  handleLabelDelete={() => handleLabelDelete(child)}
                                  setIsUpdating={setIsUpdating}
                                  isParentDragging={isDragging}
                                  isChild
                                  isLastChild={index === labelChildren.length - 1}
                                  onDrop={onDrop}
                                  isEditable={isEditable}
                                  labelOperationsCallbacks={labelOperationsCallbacks}
                                  availableParents={availableParents}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </Disclosure.Panel>
                    </Transition>
                  </>
                </div>
              </>
            )}
          </Disclosure>
        </div>
      )}
    </LabelDndHOC>
  );
});

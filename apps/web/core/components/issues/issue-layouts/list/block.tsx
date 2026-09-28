/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ChevronRightIcon } from "@plane/propel/icons";
// types
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssue, IIssueDisplayProperties, TIssueMap } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// ui
import { Spinner, ControlLink, Row } from "@plane/ui";
import { cn, generateWorkItemLink } from "@plane/utils";
// components
import { MultipleSelectEntityAction } from "@/components/core/multiple-select";
import { CompleteCheckbox } from "@/components/issues/issue-layouts/complete-checkbox";
import { IssueProperties } from "@/components/issues/issue-layouts/properties";
// helpers
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web components
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
import { IssueStats } from "@/plane-web/components/issues/issue-layouts/issue-stats";
// types
import { WithDisplayPropertiesHOC } from "../properties/with-display-properties-HOC";
import { isControlStateName } from "../state-accent";
import { calculateIdentifierWidth } from "../utils";
import type { TRenderQuickActions } from "./list-view-types";

interface IssueBlockProps {
  issueId: string;
  issuesMap: TIssueMap;
  groupId: string;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  displayProperties: IIssueDisplayProperties | undefined;
  canEditProperties: (projectId: string | undefined) => boolean;
  nestingLevel: number;
  spacingLeft?: number;
  isExpanded: boolean;
  setExpanded: Dispatch<SetStateAction<boolean>>;
  selectionHelpers: TSelectionHelper;
  isCurrentBlockDragging: boolean;
  setIsCurrentBlockDragging: React.Dispatch<React.SetStateAction<boolean>>;
  canDrag: boolean;
  isEpic?: boolean;
}

export const IssueBlock = observer(function IssueBlock(props: IssueBlockProps) {
  const {
    issuesMap,
    issueId,
    groupId,
    updateIssue,
    quickActions,
    displayProperties,
    canEditProperties,
    nestingLevel,
    spacingLeft = 14,
    isExpanded,
    setExpanded,
    selectionHelpers,
    isCurrentBlockDragging,
    setIsCurrentBlockDragging,
    canDrag,
    isEpic = false,
  } = props;
  // ref
  const issueRef = useRef<HTMLDivElement | null>(null);
  // router
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  const projectId = routerProjectId?.toString();
  // hooks
  const { getProjectIdentifierById, currentProjectNextSequenceId } = useProject();
  const { getStateById } = useProjectState();
  const {
    getIsIssuePeeked,
    peekIssue,
    setPeekIssue,
    subIssues: subIssuesStore,
  } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);

  const handleIssuePeekOverview = (issue: TIssue) =>
    workspaceSlug &&
    issue &&
    issue.project_id &&
    issue.id &&
    !getIsIssuePeeked(issue.id) &&
    setPeekIssue({
      workspaceSlug,
      projectId: issue.project_id,
      issueId: issue.id,
      nestingLevel: nestingLevel,
      isArchived: !!issue.archived_at,
    });

  // derived values
  const issue = issuesMap[issueId];
  const subIssuesCount = issue?.sub_issues_count ?? 0;
  const canEditIssueProperties = canEditProperties(issue?.project_id ?? undefined);
  const isDraggingAllowed = canDrag && canEditIssueProperties;

  const { isMobile } = usePlatformOS();

  useEffect(() => {
    const element = issueRef.current;

    if (!element) return;

    return combine(
      draggable({
        element,
        canDrag: () => isDraggingAllowed,
        getInitialData: () => ({ id: issueId, type: "ISSUE", groupId }),
        onDragStart: () => {
          setIsCurrentBlockDragging(true);
        },
        onDrop: () => {
          setIsCurrentBlockDragging(false);
        },
      })
    );
  }, [isDraggingAllowed, issueId, groupId, setIsCurrentBlockDragging]);

  if (!issue) return null;

  const projectIdentifier = getProjectIdentifierById(issue.project_id);
  const issueState = getStateById(issue.state_id);
  const isSupervisedIssue = isControlStateName(issueState?.name);
  const isIssueSelected = selectionHelpers.getIsEntitySelected(issue.id);
  const isIssueActive = selectionHelpers.getIsEntityActive(issue.id);
  const isSubIssue = nestingLevel !== 0;
  const canSelectIssues = canEditIssueProperties && !selectionHelpers.isSelectionDisabled;

  const marginLeft = `${spacingLeft}px`;

  const handleToggleExpand = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (nestingLevel >= 3) {
      handleIssuePeekOverview(issue);
    } else {
      setExpanded((prevState) => {
        if (!prevState && workspaceSlug && issue && issue.project_id)
          subIssuesStore.fetchSubIssues(workspaceSlug.toString(), issue.project_id, issue.id);
        return !prevState;
      });
    }
  };

  // Calculate width for: projectIdentifier + "-" + dynamic sequence number digits
  // Use next_work_item_sequence from backend (static value from project endpoint)
  const maxSequenceId = currentProjectNextSequenceId ?? 1;
  const keyMinWidth = displayProperties?.key
    ? calculateIdentifierWidth(projectIdentifier?.length ?? 0, maxSequenceId)
    : 0;

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issue?.project_id,
    issueId,
    projectIdentifier,
    sequenceId: issue?.sequence_id,
    isEpic,
    isArchived: !!issue?.archived_at,
  });
  return (
    <ControlLink
      id={`issue-${issue.id}`}
      href={workItemLink}
      onClick={() => handleIssuePeekOverview(issue)}
      className="@container/issue block w-full cursor-pointer"
      disabled={!!issue?.tempId || issue?.is_draft}
    >
      <Row
        ref={issueRef}
        data-cw-issue-id={issue.id}
        className={cn(
          "group/list-block relative flex min-h-11 flex-col gap-1.5 bg-layer-transparent py-2.5 text-13 transition-colors hover:bg-layer-transparent-hover @min-[100rem]/issue:flex-row @min-[100rem]/issue:items-center @min-[100rem]/issue:gap-3 @min-[100rem]/issue:py-3",
          // Stacked layout on md+: a 3-column grid (gutter | title & properties | ⋯),
          // so the title and the properties band share one left edge.
          "md:@max-[100rem]/issue:grid md:@max-[100rem]/issue:grid-cols-[auto_minmax(0,1fr)_auto] md:@max-[100rem]/issue:items-baseline md:@max-[100rem]/issue:gap-x-1.5 md:@max-[100rem]/issue:gap-y-1.5",
          {
            "border-accent-strong": getIsIssuePeeked(issue.id) && peekIssue?.nestingLevel === nestingLevel,
            "border-strong-1": isIssueActive,
            "last:border-b-transparent": !getIsIssuePeeked(issue.id) && !isIssueActive,
            "bg-accent-primary/5 hover:bg-accent-primary/10": isIssueSelected,
            "bg-layer-1": isCurrentBlockDragging,
          }
        )}
        onDragStart={() => {
          if (!isDraggingAllowed) {
            setToast({
              type: TOAST_TYPE.WARNING,
              title: "Cannot move work item",
              message: !canEditIssueProperties
                ? "You are not allowed to move this work item"
                : "Drag and drop is disabled for the current grouping",
            });
          }
        }}
      >
        {/* State rail — a 3px colour bar pinned to the row's left edge. Gives
            every row its state colour at a glance; supervised rows read as a
            solid amber stripe next to the muted title below. */}
        {issueState && (
          <span
            aria-hidden
            className={cn("pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-r-sm", {
              "opacity-40": !isSupervisedIssue,
            })}
            style={{ backgroundColor: issueState.color }}
          />
        )}
        {/* Below lg the properties wrap under the title, so the title wraps too
            and reads in full. Checkbox and key flow inline at the start of the
            paragraph, so the 2nd+ lines use the full width under them. */}
        {/* Title keeps a guaranteed width on the inline (wide) layout: properties
            may wrap onto a second line on their side, but never eat the title. */}
        <div className="flex w-full gap-2 truncate @max-[100rem]/issue:items-start md:@max-[100rem]/issue:contents @min-[100rem]/issue:w-auto @min-[100rem]/issue:min-w-[16rem] @min-[100rem]/issue:flex-1">
          <div className="flex flex-grow items-center gap-0.5 truncate max-md:block @max-[100rem]/issue:items-baseline md:@max-[100rem]/issue:contents">
            <div
              className="flex flex-shrink-0 items-center gap-1 max-md:inline-flex max-md:align-baseline @max-[100rem]/issue:mr-1 @max-[100rem]/issue:items-baseline md:@max-[100rem]/issue:col-start-1 md:@max-[100rem]/issue:row-start-1 @max-[100rem]/issue:[&>*]:self-center"
              style={isSubIssue ? { marginLeft } : {}}
            >
              {/* select checkbox */}
              {projectId && canSelectIssues && !isEpic && (
                <Tooltip
                  tooltipContent={
                    <>
                      Only work items within the current
                      <br />
                      project can be selected.
                    </>
                  }
                  disabled={issue.project_id === projectId}
                >
                  <div className="absolute left-1 grid w-3.5 flex-shrink-0 place-items-center">
                    <MultipleSelectEntityAction
                      className={cn(
                        "pointer-events-none opacity-0 transition-opacity group-hover/list-block:pointer-events-auto group-hover/list-block:opacity-100",
                        {
                          "pointer-events-auto opacity-100": isIssueSelected,
                        }
                      )}
                      groupId={groupId}
                      id={issue.id}
                      selectionHelpers={selectionHelpers}
                      disabled={issue.project_id !== projectId}
                    />
                  </div>
                </Tooltip>
              )}
              {!isEpic && (
                <CompleteCheckbox
                  issue={issue}
                  updateIssue={updateIssue}
                  size="sm"
                  disabled={!canEditIssueProperties}
                />
              )}
              {displayProperties && (displayProperties.key || displayProperties.issue_type) && (
                <div
                  className="flex-shrink-0 @max-[100rem]/issue:!self-baseline"
                  style={{ minWidth: `${keyMinWidth}px` }}
                >
                  {issue.project_id && (
                    <IssueIdentifier
                      issueId={issueId}
                      projectId={issue.project_id}
                      size="xs"
                      variant="tertiary"
                      displayProperties={displayProperties}
                    />
                  )}
                </div>
              )}

              {/* sub-issues chevron */}
              <div
                className={cn("grid size-4 flex-shrink-0 place-items-center", {
                  "@max-[100rem]/issue:hidden": !(subIssuesCount > 0 && !isEpic),
                })}
              >
                {subIssuesCount > 0 && !isEpic && (
                  <button
                    type="button"
                    className="grid size-4 place-items-center rounded-xs text-placeholder hover:text-tertiary"
                    onClick={handleToggleExpand}
                  >
                    <ChevronRightIcon
                      className={cn("size-4", {
                        "rotate-90": isExpanded,
                      })}
                      strokeWidth={2.5}
                    />
                  </button>
                )}
              </div>

              {issue?.tempId !== undefined && (
                <div className="absolute top-0 left-0 z-[99999] h-full w-full animate-pulse bg-surface-1/20" />
              )}
            </div>

            <Tooltip
              tooltipContent={issue.name}
              isMobile={isMobile}
              position="top-start"
              disabled={isCurrentBlockDragging}
              renderByDefault={false}
            >
              <p
                className={cn(
                  "cursor-pointer truncate text-body-xs-medium",
                  "max-md:inline @max-[100rem]/issue:min-w-0 @max-[100rem]/issue:flex-1 @max-[100rem]/issue:overflow-visible @max-[100rem]/issue:text-14 @max-[100rem]/issue:leading-snug @max-[100rem]/issue:break-words @max-[100rem]/issue:whitespace-normal md:@max-[100rem]/issue:col-start-2 md:@max-[100rem]/issue:row-start-1",
                  {
                    "text-primary": !isSupervisedIssue,
                    // Supervised work is context, not a to-do — it should not
                    // compete with own work for attention.
                    "font-normal text-secondary": isSupervisedIssue,
                  }
                )}
              >
                {issue.name}
              </p>
            </Tooltip>
            {isEpic && displayProperties && (
              <WithDisplayPropertiesHOC
                displayProperties={displayProperties}
                displayPropertyKey="sub_issue_count"
                shouldRenderProperty={(properties) => !!properties.sub_issue_count}
              >
                <IssueStats issueId={issue.id} className="ml-2 text-body-xs-medium text-tertiary" />
              </WithDisplayPropertiesHOC>
            )}
          </div>
          {!issue?.tempId && (
            <div
              className={cn(
                "block rounded-sm border border-strong transition-colors md:border-transparent md:group-hover/list-block:border-strong md:@max-[100rem]/issue:col-start-3 md:@max-[100rem]/issue:row-start-1 md:@max-[100rem]/issue:self-start",
                {
                  "@min-[100rem]/issue:hidden": true,
                }
              )}
            >
              {quickActions({
                issue,
                parentRef: issueRef,
              })}
            </div>
          )}
        </div>
        <div
          // Stacked (narrow) layout on md+: properties start at the title's left edge.
          className={cn(
            "flex flex-shrink-0 items-center gap-2 md:@max-[100rem]/issue:col-span-2 md:@max-[100rem]/issue:col-start-2 md:@max-[100rem]/issue:row-start-2",
            {
              "@min-[100rem]/issue:min-w-0 @min-[100rem]/issue:flex-shrink @min-[100rem]/issue:justify-end": true,
            }
          )}
        >
          {!issue?.tempId ? (
            <>
              <IssueProperties
                className="relative flex flex-wrap items-center gap-x-2 gap-y-1.5 whitespace-nowrap @min-[100rem]/issue:min-w-0 @min-[100rem]/issue:justify-end"
                issue={issue}
                isReadOnly={!canEditIssueProperties}
                updateIssue={updateIssue}
                displayProperties={displayProperties}
                activeLayout="List"
                isEpic={isEpic}
              />
              <div
                className={cn("hidden", {
                  "@min-[100rem]/issue:flex": true,
                })}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {quickActions({
                  issue,
                  parentRef: issueRef,
                })}
              </div>
            </>
          ) : (
            <div className="h-4 w-4">
              <Spinner className="h-4 w-4" />
            </div>
          )}
        </div>
      </Row>
    </ControlLink>
  );
});

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
import { BigTaskParentCaption, BigTaskRowSummary } from "@/components/issues/big-task/list-row-meta";
import { useBigTaskInfo } from "@/components/issues/big-task/use-big-task-context";
import { ControlQuickAction } from "@/components/issues/issue-detail/control/quick-action";
import { useControlStatus } from "@/components/issues/issue-detail/control/use-control-actions";
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
import { isBigTaskStateName, isControlStateName } from "../state-accent";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { EIssuesStoreType } from "@plane/types";
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
  const storeType = useIssueStoreType();
  const subIssuesCount = issue?.sub_issues_count ?? 0;
  const canEditIssueProperties = canEditProperties(issue?.project_id ?? undefined);
  const isDraggingAllowed = canDrag && canEditIssueProperties;

  const { isMobile } = usePlatformOS();
  // Big tasks: parent caption of a step, progress of a Big task (one request per list).
  const { parent: bigTaskParent, summary: bigTaskSummary } = useBigTaskInfo(issueId);
  // Supervised work: the touch button («Коснулся» / «Поставил» / «Принял») by the properties.
  const { canAct: canControlAct } = useControlStatus(issueId, !canEditIssueProperties);
  const canTouchControl = canControlAct && !isEpic;

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
  // «Моя работа»: steps are flat rows of their own; only a Big task unfolds
  // into its steps. Project views keep Plane's usual nesting.
  const canExpandSubIssues =
    subIssuesCount > 0 && !isEpic && (storeType !== EIssuesStoreType.PROFILE || isBigTaskStateName(issueState?.name));
  const isIssueSelected = selectionHelpers.getIsEntitySelected(issue.id);
  const isIssueActive = selectionHelpers.getIsEntityActive(issue.id);
  const isSubIssue = nestingLevel !== 0;
  const canSelectIssues = canEditIssueProperties && !selectionHelpers.isSelectionDisabled;

  const marginLeft = `${spacingLeft}px`;
  // A step's parent chip gets a row of its own above the title (nested rows
  // already sit under their parent: no chip there). In the stacked grid the
  // title line then moves to row 2, so the checkbox / key / ⋯ stay level
  // with the title, not with the chip.
  const hasParentCaption = !!bigTaskParent && !isSubIssue;
  const titleRowClass = hasParentCaption ? "md:@max-[100rem]/issue:row-start-2" : "md:@max-[100rem]/issue:row-start-1";
  const bandRowClass = hasParentCaption ? "md:@max-[100rem]/issue:row-start-3" : "md:@max-[100rem]/issue:row-start-2";
  const openInPeek = (targetProjectId: string, targetIssueId: string) =>
    workspaceSlug &&
    !getIsIssuePeeked(targetIssueId) &&
    setPeekIssue({ workspaceSlug, projectId: targetProjectId, issueId: targetIssueId, nestingLevel });

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
        // State rail = the card's own left border (3px, state colour), so it
        // bends with the rounded corners instead of looking glued on.
        // Supervised rows get the full colour, the rest a softened one.
        style={
          issueState
            ? {
                borderLeftColor: isSupervisedIssue
                  ? issueState.color
                  : `color-mix(in srgb, ${issueState.color} 45%, transparent)`,
              }
            : undefined
        }
        className={cn(
          "group/list-block relative flex min-h-11 flex-col gap-1.5 rounded-[10px] border border-l-[3px] border-[#E7E1D6] bg-surface-1 py-2.5 text-13 shadow-[0_1px_1px_rgb(60_45_20/0.04)] transition-[border-color,box-shadow] hover:border-[#D6CDBE] hover:shadow-[0_3px_10px_-4px_rgb(60_45_20/0.18)] @min-[100rem]/issue:flex-row @min-[100rem]/issue:items-center @min-[100rem]/issue:gap-3 @min-[100rem]/issue:py-3",
          // Stacked layout on md+: a 3-column grid (gutter | title & properties | ⋯),
          // so the title and the properties band share one left edge.
          "md:@max-[100rem]/issue:grid md:@max-[100rem]/issue:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:@max-[100rem]/issue:items-start md:@max-[100rem]/issue:gap-x-2 md:@max-[100rem]/issue:gap-y-1.5",
          {
            "border-accent-strong": getIsIssuePeeked(issue.id) && peekIssue?.nestingLevel === nestingLevel,
            "border-strong-1": isIssueActive,
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
        {hasParentCaption && bigTaskParent && (
          <BigTaskParentCaption
            parent={bigTaskParent}
            onOpen={(parent) => openInPeek(parent.project_id, parent.id)}
            // Stacked grid: row 1 over the title column; one-line layout: before
            // the title, capped; phones: a line of its own (the row is a column).
            className="md:@max-[100rem]/issue:col-start-2 md:@max-[100rem]/issue:row-start-1 @min-[100rem]/issue:max-w-[16rem] @min-[100rem]/issue:shrink-0"
          />
        )}
        {/* Below lg the properties wrap under the title, so the title wraps too
            and reads in full. Checkbox and key flow inline at the start of the
            paragraph, so the 2nd+ lines use the full width under them. */}
        {/* Title keeps a guaranteed width on the inline (wide) layout: properties
            may wrap onto a second line on their side, but never eat the title. */}
        <div className="flex w-full gap-2 truncate @max-[100rem]/issue:items-start md:@max-[100rem]/issue:contents @min-[100rem]/issue:w-auto @min-[100rem]/issue:min-w-[16rem] @min-[100rem]/issue:flex-1">
          <div className="flex flex-grow items-center gap-0.5 truncate max-md:block max-md:leading-5 md:@max-[100rem]/issue:contents">
            <div
              className={cn(
                "flex flex-shrink-0 items-center gap-1 max-md:mr-2 max-md:inline-flex max-md:align-top @max-[100rem]/issue:h-5 @max-[100rem]/issue:gap-1.5 @max-[100rem]/issue:border-r @max-[100rem]/issue:border-strong-1 @max-[100rem]/issue:pr-2 md:@max-[100rem]/issue:col-start-1",
                titleRowClass
              )}
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
                  className="@max-[100rem]/issue:[&_*]:!font-normal flex-shrink-0 @max-[100rem]/issue:[&_*]:!text-13 @max-[100rem]/issue:[&_*]:!leading-5 @max-[100rem]/issue:[&_*]:tabular-nums"
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
                  "@max-[100rem]/issue:hidden": !canExpandSubIssues,
                })}
              >
                {canExpandSubIssues && (
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
                  "max-md:inline @max-[100rem]/issue:min-w-0 @max-[100rem]/issue:flex-1 @max-[100rem]/issue:overflow-visible @max-[100rem]/issue:!text-14 @max-[100rem]/issue:!leading-5 @max-[100rem]/issue:break-words @max-[100rem]/issue:whitespace-normal md:@max-[100rem]/issue:col-start-2",
                  titleRowClass,
                  {
                    "font-semibold text-primary": !isSupervisedIssue,
                    // Supervised work reads one step lighter than own work, but stays
                    // dark: the title is the main thing in the row either way.
                    "font-medium text-primary": isSupervisedIssue,
                  }
                )}
              >
                {issue.name}
                {bigTaskSummary && issue.project_id && (
                  <BigTaskRowSummary
                    summary={bigTaskSummary}
                    deadline={issue.target_date}
                    isClosed={issueState?.group === "completed" || issueState?.group === "cancelled"}
                    onOpenStep={(stepId) => issue.project_id && openInPeek(issue.project_id, stepId)}
                  />
                )}
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
                // Phones only: on md+ ⋯ sits with the actions at the bottom right.
                "block rounded-sm border border-strong transition-colors md:hidden",
                titleRowClass
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
          // Stacked (narrow) layout on md+: the wrapper dissolves, the properties
          // start at the title's left edge, the right column holds the deadline
          // (top) and the actions «✋ Коснулся» · ⋯ (bottom). Phones: the
          // actions at the right end of the band, ⋯ next to the title.
          className={cn("flex flex-shrink-0 items-center gap-2 max-md:items-end md:@max-[100rem]/issue:contents", {
            "@min-[100rem]/issue:min-w-0 @min-[100rem]/issue:flex-shrink @min-[100rem]/issue:justify-end": true,
          })}
        >
          {!issue?.tempId ? (
            <>
              <IssueProperties
                className={cn(
                  "relative flex flex-wrap items-center gap-x-2 gap-y-1.5 whitespace-nowrap md:@max-[100rem]/issue:col-start-2 @min-[100rem]/issue:min-w-0 @min-[100rem]/issue:justify-end",
                  bandRowClass
                )}
                issue={issue}
                isReadOnly={!canEditIssueProperties}
                updateIssue={updateIssue}
                displayProperties={displayProperties}
                activeLayout="List"
                listPart="main"
                isEpic={isEpic}
              />
              {/* Deadline column (md+): the card's top-right corner in the stacked
                  grid (the parent-caption line when there is one, so it never
                  sits on top of «Коснулся» in a tall card), before the
                  actions on the one-line layout. Phones keep it in the band. */}
              <IssueProperties
                className={cn(
                  // -mr-1.5: the label's own padding, so the word «Сегодня» ends on
                  // the same line as the «Коснулся» chip below it.
                  "-mr-1.5 flex shrink-0 justify-end max-md:hidden md:@max-[100rem]/issue:col-start-3 md:@max-[100rem]/issue:row-start-1 md:@max-[100rem]/issue:self-start md:@max-[100rem]/issue:justify-self-end"
                )}
                issue={issue}
                isReadOnly={!canEditIssueProperties}
                updateIssue={updateIssue}
                displayProperties={displayProperties}
                activeLayout="List"
                listPart="date"
                isEpic={isEpic}
              />
              {/* Right column: the deadline (top) and «✋ Коснулся» (bottom) share
                  one right edge; ⋯ has a column of its own beyond it. */}
              {canTouchControl && workspaceSlug && issue.project_id && (
                <ControlQuickAction
                  workspaceSlug={workspaceSlug}
                  projectId={issue.project_id}
                  issueId={issue.id}
                  disabled={!canEditIssueProperties}
                  withLabel
                  className={cn(
                    "-my-0.5 max-md:ml-auto md:@max-[100rem]/issue:col-start-3 md:@max-[100rem]/issue:self-end md:@max-[100rem]/issue:justify-self-end",
                    bandRowClass
                  )}
                />
              )}
              <div
                className={cn(
                  "max-md:hidden md:@max-[100rem]/issue:col-start-4 md:@max-[100rem]/issue:self-end",
                  bandRowClass
                )}
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
            <div className={cn("h-4 w-4 md:@max-[100rem]/issue:col-start-2", bandRowClass)}>
              <Spinner className="h-4 w-4" />
            </div>
          )}
        </div>
      </Row>
    </ControlLink>
  );
});

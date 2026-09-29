/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane helpers
import { MoreHorizontal } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
// types
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssue, IIssueDisplayProperties, IIssueMap } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// ui
import { ControlLink, DropIndicator } from "@plane/ui";
import { cn, generateWorkItemLink } from "@plane/utils";
// components
import RenderIfVisible from "@/components/core/render-if-visible-HOC";
import { BigTaskCardProgress, BigTaskParentStrip } from "@/components/issues/big-task/card-meta";
import { useBigTaskInfo } from "@/components/issues/big-task/use-big-task-context";
import { ControlQuickAction } from "@/components/issues/issue-detail/control/quick-action";
import { useControlStatus } from "@/components/issues/issue-detail/control/use-control-actions";
import { CompleteCheckbox } from "@/components/issues/issue-layouts/complete-checkbox";
import { KanbanTransferRuleButton } from "@/components/issues/issue-layouts/kanban/transfer-rule-button";
import { HIGHLIGHT_CLASS, getIssueBlockId } from "@/components/issues/issue-layouts/utils";
// helpers
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useKanbanView } from "@/hooks/store/use-kanban-view";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web components
import { IssueStats } from "@/plane-web/components/issues/issue-layouts/issue-stats";
import type { TRenderQuickActions } from "../list/list-view-types";
import { IssueProperties } from "../properties/all-properties";
import { WithDisplayPropertiesHOC } from "../properties/with-display-properties-HOC";
import { isBigTaskStateName } from "../state-accent";

interface IssueBlockProps {
  issueId: string;
  groupId: string;
  subGroupId: string;
  issuesMap: IIssueMap;
  displayProperties: IIssueDisplayProperties | undefined;
  draggableId: string;
  canDropOverIssue: boolean;
  canDragIssuesInCurrentGrouping: boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  canEditProperties: (projectId: string | undefined) => boolean;
  scrollableContainerRef?: MutableRefObject<HTMLDivElement | null>;
  shouldRenderByDefault?: boolean;
  isEpic?: boolean;
}

interface IssueDetailsBlockProps {
  cardRef: React.RefObject<HTMLElement>;
  issue: TIssue;
  displayProperties: IIssueDisplayProperties | undefined;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  isReadOnly: boolean;
  isEpic?: boolean;
}

const KanbanIssueDetailsBlock = observer(function KanbanIssueDetailsBlock(props: IssueDetailsBlockProps) {
  const { cardRef, issue, updateIssue, quickActions, isReadOnly, displayProperties, isEpic = false } = props;
  // refs
  const menuActionRef = useRef<HTMLDivElement | null>(null);
  // states
  const [isMenuActive, setIsMenuActive] = useState(false);
  const [isTransferRuleOpen, setIsTransferRuleOpen] = useState(false);
  // hooks
  const { isMobile } = usePlatformOS();
  // router
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString() ?? "";

  const customActionButton = (
    <div
      ref={menuActionRef}
      className={`flex h-full w-full cursor-pointer items-center rounded-sm p-1 text-placeholder hover:bg-layer-1 ${
        isMenuActive ? "bg-layer-1 text-primary" : "text-secondary"
      }`}
      onClick={() => setIsMenuActive(!isMenuActive)}
    >
      <MoreHorizontal className="h-3.5 w-3.5" />
    </div>
  );

  // derived values
  const subIssueCount = issue?.sub_issues_count ?? 0;
  // Supervised work: the touch button at the right end of the decision line.
  const { canAct: canTouchControl } = useControlStatus(issue.id, isReadOnly);
  // Big tasks: the parent chip of a step, the progress of a Big task (one request per board).
  const { parent: bigTaskParent, summary: bigTaskSummary } = useBigTaskInfo(issue.id);
  const { getStateById } = useProjectState();
  const { setPeekIssue, getIsIssuePeeked } = useIssueDetail(EIssueServiceType.ISSUES);
  const { getProjectIdentifierById } = useProject();
  const stateGroup = getStateById(issue.state_id)?.group;
  const openInPeek = (targetProjectId: string, targetIssueId: string) => {
    if (workspaceSlug && !getIsIssuePeeked(targetIssueId))
      setPeekIssue({ workspaceSlug, projectId: targetProjectId, issueId: targetIssueId });
  };

  const handleEventPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  useOutsideClickDetector(menuActionRef, () => setIsMenuActive(false));

  const projectIdentifier = getProjectIdentifierById(issue.project_id);
  const showKey = !!displayProperties?.key && !!projectIdentifier && issue.sequence_id !== undefined;
  const isActionsPinned = isMobile || isMenuActive || isTransferRuleOpen;

  // ⋯ menu at the right end of the title row. Its slot always keeps its width
  // (only visibility flips on hover), so the title never reflows under the
  // cursor. The transfer-rule arrow floats to the left of it, over the title.
  const actions = (
    <div
      className={cn("relative flex h-5 shrink-0 items-center", {
        "invisible group-hover/kanban-block:visible": !isActionsPinned,
      })}
      onClick={handleEventPropagation}
    >
      {!isReadOnly && !isEpic && workspaceSlug ? (
        <div className="absolute top-0 right-full flex h-5 items-center rounded-sm bg-layer-2 empty:hidden">
          <KanbanTransferRuleButton
            issue={issue}
            workspaceSlug={workspaceSlug}
            updateIssue={updateIssue}
            onOpenChange={setIsTransferRuleOpen}
          />
        </div>
      ) : null}
      {quickActions({
        issue,
        parentRef: cardRef,
        customActionButton,
      })}
    </div>
  );

  // Key: small and quiet, in the card's bottom-right corner (IssueProperties
  // places it); the «ID» display property still switches it off.
  const workItemKey = showKey ? (
    <span className="h-5 shrink-0 text-caption-sm-regular leading-5 whitespace-nowrap text-placeholder tabular-nums">
      {projectIdentifier}-{issue.sequence_id}
    </span>
  ) : null;

  const touchAction =
    canTouchControl && !isEpic && workspaceSlug && issue.project_id ? (
      <ControlQuickAction
        workspaceSlug={workspaceSlug}
        projectId={issue.project_id}
        issueId={issue.id}
        disabled={isReadOnly}
        // The button is taller than the 20px decision line: centred on it.
        className="-my-1 shrink-0"
      />
    ) : null;

  const bigTaskProgress =
    bigTaskSummary && issue.project_id ? (
      <BigTaskCardProgress
        summary={bigTaskSummary}
        deadline={issue.target_date}
        isClosed={stateGroup === "completed" || stateGroup === "cancelled"}
        onOpenStep={(stepId) => issue.project_id && openInPeek(issue.project_id, stepId)}
      />
    ) : null;

  /*
   * Fixed skeleton — every field keeps its place from card to card:
   *   1. parent strip (steps of a Big task), flush with the card's top edge;
   *   2. title row: checkbox · title … ⋯;
   *   3. decision line: priority · date · assignee · weight … hand (one line);
   *   4. Big task progress (a Big task card);
   *   5. context line: module, labels, the rest (the only line that wraps);
   *      the key sits quietly at its right end (IssueProperties).
   * Lines 3–5 start at the card padding, the checkbox's left edge.
   */
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {bigTaskParent && (
        <BigTaskParentStrip parent={bigTaskParent} onOpen={(parent) => openInPeek(parent.project_id, parent.id)} />
      )}

      <div className="flex min-w-0 items-start gap-2">
        {!isEpic && (
          <div className="flex h-5 shrink-0 items-center empty:hidden">
            <CompleteCheckbox issue={issue} updateIssue={updateIssue} size="sm" disabled={isReadOnly} />
          </div>
        )}
        <Tooltip tooltipContent={issue.name} isMobile={isMobile} renderByDefault={false}>
          <span className="line-clamp-3 min-w-0 flex-1 text-body-sm-semibold leading-5 break-words text-primary">
            {issue.name}
          </span>
        </Tooltip>
        {actions}
      </div>

      <IssueProperties
        className="flex min-w-0 flex-col gap-1.5 text-tertiary empty:hidden"
        issue={issue}
        displayProperties={displayProperties}
        activeLayout="Kanban"
        updateIssue={updateIssue}
        isReadOnly={isReadOnly}
        isEpic={isEpic}
        kanbanSlots={{ decisionEnd: touchAction, beforeContext: bigTaskProgress, workItemKey }}
      />

      {isEpic && displayProperties && (
        <WithDisplayPropertiesHOC
          displayProperties={displayProperties}
          displayPropertyKey="sub_issue_count"
          shouldRenderProperty={(properties) => !!properties.sub_issue_count && !!subIssueCount}
        >
          <IssueStats issueId={issue.id} className="font-medium text-tertiary" />
        </WithDisplayPropertiesHOC>
      )}
    </div>
  );
});

export const KanbanIssueBlock = observer(function KanbanIssueBlock(props: IssueBlockProps) {
  const {
    issueId,
    groupId,
    subGroupId,
    issuesMap,
    displayProperties,
    canDropOverIssue,
    canDragIssuesInCurrentGrouping,
    updateIssue,
    quickActions,
    canEditProperties,
    scrollableContainerRef,
    shouldRenderByDefault,
    isEpic = false,
  } = props;

  const cardRef = useRef<HTMLAnchorElement | null>(null);
  // router
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  // hooks
  const { getProjectIdentifierById } = useProject();
  const { getIsIssuePeeked } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);
  const { handleRedirection } = useIssuePeekOverviewRedirection(isEpic);
  const { isMobile } = usePlatformOS();
  const { getStateById } = useProjectState();

  // handlers
  const handleIssuePeekOverview = (issue: TIssue) => handleRedirection(workspaceSlug, issue, isMobile);

  const issue = issuesMap[issueId];

  const { setIsDragging: setIsKanbanDragging } = useKanbanView();

  const [isDraggingOverBlock, setIsDraggingOverBlock] = useState(false);
  const [isCurrentBlockDragging, setIsCurrentBlockDragging] = useState(false);
  // A press on a Big task chip / step link inside the card must not start a drag.
  const isPressOnNoDragRef = useRef(false);
  // Hover family of Big tasks: own id for a Big task, the parent's id for its steps.
  const { parent: bigTaskParent } = useBigTaskInfo(issueId);
  const bigTaskFamilyId = isBigTaskStateName(getStateById(issue?.state_id)?.name) ? issueId : bigTaskParent?.id;

  const canEditIssueProperties = canEditProperties(issue?.project_id ?? undefined);

  const isDragAllowed = canDragIssuesInCurrentGrouping && !issue?.tempId && canEditIssueProperties;
  const projectIdentifier = getProjectIdentifierById(issue?.project_id);

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issue?.project_id,
    issueId,
    projectIdentifier,
    sequenceId: issue?.sequence_id,
    isEpic,
    isArchived: !!issue?.archived_at,
  });

  useOutsideClickDetector(cardRef, () => {
    cardRef?.current?.classList?.remove(HIGHLIGHT_CLASS);
  });

  // Make Issue block both as as Draggable and,
  // as a DropTarget for other issues being dragged to get the location of drop
  useEffect(() => {
    const element = cardRef.current;

    if (!element) return;

    return combine(
      draggable({
        element,
        dragHandle: element,
        canDrag: () => isDragAllowed && !isPressOnNoDragRef.current,
        getInitialData: () => ({ id: issue?.id, type: "ISSUE" }),
        onDragStart: () => {
          setIsCurrentBlockDragging(true);
          setIsKanbanDragging(true);
        },
        onDrop: () => {
          setIsKanbanDragging(false);
          setIsCurrentBlockDragging(false);
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source?.data?.id !== issue?.id && canDropOverIssue,
        getData: () => ({ id: issue?.id, type: "ISSUE" }),
        onDragEnter: () => {
          setIsDraggingOverBlock(true);
        },
        onDragLeave: () => {
          setIsDraggingOverBlock(false);
        },
        onDrop: () => {
          setIsDraggingOverBlock(false);
        },
      })
    );
  }, [cardRef?.current, issue?.id, isDragAllowed, canDropOverIssue, setIsCurrentBlockDragging, setIsDraggingOverBlock]);

  if (!issue) return null;

  return (
    <>
      <DropIndicator isVisible={!isCurrentBlockDragging && isDraggingOverBlock} />
      <div
        id={`issue-${issueId}`}
        // make Z-index higher at the beginning of drag, to have a issue drag image of issue block without any overlaps
        className={cn("group/kanban-block relative mb-2", { "z-[1]": isCurrentBlockDragging })}
        onDragStart={() => {
          if (isDragAllowed) setIsCurrentBlockDragging(true);
          else {
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
        <ControlLink
          id={getIssueBlockId(issueId, groupId, subGroupId)}
          href={workItemLink}
          ref={cardRef}
          data-big-task-id={bigTaskFamilyId}
          onPointerDownCapture={(event) => {
            isPressOnNoDragRef.current = !!(event.target as HTMLElement | null)?.closest("[data-no-card-drag]");
          }}
          className={cn(
            "block w-full rounded-lg border border-subtle bg-layer-2 p-3 text-13 shadow-raised-100 outline-[0.5px] outline-transparent transition-all hover:border-strong hover:shadow-raised-200",
            { "hover:cursor-pointer": isDragAllowed },
            { "border border-accent-strong hover:border-accent-strong": getIsIssuePeeked(issue.id) },
            { "z-[100] bg-layer-1": isCurrentBlockDragging }
          )}
          onClick={() => handleIssuePeekOverview(issue)}
          disabled={!!issue?.tempId}
        >
          <RenderIfVisible
            root={scrollableContainerRef}
            defaultHeight="100px"
            horizontalOffset={100}
            verticalOffset={200}
            defaultValue={shouldRenderByDefault}
          >
            <KanbanIssueDetailsBlock
              cardRef={cardRef}
              issue={issue}
              displayProperties={displayProperties}
              updateIssue={updateIssue}
              quickActions={quickActions}
              isReadOnly={!canEditIssueProperties}
              isEpic={isEpic}
            />
          </RenderIfVisible>
        </ControlLink>
      </div>
    </>
  );
});

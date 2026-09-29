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
import { BigTaskCardProgress } from "@/components/issues/big-task/card-meta";
import { BigTaskParentCaption } from "@/components/issues/big-task/list-row-meta";
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
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
// local components
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
  // Supervised work: the touch button in the bottom-right corner, on the last properties line.
  const { canAct: canTouchControl } = useControlStatus(issue.id, isReadOnly);
  // Big tasks: the parent chip of a step, the progress of a Big task (one request per board).
  const { parent: bigTaskParent, summary: bigTaskSummary } = useBigTaskInfo(issue.id);
  const { getStateById } = useProjectState();
  const { setPeekIssue, getIsIssuePeeked } = useIssueDetail(EIssueServiceType.ISSUES);
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

  return (
    <>
      {bigTaskParent && (
        <div className="flex min-w-0">
          <BigTaskParentCaption parent={bigTaskParent} onOpen={(parent) => openInPeek(parent.project_id, parent.id)} />
        </div>
      )}
      <div className="relative">
        {issue.project_id && (
          <IssueIdentifier
            issueId={issue.id}
            projectId={issue.project_id}
            size="xs"
            variant="tertiary"
            displayProperties={displayProperties}
          />
        )}
        <div
          className={cn("absolute -top-1 right-0 flex items-center gap-0.5", {
            "hidden group-hover/kanban-block:flex": !isMobile,
            "!flex": isMenuActive || isTransferRuleOpen,
          })}
          onClick={handleEventPropagation}
        >
          {!isReadOnly && !isEpic && workspaceSlug ? (
            <KanbanTransferRuleButton
              issue={issue}
              workspaceSlug={workspaceSlug}
              updateIssue={updateIssue}
              onOpenChange={setIsTransferRuleOpen}
            />
          ) : null}
          {quickActions({
            issue,
            parentRef: cardRef,
            customActionButton,
          })}
        </div>
      </div>

      <Tooltip tooltipContent={issue.name} isMobile={isMobile} renderByDefault={false}>
        <div className="flex w-full items-start gap-1.5 text-body-sm-medium text-primary">
          {!isEpic && (
            <CompleteCheckbox
              issue={issue}
              updateIssue={updateIssue}
              size="sm"
              disabled={isReadOnly}
              className="mt-0.5"
            />
          )}
          <span className="line-clamp-2 min-w-0 flex-1">{issue.name}</span>
        </div>
      </Tooltip>

      {bigTaskSummary && issue.project_id && (
        <BigTaskCardProgress
          summary={bigTaskSummary}
          deadline={issue.target_date}
          isClosed={stateGroup === "completed" || stateGroup === "cancelled"}
          onOpenStep={(stepId) => issue.project_id && openInPeek(issue.project_id, stepId)}
        />
      )}

      <div className="flex items-end gap-2">
        <IssueProperties
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-1.5 whitespace-nowrap text-tertiary"
          issue={issue}
          displayProperties={displayProperties}
          activeLayout="Kanban"
          updateIssue={updateIssue}
          isReadOnly={isReadOnly}
          isEpic={isEpic}
        />
        {canTouchControl && !isEpic && workspaceSlug && issue.project_id && (
          <ControlQuickAction
            workspaceSlug={workspaceSlug}
            projectId={issue.project_id}
            issueId={issue.id}
            disabled={isReadOnly}
            // Centred on the last chip line: the button is taller than a chip.
            className="-my-1"
          />
        )}
      </div>

      {isEpic && displayProperties && (
        <WithDisplayPropertiesHOC
          displayProperties={displayProperties}
          displayPropertyKey="sub_issue_count"
          shouldRenderProperty={(properties) => !!properties.sub_issue_count && !!subIssueCount}
        >
          <IssueStats issueId={issue.id} className="mt-2 font-medium text-tertiary" />
        </WithDisplayPropertiesHOC>
      )}
    </>
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
            classNames="space-y-2"
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

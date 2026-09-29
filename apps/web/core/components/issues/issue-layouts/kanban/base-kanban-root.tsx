/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EIssueFilterType, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type { EIssuesStoreType } from "@plane/types";
import { EIssueServiceType, EIssueLayoutTypes } from "@plane/types";
// big tasks
import { isBigTaskStateName } from "@/components/issues/big-task/helpers";
import {
  BigTaskContextProvider,
  flattenGroupedIssueIds,
  pickBigTaskContextIds,
} from "@/components/issues/big-task/use-big-task-context";
import { useBigTaskRelationHover } from "@/components/issues/big-task/use-relation-hover";
//hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useKanbanView } from "@/hooks/store/use-kanban-view";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserPermissions } from "@/hooks/store/user";
import { useGroupIssuesDragNDrop } from "@/hooks/use-group-dragndrop";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
// store
// ui
// types
import { DeleteIssueModal } from "../../delete-issue-modal";
import { IssueLayoutHOC } from "../issue-layout-HOC";
import type { IQuickActionProps, TRenderQuickActions } from "../list/list-view-types";
//components
import { getSourceFromDropPayload } from "../utils";
import { KanBan } from "./default";
import { KanBanSwimLanes } from "./swimlanes";

export type KanbanStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW
  | EIssuesStoreType.PROFILE
  | EIssuesStoreType.TEAM
  | EIssuesStoreType.TEAM_VIEW
  | EIssuesStoreType.EPIC;

export interface IBaseKanBanLayout {
  QuickActions: FC<IQuickActionProps>;
  addIssuesToView?: (issueIds: string[]) => Promise<any>;
  canEditPropertiesBasedOnProject?: (projectId: string) => boolean;
  isCompletedCycle?: boolean;
  viewId?: string | undefined;
  isEpic?: boolean;
}

export const BaseKanBanRoot = observer(function BaseKanBanRoot(props: IBaseKanBanLayout) {
  const {
    QuickActions,
    addIssuesToView,
    canEditPropertiesBasedOnProject,
    isCompletedCycle = false,
    viewId,
    isEpic = false,
  } = props;
  // router
  const params = useParams();
  const { workspaceSlug, projectId } = params;
  // store hooks
  const storeType = useIssueStoreType() as KanbanStoreType;
  const { allowPermissions } = useUserPermissions();
  const { issueMap, issuesFilter, issues } = useIssues(storeType);
  const {
    issue: { getIssueById },
  } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);
  const {
    fetchIssues,
    fetchNextIssues,
    quickAddIssue,
    updateIssue,
    removeIssue,
    removeIssueFromView,
    archiveIssue,
    restoreIssue,
    updateFilters,
  } = useIssuesActions(storeType);

  const deleteAreaRef = useRef<HTMLDivElement | null>(null);
  const [isDragOverDelete, setIsDragOverDelete] = useState(false);

  const { isDragging } = useKanbanView();
  const { getStateById } = useProjectState();

  const displayFilters = issuesFilter?.issueFilters?.displayFilters;
  const displayProperties = issuesFilter?.issueFilters?.displayProperties;

  const sub_group_by = displayFilters?.sub_group_by;
  const group_by = displayFilters?.group_by;

  const orderBy = displayFilters?.order_by;

  useEffect(() => {
    fetchIssues("init-loader", { canGroup: true, perPageCount: sub_group_by ? 10 : 30 }, viewId);
  }, [fetchIssues, storeType, group_by, sub_group_by, viewId]);

  // Live refresh: external sources (gcal-sync, REST API, other clients) can
  // mutate issues server-side. Without polling, fields like target_date stay
  // stale on the card until the user clicks the issue and the peek panel
  // re-fetches it. Use fetchIssuesWithExistingPagination — fetchIssues calls
  // store.clear() which blanks groupedIssueIds for ~200 ms (visible flicker
  // every 15 s); fetchIssuesWithExistingPagination keeps the existing IDs
  // in place and updates issueMap entries via MobX in-place mutation.
  // Per-store dispatch: signatures differ across project/cycle/module/view/profile.
  const userIdParam = (params as Record<string, string | undefined>).userId;
  const cycleIdParam = (params as Record<string, string | undefined>).cycleId;
  const moduleIdParam = (params as Record<string, string | undefined>).moduleId;
  const wsSlug = workspaceSlug?.toString();
  const projId = projectId?.toString();
  const issuesAny = issues as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  useEffect(() => {
    if (!wsSlug) return;
    const fn = issuesAny?.fetchIssuesWithExistingPagination;
    if (typeof fn !== "function") return;
    const refresh = () => {
      if (document.hidden) return;
      try {
        if (storeType === "PROFILE" && userIdParam) {
          fn.call(issues, wsSlug, userIdParam, "mutation");
        } else if (storeType === "PROJECT_VIEW" && projId && viewId) {
          fn.call(issues, wsSlug, projId, viewId, "mutation");
        } else if (storeType === "CYCLE" && projId && cycleIdParam) {
          fn.call(issues, wsSlug, projId, "mutation", cycleIdParam);
        } else if (storeType === "MODULE" && projId && moduleIdParam) {
          fn.call(issues, wsSlug, projId, "mutation", moduleIdParam);
        } else if (storeType === "PROJECT" && projId) {
          fn.call(issues, wsSlug, projId, "mutation");
        }
      } catch {
        // Swallow refresh errors — surfacing them would only show toast spam.
      }
    };
    const interval = window.setInterval(refresh, 15_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [issues, issuesAny, storeType, wsSlug, projId, viewId, userIdParam, cycleIdParam, moduleIdParam]);

  const fetchMoreIssues = useCallback(
    (groupId?: string, subgroupId?: string) => {
      if (issues?.getIssueLoader(groupId, subgroupId) !== "pagination") {
        fetchNextIssues(groupId, subgroupId);
      }
    },
    [fetchNextIssues]
  );

  // Anti-flicker cache: every fetchIssues call (init-loader OR mutation) routes
  // through store.clear(), which sets groupedIssueIds = undefined for ~200 ms
  // before the response repopulates it. That blank window manifests as a
  // full-board flash every 15 s with the live-refresh poll. Keep the last
  // non-empty IDs map in a ref and substitute it during the gap so cards stay
  // on screen. Same pattern used by calendar-week.
  const liveGroupedIssueIds = issues?.groupedIssueIds;
  const lastGoodIdsRef = useRef<typeof liveGroupedIssueIds>(undefined);
  if (liveGroupedIssueIds && Object.keys(liveGroupedIssueIds).length > 0) {
    lastGoodIdsRef.current = liveGroupedIssueIds;
  }
  const groupedIssueIds = liveGroupedIssueIds ?? lastGoodIdsRef.current;
  // Steps get the «💼 parent» chip, Big tasks their progress: one request for the whole board.
  const bigTaskContextIds = pickBigTaskContextIds(
    flattenGroupedIssueIds(groupedIssueIds).map((id) => issueMap[id]),
    (issue) => isBigTaskStateName(getStateById(issue.state_id)?.name)
  );

  const userDisplayFilters = displayFilters || null;

  const KanBanView = sub_group_by ? KanBanSwimLanes : KanBan;

  const { enableInlineEditing, enableQuickAdd, enableIssueCreation } = issues?.viewFlags || {};

  const scrollableContainerRef = useRef<HTMLDivElement | null>(null);
  // The board mounts after the layout loader, so the hover root is tracked
  // through a callback ref (a plain ref would still be null on first effect).
  const [boardElement, setBoardElement] = useState<HTMLDivElement | null>(null);
  const setScrollableContainer = useCallback((element: HTMLDivElement | null) => {
    scrollableContainerRef.current = element;
    setBoardElement(element);
  }, []);
  useBigTaskRelationHover(boardElement);

  // states
  const [draggedIssueId, setDraggedIssueId] = useState<string | undefined>(undefined);
  const [deleteIssueModal, setDeleteIssueModal] = useState(false);

  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  const handleOnDrop = useGroupIssuesDragNDrop(storeType, orderBy, group_by, sub_group_by);

  const canEditProperties = useCallback(
    (projectId: string | undefined) => {
      const isEditingAllowedBasedOnProject =
        canEditPropertiesBasedOnProject && projectId ? canEditPropertiesBasedOnProject(projectId) : isEditingAllowed;

      return enableInlineEditing && isEditingAllowedBasedOnProject;
    },
    [canEditPropertiesBasedOnProject, enableInlineEditing, isEditingAllowed]
  );

  // rAF-driven sync of three things, every animation frame:
  //
  //   1. `--kanban-col-width` on the canvas — drives mobile column
  //      width based on the scroll container's actual clientWidth
  //      (`100vw` was unreliable on phones because of scrollbars,
  //      safe-area insets, etc.).
  //
  //   2. `[data-kanban-flex-row]` inline `height` on desktop — pins
  //      flex-row to the scroll container's clientHeight. Combined
  //      with `md:h-full` (default.tsx). On mobile we clear it.
  //
  //   3. Each column's body wrapper (the `flex-1` child of the column
  //      that contains RenderIfVisible → KanbanGroup) gets `maxHeight`
  //      pinned in JS on desktop. This is what actually constrains
  //      KanbanGroup so its `overflow-y-auto` engages for per-column
  //      scroll. Pinning `max-h-full` via Tailwind on the COLUMN
  //      itself doesn't propagate reliably to flex-1 grandchildren
  //      in Chromium — so we put the cap directly on the body wrapper.
  //      On mobile we clear the inline maxHeight so KanbanGroup grows
  //      to content (whole-board scroll lives on `.horizontal-scrollbar`).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    let lastWidthWritten = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const sb = document.querySelector<HTMLElement>('[data-layout-canvas="kanban"] .horizontal-scrollbar');
      const canvas = document.querySelector<HTMLElement>('[data-layout-canvas="kanban"]');
      if (!sb || !canvas) return;

      const rect = sb.getBoundingClientRect();
      // 32px = 16px gutter on each side of the column.
      const colWidth = Math.max(0, Math.round(rect.width) - 32);
      if (colWidth !== lastWidthWritten) {
        canvas.style.setProperty("--kanban-col-width", `${colWidth}px`);
        lastWidthWritten = colWidth;
      }

      const flexRow = canvas.querySelector<HTMLElement>("[data-kanban-flex-row]");
      if (!flexRow) return;

      const sbH = Math.max(0, Math.round(sb.clientHeight));

      // (2) flex-row height — pinned on both desktop and mobile so cols
      // fit inside the scroll container and per-column scroll engages.
      const desiredFRH = `${sbH}px`;
      if (flexRow.style.height !== desiredFRH) flexRow.style.height = desiredFRH;

      // (3) Per-column body height pin.
      //
      // Goal: column's plate hugs content when cards fit, scrolls per-
      // column when they don't.
      //
      // Why `height` (not `max-height`): Chromium has a quirk where
      // `height: 100%` on a child resolves against the parent's
      // content height, NOT its post-max-height clamped height. So
      // `max-height: 742px` on body wouldn't propagate down to
      // KanbanGroup's `h-full` — KG would stay at natural content
      // height (e.g. 2142px), making it not scrollable. Setting
      // explicit `height` on body fixes percentage resolution.
      //
      // Conditional: we only pin `height` when the column actually
      // overflows. Measured via KanbanGroup's own scrollHeight (its
      // overflow-y-auto means scrollHeight always reflects total
      // cards content regardless of clientHeight). For short columns
      // we clear `body.style.height` so the column shrinks to content
      // and the user-bg plate hugs it.
      const cols = canvas.querySelectorAll<HTMLElement>('[data-layout-column="kanban"]');
      const flexRowStyle = getComputedStyle(flexRow);
      const flexRowPaddingY =
        (parseFloat(flexRowStyle.paddingTop) || 0) + (parseFloat(flexRowStyle.paddingBottom) || 0);
      cols.forEach((col) => {
        // `kanban-col-body` class is set on the RenderIfVisible wrapper
        // in default.tsx — see classNames="kanban-col-body min-h-[120px]".
        const body = col.querySelector<HTMLElement>(":scope > .kanban-col-body");
        if (!body) return;
        let nonBodyChildrenH = 0;
        for (const child of Array.from(col.children)) {
          if (child !== body) nonBodyChildrenH += (child as HTMLElement).clientHeight;
        }
        // Include column's vertical padding + margin-bottom in the cap
        // so cap == body height that lets the column (header + body +
        // padding + margin) exactly fit `flex-row.height = sbH`.
        // - Desktop: col has 0 margin, so this collapses to the prior
        //   formula. Bottom rounded corner stays above the horizontal
        //   scrollbar's reserved 16px strip.
        // - Mobile: col has margin-bottom 16px (wallpaper backdrop strip
        //   under the plate), so cap shrinks by another 16. Without
        //   subtracting margin here the column would overflow flex-row.
        const colStyle = getComputedStyle(col);
        const colPaddingY = (parseFloat(colStyle.paddingTop) || 0) + (parseFloat(colStyle.paddingBottom) || 0);
        const colMarginY = (parseFloat(colStyle.marginTop) || 0) + (parseFloat(colStyle.marginBottom) || 0);
        const cap = Math.max(0, sbH - nonBodyChildrenH - colPaddingY - flexRowPaddingY - colMarginY);
        const kg =
          body.querySelector<HTMLElement>(":scope > .vertical-scrollbar") ??
          (body.firstElementChild as HTMLElement | null);
        const naturalH = kg ? kg.scrollHeight : body.scrollHeight;
        if (naturalH > cap) {
          const desired = `${cap}px`;
          if (body.style.height !== desired) body.style.height = desired;
        } else if (body.style.height) {
          body.style.height = "";
        }
        if (body.style.maxHeight) body.style.maxHeight = "";
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Mobile snap-to-column is now handled entirely by CSS scroll-snap
  // (`scroll-snap-type: x mandatory` on `.horizontal-scrollbar` +
  // `scroll-snap-align: center` on each column). We previously had a JS
  // rAF loop that called scrollTo to the nearest column's offsetLeft —
  // but that snap target (= align-start) conflicted with CSS center-snap
  // and the two mechanisms fought each other, leaving scroll at an
  // off-by-16px asymmetric position. CSS handles snap reliably now after
  // we removed ContentWrapper as an intermediate scroll container.

  // Enable Auto Scroll for Main Kanban
  useEffect(() => {
    const element = scrollableContainerRef.current;

    if (!element) return;

    return combine(
      autoScrollForElements({
        element,
      })
    );
  }, []);

  // Make the Issue Delete Box a Drop Target
  useEffect(() => {
    const element = deleteAreaRef.current;

    if (!element) return;

    return combine(
      dropTargetForElements({
        element,
        getData: () => ({ columnId: "issue-trash-box", groupId: "issue-trash-box", type: "DELETE" }),
        onDragEnter: () => {
          setIsDragOverDelete(true);
        },
        onDragLeave: () => {
          setIsDragOverDelete(false);
        },
        onDrop: (payload) => {
          setIsDragOverDelete(false);
          const source = getSourceFromDropPayload(payload);

          if (!source) return;

          setDraggedIssueId(source.id);
          setDeleteIssueModal(true);
        },
      })
    );
  }, [setIsDragOverDelete, setDraggedIssueId, setDeleteIssueModal]);

  const renderQuickActions: TRenderQuickActions = useCallback(
    ({ issue, parentRef, customActionButton }) => (
      <QuickActions
        parentRef={parentRef}
        customActionButton={customActionButton}
        issue={issue}
        handleDelete={async () => removeIssue(issue.project_id, issue.id)}
        handleUpdate={async (data) => updateIssue && updateIssue(issue.project_id, issue.id, data)}
        handleRemoveFromView={async () => removeIssueFromView && removeIssueFromView(issue.project_id, issue.id)}
        handleArchive={async () => archiveIssue && archiveIssue(issue.project_id, issue.id)}
        handleRestore={async () => restoreIssue && restoreIssue(issue.project_id, issue.id)}
        readOnly={!canEditProperties(issue.project_id ?? undefined) || isCompletedCycle}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isCompletedCycle, canEditProperties, removeIssue, updateIssue, removeIssueFromView, archiveIssue, restoreIssue]
  );

  const handleDeleteIssue = async () => {
    const draggedIssue = getIssueById(draggedIssueId ?? "");

    if (!draggedIssueId || !draggedIssue) return;

    try {
      await removeIssue(draggedIssue.project_id, draggedIssueId);
      setDeleteIssueModal(false);
      setDraggedIssueId(undefined);
    } catch (_error) {
      setDeleteIssueModal(false);
      setDraggedIssueId(undefined);
    }
  };

  const handleCollapsedGroups = useCallback(
    (toggle: "group_by" | "sub_group_by", value: string) => {
      if (workspaceSlug) {
        let collapsedGroups = issuesFilter?.issueFilters?.kanbanFilters?.[toggle] || [];
        if (collapsedGroups.includes(value)) {
          collapsedGroups = collapsedGroups.filter((_value) => _value != value);
        } else {
          collapsedGroups.push(value);
        }
        updateFilters(projectId?.toString() ?? "", EIssueFilterType.KANBAN_FILTERS, {
          [toggle]: collapsedGroups,
        });
      }
    },
    [workspaceSlug, issuesFilter, projectId, updateFilters]
  );

  const collapsedGroups = issuesFilter?.issueFilters?.kanbanFilters || { group_by: [], sub_group_by: [] };

  return (
    <>
      <DeleteIssueModal
        dataId={draggedIssueId}
        isOpen={deleteIssueModal}
        handleClose={() => setDeleteIssueModal(false)}
        onSubmit={handleDeleteIssue}
        isEpic={isEpic}
      />
      {/* drag and delete component */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 ${
          isDragging ? "z-40" : ""
        } top-3 mx-3 flex w-72 items-center justify-center`}
        ref={deleteAreaRef}
      >
        <div
          className={`${
            isDragging ? `opacity-100` : `opacity-0`
          } flex w-full items-center justify-center rounded-sm border-2 border-danger-strong/20 bg-surface-1 px-3 py-5 text-11 font-medium text-danger-primary italic ${
            isDragOverDelete ? "bg-danger-primary blur-2xl" : ""
          } transition duration-300`}
        >
          Drop here to delete the work item.
        </div>
      </div>
      <IssueLayoutHOC layout={EIssueLayoutTypes.KANBAN}>
        <div
          className={`horizontal-scrollbar relative flex scrollbar-lg h-full w-full bg-surface-2 ${sub_group_by ? "vertical-scrollbar overflow-y-auto" : "overflow-x-auto overflow-y-hidden md:overflow-y-hidden"}`}
          ref={setScrollableContainer}
        >
          <div className="relative h-full w-max min-w-full bg-surface-2">
            <div className="h-full w-max">
              <BigTaskContextProvider workspaceSlug={wsSlug} issueIds={bigTaskContextIds}>
                <KanBanView
                  issuesMap={issueMap}
                  groupedIssueIds={groupedIssueIds ?? {}}
                  getGroupIssueCount={issues.getGroupIssueCount}
                  displayProperties={displayProperties}
                  sub_group_by={sub_group_by}
                  group_by={group_by}
                  orderBy={orderBy}
                  updateIssue={updateIssue}
                  quickActions={renderQuickActions}
                  handleCollapsedGroups={handleCollapsedGroups}
                  collapsedGroups={collapsedGroups}
                  enableQuickIssueCreate={enableQuickAdd}
                  showEmptyGroup={userDisplayFilters?.show_empty_groups ?? true}
                  quickAddCallback={quickAddIssue}
                  disableIssueCreation={!enableIssueCreation || !isEditingAllowed || isCompletedCycle}
                  canEditProperties={canEditProperties}
                  addIssuesToView={addIssuesToView}
                  scrollableContainerRef={scrollableContainerRef}
                  handleOnDrop={handleOnDrop}
                  loadMoreIssues={fetchMoreIssues}
                  isEpic={isEpic}
                />
              </BigTaskContextProvider>
            </div>
          </div>
        </div>
      </IssueLayoutHOC>
    </>
  );
});

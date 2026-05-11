/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MutableRefObject } from "react";
import { useEffect } from "react";
import { observer } from "mobx-react";
import type {
  GroupByColumnTypes,
  IGroupByColumn,
  TGroupedIssues,
  TIssue,
  IIssueDisplayProperties,
  IIssueMap,
  TSubGroupedIssues,
  TIssueKanbanFilters,
  TIssueGroupByOptions,
  TIssueOrderByOptions,
} from "@plane/types";
// constants
// components
import RenderIfVisible from "@/components/core/render-if-visible-HOC";
import { KanbanColumnLoader } from "@/components/ui/loader/layouts/kanban-layout-loader";
// hooks
import { useKanbanView } from "@/hooks/store/use-kanban-view";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
// types
// parent components
import { useWorkFlowFDragNDrop } from "@/plane-web/components/workflow";
import type { TRenderQuickActions } from "../list/list-view-types";
import type { GroupDropLocation } from "../utils";
import { getGroupByColumns, isWorkspaceLevel, getApproximateCardHeight } from "../utils";
// components
import { HeaderGroupByCard } from "./headers/group-by-card";
import { KanbanGroup } from "./kanban-group";

export interface IKanBan {
  issuesMap: IIssueMap;
  groupedIssueIds: TGroupedIssues | TSubGroupedIssues;
  getGroupIssueCount: (
    groupId: string | undefined,
    subGroupId: string | undefined,
    isSubGroupCumulative: boolean
  ) => number | undefined;
  displayProperties: IIssueDisplayProperties | undefined;
  sub_group_by: TIssueGroupByOptions | undefined;
  group_by: TIssueGroupByOptions | undefined;
  orderBy: TIssueOrderByOptions | undefined;
  isDropDisabled?: boolean;
  dropErrorMessage?: string | undefined;
  sub_group_id?: string;
  sub_group_index?: number;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  collapsedGroups: TIssueKanbanFilters;
  handleCollapsedGroups: (toggle: "group_by" | "sub_group_by", value: string) => void;
  loadMoreIssues: (groupId?: string, subGroupId?: string) => void;
  enableQuickIssueCreate?: boolean;
  quickAddCallback?: (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>;
  disableIssueCreation?: boolean;
  addIssuesToView?: (issueIds: string[]) => Promise<TIssue>;
  canEditProperties: (projectId: string | undefined) => boolean;
  scrollableContainerRef?: MutableRefObject<HTMLDivElement | null>;
  handleOnDrop: (source: GroupDropLocation, destination: GroupDropLocation) => Promise<void>;
  showEmptyGroup?: boolean;
  subGroupIndex?: number;
  isEpic?: boolean;
}

export const KanBan = observer(function KanBan(props: IKanBan) {
  const {
    issuesMap,
    groupedIssueIds,
    getGroupIssueCount,
    displayProperties,
    sub_group_by,
    group_by,
    sub_group_id = "null",
    updateIssue,
    quickActions,
    collapsedGroups,
    handleCollapsedGroups,
    enableQuickIssueCreate,
    quickAddCallback,
    loadMoreIssues,
    disableIssueCreation,
    addIssuesToView,
    canEditProperties,
    scrollableContainerRef,
    handleOnDrop,
    showEmptyGroup = true,
    orderBy,
    isDropDisabled,
    dropErrorMessage,
    subGroupIndex = 0,
    isEpic = false,
  } = props;
  // i18n
  // store hooks
  const storeType = useIssueStoreType();
  const issueKanBanView = useKanbanView();
  // derived values
  const isDragDisabled = !issueKanBanView?.getCanUserDragDrop(group_by, sub_group_by);

  const { getIsWorkflowWorkItemCreationDisabled } = useWorkFlowFDragNDrop(group_by, sub_group_by);

  // Fork: when the URL carries `?focusedState=<id>` (e.g. user clicked the
  // "Расположение" breadcrumb in an issue's sidebar), scroll the matching
  // kanban column into view and flash a subtle highlight ring on it.
  // Cleared after one run so re-rendering doesn't re-trigger.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const stateId = params.get("focusedState");
    if (!stateId) return;
    const t = window.setTimeout(() => {
      const col = document.querySelector<HTMLElement>(
        `[data-layout-column="kanban"][data-state-id="${stateId}"]`
      );
      if (!col) return;
      col.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      col.classList.add("ring-2", "ring-accent-strong", "ring-offset-2", "rounded-md");
      window.setTimeout(() => {
        col.classList.remove("ring-2", "ring-accent-strong", "ring-offset-2", "rounded-md");
      }, 2200);
      // Strip the query param without touching history depth.
      params.delete("focusedState");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", next);
    }, 250);
    return () => window.clearTimeout(t);
  }, []);

  const list = getGroupByColumns({
    groupBy: group_by as GroupByColumnTypes,
    includeNone: true,
    isWorkspaceLevel: isWorkspaceLevel(storeType),
    isEpic: isEpic,
  });

  if (!list) return null;

  const visibilityGroupBy = (_list: IGroupByColumn): { showGroup: boolean; showIssues: boolean } => {
    if (sub_group_by) {
      const groupVisibility = {
        showGroup: true,
        showIssues: true,
      };
      if (!showEmptyGroup) {
        groupVisibility.showGroup = (getGroupIssueCount(_list.id, undefined, false) ?? 0) > 0;
      }
      return groupVisibility;
    } else {
      const groupVisibility = {
        showGroup: true,
        showIssues: true,
      };
      if (!showEmptyGroup) {
        if ((getGroupIssueCount(_list.id, undefined, false) ?? 0) > 0) groupVisibility.showGroup = true;
        else groupVisibility.showGroup = false;
      }
      if (collapsedGroups?.group_by.includes(_list.id)) groupVisibility.showIssues = false;
      return groupVisibility;
    }
  };

  const isGroupByCreatedBy = group_by === "created_by";
  const approximateCardHeight = getApproximateCardHeight(displayProperties);
  const isSubGroup = !!sub_group_id && sub_group_id !== "null";

  return (
    // NOTE: We intentionally do NOT use <ContentWrapper> here.
    // ContentWrapper applies `overflow-y-auto` which (per CSS overflow-axis
    // coercion rules) makes it a 2-axis scroll container. That breaks the
    // mobile scroll-snap on the OUTER `.horizontal-scrollbar` — per CSS
    // Scroll Snap spec, columns are captured by their nearest ancestor
    // scroll container (here = ContentWrapper), and ContentWrapper has
    // snap-type:none, so snap silently does nothing. Using a plain non-
    // scrolling div keeps `.horizontal-scrollbar` as the unique scroll
    // container, and `scroll-snap-type: x mandatory` on it actually
    // captures the columns. Vertical scrolling moves up to
    // `.horizontal-scrollbar` (its overflow-y was changed from hidden to
    // auto in base-kanban-root.tsx).
    // Desktop (≥ 768px): `md:h-full` gives flex-row a definite height
    // (= 100% of horizontal-scrollbar = visible viewport), and
    // `md:overflow-y-clip` visually clips overflowing column content
    // WITHOUT promoting flex-row to a scroll container (clip ≠ hidden in
    // CSS Overflow Module Level 3 — only hidden/auto/scroll create scroll
    // boxes). Net effect: column.height = flex-row.height via flex-stretch,
    // KanbanGroup inside the column ends up with a constrained `h-full`,
    // and KanbanGroup's own `vertical-scrollbar` (overflow-y-auto, see
    // kanban-group.tsx:283) handles per-column wheel scroll.
    //
    // We DO NOT use `md:overflow-y-auto` here. Earlier attempt: flex-row
    // itself scrolled, intercepted wheel events, and per-column scroll
    // never triggered (looked like whole-board scroll instead).
    //
    // Mobile (< 768px): NO overflow-y, NO h-full. flex-row sized by
    // content; vertical scroll lives on `.horizontal-scrollbar` (set
    // mobile-only in user-background.css). h-full on mobile would
    // shrink-trap KanbanGroup and break "scroll long column past
    // viewport".
    <div
      data-kanban-flex-row
      className="relative flex flex-row gap-4 px-4 !pt-2 !pb-0 w-max md:h-full"
    >
      {list &&
        list.length > 0 &&
        list.map((subList: IGroupByColumn, groupIndex) => {
          const groupByVisibilityToggle = visibilityGroupBy(subList);

          if (groupByVisibilityToggle.showGroup === false) return <></>;

          const issueIds = isSubGroup
            ? ((groupedIssueIds as TSubGroupedIssues)?.[subList.id]?.[sub_group_id] ?? [])
            : ((groupedIssueIds as TGroupedIssues)?.[subList.id] ?? []);
          const issueLength = issueIds?.length;
          const groupHeight = issueLength * approximateCardHeight;

          return (
            <div
              key={subList.id}
              data-layout-column="kanban"
              data-state-id={subList.id}
              // CSS variable picked up by user-background.css to tint the
              // column plate with the state's color when grouping by state.
              // Only takes effect while a user background image is active —
              // otherwise the plate doesn't render at all.
              style={subList.color ? ({ "--column-tint": subList.color } as React.CSSProperties) : undefined}
              // `self-start`: column doesn't get stretched to flex-row's
              // height — it sizes to content. When few cards → column
              // is short, the user-background-image plate hugs content.
              // When many cards → column would naturally grow taller
              // than the viewport, but base-kanban-root pins
              // `maxHeight` on the RenderIfVisible body wrapper directly,
              // which constrains KanbanGroup inside and triggers its own
              // overflow-y-auto. (max-h-full on the column itself doesn't
              // reliably cap the flex-1 child's computed height in
              // Chromium when mixed with sticky-positioned siblings.)
              className={`group relative flex flex-shrink-0 flex-col self-start ${
                groupByVisibilityToggle.showIssues ? `w-[350px]` : ``
              } `}
            >
              {sub_group_by === null && (
                <div className="sticky top-0 z-[2] w-full flex-shrink-0 bg-surface-2 py-1">
                  <HeaderGroupByCard
                    sub_group_by={sub_group_by}
                    group_by={group_by}
                    column_id={subList.id}
                    icon={subList.icon}
                    title={subList.name}
                    count={getGroupIssueCount(subList.id, undefined, false) ?? 0}
                    issuePayload={subList.payload}
                    disableIssueCreation={
                      disableIssueCreation ||
                      isGroupByCreatedBy ||
                      getIsWorkflowWorkItemCreationDisabled(subList.id, sub_group_id)
                    }
                    addIssuesToView={addIssuesToView}
                    collapsedGroups={collapsedGroups}
                    handleCollapsedGroups={handleCollapsedGroups}
                    isEpic={isEpic}
                  />
                </div>
              )}

              {groupByVisibilityToggle.showIssues && (
                <RenderIfVisible
                  verticalOffset={100}
                  horizontalOffset={100}
                  root={scrollableContainerRef}
                  // `kanban-col-body` is a stable hook for base-kanban-
                  // root.tsx (rAF) to find this wrapper and pin its
                  // `height` on desktop. We deliberately do NOT use
                  // `flex-1` here — `flex: 1 1 0%` makes flex-basis 0%
                  // which causes the layout engine to IGNORE explicit
                  // `height` on the item. Without flex-1, body is a
                  // plain block child of column (flex-col), so:
                  //   - when JS pins `height: 742px`, the value actually
                  //     applies → KanbanGroup's `h-full` inside resolves
                  //     to 742 → per-column scroll engages
                  //   - when height is cleared (short col), body sizes
                  //     to content → column hugs → plate hugs
                  classNames="kanban-col-body min-h-[120px]"
                  defaultHeight={`${groupHeight}px`}
                  placeholderChildren={
                    <KanbanColumnLoader
                      ignoreHeader
                      cardHeight={approximateCardHeight}
                      cardsInColumn={issueLength !== undefined && issueLength < 3 ? issueLength : 3}
                      shouldAnimate={false}
                    />
                  }
                  defaultValue={groupIndex < 5 && subGroupIndex < 2}
                  useIdletime
                >
                  <KanbanGroup
                    groupId={subList.id}
                    issuesMap={issuesMap}
                    groupedIssueIds={groupedIssueIds}
                    displayProperties={displayProperties}
                    sub_group_by={sub_group_by}
                    group_by={group_by}
                    orderBy={orderBy}
                    sub_group_id={sub_group_id}
                    isDragDisabled={isDragDisabled}
                    isDropDisabled={!!subList.isDropDisabled || !!isDropDisabled}
                    dropErrorMessage={subList.dropErrorMessage ?? dropErrorMessage}
                    updateIssue={updateIssue}
                    quickActions={quickActions}
                    enableQuickIssueCreate={enableQuickIssueCreate}
                    quickAddCallback={quickAddCallback}
                    disableIssueCreation={disableIssueCreation}
                    canEditProperties={canEditProperties}
                    scrollableContainerRef={scrollableContainerRef}
                    loadMoreIssues={loadMoreIssues}
                    handleOnDrop={handleOnDrop}
                    isEpic={isEpic}
                  />
                </RenderIfVisible>
              )}
            </div>
          );
        })}
    </div>
  );
});

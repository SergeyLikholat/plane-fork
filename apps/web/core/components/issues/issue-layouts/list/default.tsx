/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ContextType } from "react";
import { useEffect, useRef } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane constants
import { ALL_ISSUES } from "@plane/constants";
// types
import type {
  GroupByColumnTypes,
  TGroupedIssues,
  TIssue,
  IIssueDisplayProperties,
  TIssueMap,
  TIssueGroupByOptions,
  TIssueOrderByOptions,
  IGroupByColumn,
  TIssueKanbanFilters,
} from "@plane/types";
// components
import { MultipleSelectGroup } from "@/components/core/multiple-select";
// hooks
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
// plane web components
import { IssueBulkOperationsRoot } from "@/plane-web/components/issues/bulk-operations";
// plane web hooks
import { useBulkOperationStatus } from "@/plane-web/hooks/use-bulk-operation-status";
// utils
import type { GroupDropLocation } from "../utils";
import {
  collapseAliasedGroups,
  sortGroupedIssueIds,
  getGroupByColumns,
  getWorkspaceStateAliasMap,
  invertAliasMap,
  isWorkspaceLevel,
  isSubGrouped,
} from "../utils";
import { useIssueWeigher } from "../calendar-week/use-issue-weigher";
import { useDayCapacity } from "../week-board/use-day-capacity";
import { ListGroup } from "./list-group";
import { DayLoadContext, weighDueToday } from "./section-summary";
import type { TRenderQuickActions } from "./list-view-types";

export interface IList {
  groupedIssueIds: TGroupedIssues;
  issuesMap: TIssueMap;
  group_by: TIssueGroupByOptions | null;
  orderBy: TIssueOrderByOptions | undefined;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  displayProperties: IIssueDisplayProperties | undefined;
  enableIssueQuickAdd: boolean;
  showEmptyGroup?: boolean;
  canEditProperties: (projectId: string | undefined) => boolean;
  quickAddCallback?: (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>;
  disableIssueCreation?: boolean;
  handleOnDrop: (source: GroupDropLocation, destination: GroupDropLocation) => Promise<void>;
  addIssuesToView?: (issueIds: string[]) => Promise<TIssue>;
  isCompletedCycle?: boolean;
  loadMoreIssues: (groupId?: string) => void;
  handleCollapsedGroups: (value: string) => void;
  collapsedGroups: TIssueKanbanFilters;
  isEpic?: boolean;
}

type TDayLoadValue = ContextType<typeof DayLoadContext>;

export const List = observer(function List(props: IList) {
  const {
    groupedIssueIds: rawGroupedIssueIds,
    issuesMap,
    group_by,
    orderBy,
    updateIssue,
    quickActions,
    displayProperties,
    enableIssueQuickAdd,
    showEmptyGroup,
    canEditProperties,
    quickAddCallback,
    disableIssueCreation,
    handleOnDrop,
    addIssuesToView,
    isCompletedCycle = false,
    loadMoreIssues,
    handleCollapsedGroups,
    collapsedGroups,
    isEpic = false,
  } = props;

  const storeType = useIssueStoreType();
  const { workspaceSlug } = useParams();
  // plane web hooks
  const isBulkOperationsEnabled = useBulkOperationStatus();

  const containerRef = useRef<HTMLDivElement | null>(null);

  const atWorkspaceLevel = isWorkspaceLevel(storeType);
  // Day-load inputs for the section headers (see dayLoad below); no fetch off «Моя работа».
  const loadSlug = atWorkspaceLevel ? workspaceSlug?.toString() : undefined;
  const weigh = useIssueWeigher(loadSlug);
  const { limitFor } = useDayCapacity(loadSlug);

  const groups = getGroupByColumns({
    groupBy: group_by as GroupByColumnTypes,
    includeNone: true,
    isWorkspaceLevel: atWorkspaceLevel,
    isEpic: isEpic,
  });

  // Workspace-level state grouping renders one column per state NAME, so the
  // server's per-project buckets have to be merged into the canonical one.
  const stateAliasMap = group_by === "state" && atWorkspaceLevel ? getWorkspaceStateAliasMap() : undefined;
  // Merged buckets mix several projects → re-sort them by the chosen order.
  const mergedIssueIds = stateAliasMap
    ? collapseAliasedGroups(rawGroupedIssueIds, stateAliasMap, { orderBy, issuesMap })
    : rawGroupedIssueIds;
  // «Моя работа» spans projects: order every section on the client so the
  // chosen «Сортировать по» holds across projects.
  const groupedIssueIds = atWorkspaceLevel ? sortGroupedIssueIds(mergedIssueIds, orderBy, issuesMap) : mergedIssueIds;
  const aliasedGroupIds = stateAliasMap ? invertAliasMap(stateAliasMap) : undefined;

  // Enable Auto Scroll for Main Kanban
  useEffect(() => {
    const element = containerRef.current;

    if (!element) return;

    return combine(
      autoScrollForElements({
        element,
      })
    );
  }, [containerRef]);

  if (!groups) return null;

  const getGroupIndex = (groupId: string | undefined) => groups.findIndex(({ id }) => id === groupId);

  const is_list = group_by === null ? true : false;

  // create groupIds array and entities object for bulk ops
  const groupIds = groups.map((g) => g.id);
  const orderedGroups: Record<string, string[]> = {};
  groupIds.forEach((gID) => {
    orderedGroups[gID] = [];
  });
  let entities: Record<string, string[]> = {};

  if (is_list) {
    entities = Object.assign(orderedGroups, { [groupIds[0]]: groupedIssueIds[ALL_ISSUES] ?? [] });
  } else if (!isSubGrouped(groupedIssueIds)) {
    entities = Object.assign(orderedGroups, { ...groupedIssueIds });
  } else {
    entities = orderedGroups;
  }
  // «Моя работа»: the section headers show today's load against the day limit
  // (week-board weights, the limit set for today). Project lists skip it.
  let dayLoad: TDayLoadValue | null = null;
  if (loadSlug && group_by === "state" && !isSubGrouped(groupedIssueIds)) {
    const allIds = Object.values(groupedIssueIds).flatMap((ids) => (Array.isArray(ids) ? ids : []));
    dayLoad = { weigh, limit: limitFor(new Date()), dayTotal: weighDueToday(allIds, issuesMap, weigh).weight };
  }

  return (
    <DayLoadContext.Provider value={dayLoad}>
      <div className="relative flex size-full flex-col">
        {groups && (
          <MultipleSelectGroup
            containerRef={containerRef}
            entities={entities}
            disabled={!isBulkOperationsEnabled || isEpic}
          >
            {(helpers) => (
              <>
                {/* Warm desk background (LIST_DESK_BG): the scrollbar lane matches
                  it instead of a white strip; thin bar on desktop, none on
                  phones (touch scroll). */}
                <div
                  ref={containerRef}
                  data-order-by={orderBy ?? ""}
                  className="vertical-scrollbar relative scrollbar-xs size-full overflow-x-hidden overflow-y-auto bg-[#F6F3EE] max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"
                >
                  {groups.map((group: IGroupByColumn) => (
                    <ListGroup
                      key={group.id}
                      groupIssueIds={groupedIssueIds?.[group.id]}
                      aliasGroupIds={aliasedGroupIds?.[group.id]}
                      issuesMap={issuesMap}
                      group_by={group_by}
                      group={group}
                      updateIssue={updateIssue}
                      quickActions={quickActions}
                      orderBy={orderBy}
                      getGroupIndex={getGroupIndex}
                      handleOnDrop={handleOnDrop}
                      displayProperties={displayProperties}
                      enableIssueQuickAdd={enableIssueQuickAdd}
                      showEmptyGroup={showEmptyGroup}
                      canEditProperties={canEditProperties}
                      quickAddCallback={quickAddCallback}
                      disableIssueCreation={disableIssueCreation}
                      addIssuesToView={addIssuesToView}
                      isCompletedCycle={isCompletedCycle}
                      loadMoreIssues={loadMoreIssues}
                      containerRef={containerRef}
                      selectionHelpers={helpers}
                      handleCollapsedGroups={handleCollapsedGroups}
                      collapsedGroups={collapsedGroups}
                      isEpic={isEpic}
                    />
                  ))}
                </div>

                <IssueBulkOperationsRoot selectionHelpers={helpers} />
              </>
            )}
          </MultipleSelectGroup>
        )}
      </div>
    </DayLoadContext.Provider>
  );
});

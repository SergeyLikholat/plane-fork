/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode, SyntheticEvent } from "react";
import { useCallback, useMemo } from "react";
import { xor } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// icons
import { Paperclip } from "lucide-react";
// i18n
import { useTranslation } from "@plane/i18n";
import { LinkIcon, StartDatePropertyIcon, DueDatePropertyIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssue, IIssueDisplayProperties, TIssuePriorities } from "@plane/types";
// ui
import {
  cn,
  getDate,
  renderFormattedPayloadDate,
  generateWorkItemLink,
  shouldHighlightIssueDueDate,
} from "@plane/utils";
// components
import { CycleDropdown } from "@/components/dropdowns/cycle";
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { pluralSubIssues } from "@/components/issues/big-task/helpers";
import { useBigTaskInfo } from "@/components/issues/big-task/use-big-task-context";
import { DateTimeDurationPopup } from "@/components/issues/date-time-duration-popup";
import { useCalendarOptions } from "@/components/issues/use-calendar-options";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useIssues } from "@/hooks/store/use-issues";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useAppRouter } from "@/hooks/use-app-router";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web components
import { WorkItemLayoutAdditionalProperties } from "@/plane-web/components/issues/issue-layouts/additional-properties";
// local components
import { IssuePropertyLabels } from "./labels";
import { ListLead, splitListLead } from "./list-lead";
import { WithDisplayPropertiesHOC } from "./with-display-properties-HOC";

export interface IIssueProperties {
  issue: TIssue;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  displayProperties: IIssueDisplayProperties | undefined;
  isReadOnly: boolean;
  className: string;
  activeLayout: string;
  isEpic?: boolean;
  /**
   * List only. «date» renders just the deadline for the row's date column
   * (short, «Сегодня»/«Завтра», no outline); «main» renders the rest, with the
   * date kept only on phones (the column is md+).
   */
  listPart?: "main" | "date";
  /** Kanban only: extra nodes placed into the card's fixed lines. */
  kanbanSlots?: {
    /** Right end of the decision line (the supervised-work hand). */
    decisionEnd?: ReactNode;
    /** Full-width block between the decision and the context lines (Big task progress). */
    beforeContext?: ReactNode;
    /** Work item key («AX-217»), placed in the bottom-right corner of the card. */
    workItemKey?: ReactNode;
  };
}

/** Deadline before today on an open work item. */
const isPastDue = (targetDate: string | null | undefined, stateGroup: string | undefined): boolean => {
  if (stateGroup === "completed" || stateGroup === "cancelled") return false;
  const date = getDate(targetDate ?? undefined);
  if (!date) return false;
  const now = new Date();
  return date.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

export const IssueProperties = observer(function IssueProperties(props: IIssueProperties) {
  const {
    issue,
    updateIssue,
    displayProperties,
    isReadOnly,
    className,
    activeLayout,
    isEpic = false,
    listPart,
    kanbanSlots,
  } = props;
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const { labelMap } = useLabel();
  const storeType = useIssueStoreType();
  const {
    issues: { changeModulesInIssue },
  } = useIssues(storeType);
  const {
    issues: { addCycleToIssue, removeCycleFromIssue },
  } = useIssues(storeType);
  const { areEstimateEnabledByProjectId } = useProjectEstimates();
  const { getStateById } = useProjectState();
  const { isMobile } = usePlatformOS();
  const projectDetails = getProjectById(issue.project_id);

  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();

  // derived values
  const stateDetails = getStateById(issue.state_id);
  const subIssueCount = issue?.sub_issues_count ?? 0;
  // A Big task card shows its step progress instead of the sub-issue count
  // (kanban/block.tsx); list rows keep the count next to their Big task line.
  const { summary: bigTaskSummary } = useBigTaskInfo(issue.id);
  const isKanban = activeLayout === "Kanban";
  // List rows read as a calm line: no outlines around the property controls.
  const isList = activeLayout === "List";
  const withText = isList ? "transparent-with-text" : "border-with-text";
  const showSubIssueCount = !(isKanban && bigTaskSummary);

  const issueOperations = useMemo(
    () => ({
      addModulesToIssue: async (moduleIds: string[]) => {
        if (!workspaceSlug || !issue.project_id || !issue.id) return;
        await changeModulesInIssue?.(workspaceSlug.toString(), issue.project_id, issue.id, moduleIds, []);
      },
      removeModulesFromIssue: async (moduleIds: string[]) => {
        if (!workspaceSlug || !issue.project_id || !issue.id) return;
        await changeModulesInIssue?.(workspaceSlug.toString(), issue.project_id, issue.id, [], moduleIds);
      },
      addIssueToCycle: async (cycleId: string) => {
        if (!workspaceSlug || !issue.project_id || !issue.id) return;
        await addCycleToIssue?.(workspaceSlug.toString(), issue.project_id, cycleId, issue.id);
      },
      removeIssueFromCycle: async () => {
        if (!workspaceSlug || !issue.project_id || !issue.id) return;
        await removeCycleFromIssue?.(workspaceSlug.toString(), issue.project_id, issue.id);
      },
    }),
    [workspaceSlug, issue, changeModulesInIssue, addCycleToIssue, removeCycleFromIssue]
  );

  const handleState = async (stateId: string) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, { state_id: stateId });
  };

  const handlePriority = async (value: TIssuePriorities) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, { priority: value });
  };

  const handleLabel = async (ids: string[]) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, { label_ids: ids });
  };

  const handleAssignee = async (ids: string[]) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, { assignee_ids: ids });
  };

  const handleModule = useCallback(
    (moduleIds: string[] | null) => {
      if (!issue || !issue.module_ids || !moduleIds) return;

      const updatedModuleIds = xor(issue.module_ids, moduleIds);
      const modulesToAdd: string[] = [];
      const modulesToRemove: string[] = [];
      for (const moduleId of updatedModuleIds)
        if (issue.module_ids.includes(moduleId)) modulesToRemove.push(moduleId);
        else modulesToAdd.push(moduleId);
      if (modulesToAdd.length > 0) issueOperations.addModulesToIssue(modulesToAdd);
      if (modulesToRemove.length > 0) issueOperations.removeModulesFromIssue(modulesToRemove);
    },
    [issueOperations, issue]
  );

  const handleCycle = useCallback(
    (cycleId: string | null) => {
      if (!issue || issue.cycle_id === cycleId) return;
      if (cycleId) issueOperations.addIssueToCycle?.(cycleId);
      else issueOperations.removeIssueFromCycle?.();
    },
    [issue, issueOperations]
  );

  const handleStartDate = async (date: Date | null) => {
    if (updateIssue)
      await updateIssue(issue.project_id, issue.id, { start_date: date ? renderFormattedPayloadDate(date) : null });
  };

  const handleTargetDate = async (date: Date | null) => {
    if (updateIssue)
      await updateIssue(issue.project_id, issue.id, { target_date: date ? renderFormattedPayloadDate(date) : null });
  };

  const handleEstimate = async (value: string | undefined) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, { estimate_point: value });
  };

  const workItemLink = generateWorkItemLink({
    workspaceSlug: workspaceSlug?.toString(),
    projectId: issue?.project_id,
    issueId: issue?.id,
    projectIdentifier: projectDetails?.identifier,
    sequenceId: issue?.sequence_id,
    isArchived: !!issue?.archived_at,
    isEpic,
  });

  const redirectToIssueDetail = () => router.push(`${workItemLink}#sub-issues`);

  const calendarOpts = useCalendarOptions(issue.project_id, issue.label_ids);

  if (!displayProperties || !issue.project_id) return null;

  // date range is enabled only when both dates are available and both dates are enabled
  const isDateRangeEnabled: boolean = Boolean(
    issue.start_date && issue.target_date && displayProperties.start_date && displayProperties.due_date
  );

  const defaultLabelOptions = issue?.label_ids?.map((id) => labelMap[id]) || [];

  const minDate = getDate(issue.start_date);
  const maxDate = getDate(issue.target_date);

  const handleEventPropagation = (e: SyntheticEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // --- property elements (each is null when its display property is off) ---

  const stateProperty = (
    <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="state">
      <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
        <StateDropdown
          buttonContainerClassName="truncate max-w-40"
          value={issue.state_id}
          onChange={handleState}
          projectId={issue.project_id}
          disabled={isReadOnly}
          buttonVariant={withText}
          renderByDefault={isMobile}
          showTooltip
        />
      </div>
    </WithDisplayPropertiesHOC>
  );

  const priorityProperty = (
    <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="priority">
      <div
        className={cn("h-5", { "shrink-0": isKanban })}
        onFocus={handleEventPropagation}
        onClick={handleEventPropagation}
      >
        <PriorityDropdown
          value={issue?.priority}
          onChange={handlePriority}
          disabled={isReadOnly}
          buttonVariant={isList ? "transparent-without-text" : "border-without-text"}
          renderByDefault={isMobile}
          showTooltip
        />
      </div>
    </WithDisplayPropertiesHOC>
  );

  /* Combined date / time / duration popup — replaces the legacy start-date +
     target-date controls. Renders when both of those display properties are on.
     On a kanban card it is the only item of the decision line that may shrink:
     its short label truncates instead of pushing the line onto a second row. */
  const dateProperty = (
    <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey={["start_date", "due_date"]}>
      <div
        className={cn("h-5", { "min-w-0": isKanban, "md:hidden": listPart === "main" })}
        onFocus={handleEventPropagation}
        onClick={handleEventPropagation}
      >
        <DateTimeDurationPopup
          value={{
            target_date: issue.target_date ?? null,
            target_time: issue.target_time ?? null,
            start_date: issue.start_date ?? null,
            start_time: issue.start_time ?? null,
          }}
          onChange={(patch) => updateIssue && updateIssue(issue.project_id!, issue.id, patch)}
          disabled={isReadOnly}
          placeholder={t("common.order_by.due_date")}
          compact
          shortLabel={isKanban}
          calendars={{
            options: calendarOpts.options,
            selectedId: calendarOpts.selectedId,
            onChange: (id) =>
              updateIssue &&
              updateIssue(issue.project_id!, issue.id, {
                label_ids: calendarOpts.buildNextLabelIds(issue.label_ids, id),
              }),
          }}
          buttonClassName={cn("rounded", isList ? "border-0" : "border border-subtle-1", {
            "text-danger-primary": shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group),
          })}
        />
      </div>
    </WithDisplayPropertiesHOC>
  );

  const assigneeProperty = (
    <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="assignee">
      <div
        className={cn("h-5", { "shrink-0": isKanban })}
        onFocus={handleEventPropagation}
        onClick={handleEventPropagation}
      >
        <MemberDropdown
          projectId={issue?.project_id}
          value={issue?.assignee_ids}
          onChange={handleAssignee}
          disabled={isReadOnly}
          multiple
          buttonVariant={issue.assignee_ids?.length > 0 ? "transparent-without-text" : "border-without-text"}
          buttonClassName={issue.assignee_ids?.length > 0 ? "hover:bg-transparent px-0" : ""}
          showTooltip={issue?.assignee_ids?.length === 0}
          placeholder={t("common.assignees")}
          optionsClassName="z-10"
          tooltipContent=""
          renderByDefault={isMobile}
        />
      </div>
    </WithDisplayPropertiesHOC>
  );

  const moduleProperty = !isEpic && projectDetails?.module_view && (
    <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="modules">
      <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
        <ModuleDropdown
          buttonContainerClassName="truncate max-w-40"
          projectId={issue?.project_id}
          value={issue?.module_ids ?? []}
          onChange={handleModule}
          disabled={isReadOnly}
          renderByDefault={isMobile}
          multiple
          buttonVariant={withText}
          showCount
          showTooltip
        />
      </div>
    </WithDisplayPropertiesHOC>
  );

  const cycleProperty = !isEpic && projectDetails?.cycle_view && (
    <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="cycle">
      <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
        <CycleDropdown
          buttonContainerClassName="truncate max-w-40"
          projectId={issue?.project_id}
          value={issue?.cycle_id}
          onChange={handleCycle}
          disabled={isReadOnly}
          buttonVariant={withText}
          renderByDefault={isMobile}
          showTooltip
        />
      </div>
    </WithDisplayPropertiesHOC>
  );

  const isEstimateEnabled = areEstimateEnabledByProjectId(issue.project_id);
  const estimateProperty = isEstimateEnabled && (
    <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="estimate">
      <div
        className={cn("h-5", { "shrink-0": isKanban })}
        onFocus={handleEventPropagation}
        onClick={handleEventPropagation}
      >
        <EstimateDropdown
          value={issue.estimate_point ?? undefined}
          onChange={handleEstimate}
          projectId={issue.project_id}
          disabled={isReadOnly}
          buttonVariant={withText}
          renderByDefault={isMobile}
          showTooltip
          compact={isKanban}
        />
      </div>
    </WithDisplayPropertiesHOC>
  );

  const subIssueProperty = !isEpic && showSubIssueCount && (
    <WithDisplayPropertiesHOC
      displayProperties={displayProperties}
      displayPropertyKey="sub_issue_count"
      shouldRenderProperty={(properties) => !!properties.sub_issue_count && !!subIssueCount}
    >
      <Tooltip
        tooltipHeading={t("common.sub_work_items")}
        tooltipContent={`${subIssueCount}`}
        isMobile={isMobile}
        renderByDefault={false}
      >
        <div
          onFocus={handleEventPropagation}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (subIssueCount) redirectToIssueDetail();
          }}
          className={cn(
            "flex h-5 flex-shrink-0 items-center justify-center gap-2 overflow-hidden rounded-sm border-[0.5px] border-strong px-2.5 py-1",
            {
              "cursor-pointer hover:bg-layer-1": subIssueCount,
            }
          )}
        >
          <div className="text-caption-sm-regular tabular-nums">
            ⤷ {subIssueCount} {pluralSubIssues(subIssueCount)}
          </div>
        </div>
      </Tooltip>
    </WithDisplayPropertiesHOC>
  );

  const attachmentProperty = (
    <WithDisplayPropertiesHOC
      displayProperties={displayProperties}
      displayPropertyKey="attachment_count"
      shouldRenderProperty={(properties) => !!properties.attachment_count && !!issue.attachment_count}
    >
      <Tooltip
        tooltipHeading={t("common.attachments")}
        tooltipContent={`${issue.attachment_count}`}
        isMobile={isMobile}
        renderByDefault={false}
      >
        <div
          className="flex h-5 flex-shrink-0 items-center justify-center gap-2 overflow-hidden rounded-sm border-[0.5px] border-strong px-2.5 py-1"
          onFocus={handleEventPropagation}
          onClick={handleEventPropagation}
        >
          <Paperclip className="h-3 w-3 flex-shrink-0" strokeWidth={2} />
          <div className="text-caption-sm-regular">{issue.attachment_count}</div>
        </div>
      </Tooltip>
    </WithDisplayPropertiesHOC>
  );

  const linkProperty = (
    <WithDisplayPropertiesHOC
      displayProperties={displayProperties}
      displayPropertyKey="link"
      shouldRenderProperty={(properties) => !!properties.link && !!issue.link_count}
    >
      <Tooltip
        tooltipHeading={t("common.links")}
        tooltipContent={`${issue.link_count}`}
        isMobile={isMobile}
        renderByDefault={false}
      >
        <div
          className="flex h-5 flex-shrink-0 items-center justify-center gap-2 overflow-hidden rounded-sm border-[0.5px] border-strong px-2.5 py-1"
          onFocus={handleEventPropagation}
          onClick={handleEventPropagation}
        >
          <LinkIcon className="h-3 w-3 flex-shrink-0" strokeWidth={2} />
          <div className="text-caption-sm-regular">{issue.link_count}</div>
        </div>
      </Tooltip>
    </WithDisplayPropertiesHOC>
  );

  const additionalProperties = (
    <WorkItemLayoutAdditionalProperties displayProperties={displayProperties} issue={issue} />
  );

  // List: people and the control phase lead the line (ListLead); the labels
  // control shows the rest and keeps the lead labels on every change.
  const listLead = isList ? splitListLead(issue.label_ids, labelMap) : null;
  const leadIds = listLead?.leadIds ?? [];
  const labelsProperty = (
    <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="labels">
      <IssuePropertyLabels
        projectId={issue?.project_id || null}
        value={(issue?.label_ids || []).filter((id) => !leadIds.includes(id))}
        defaultOptions={defaultLabelOptions}
        onChange={(ids) =>
          handleLabel(
            leadIds.length ? [...new Set([...ids, ...leadIds.filter((id) => issue.label_ids?.includes(id))])] : ids
          )
        }
        noLabelBorder={isList}
        disabled={isReadOnly}
        renderByDefault={isMobile}
        hideDropdownArrow
        maxRender={4}
      />
    </WithDisplayPropertiesHOC>
  );

  if (isKanban) {
    /*
     * Kanban card: two fixed lines instead of one wrapping band, so every
     * field keeps its place from card to card.
     *   decision — priority · date · assignee · weight … hand; never wraps,
     *              only the date label truncates;
     *   context  — module, labels (+), then the rest; the only line that wraps.
     * `kanbanSlots.beforeContext` (Big task progress) sits between the two.
     * `kanbanSlots.workItemKey` goes to the bottom-right corner: the end of
     * the context line, or of the decision line (before the hand) when the
     * context line has nothing to show. On the context line it has a column
     * of its own, so the chips wrap before it and it never adds a line.
     */
    const workItemKey = kanbanSlots?.workItemKey;
    const hasDecisionItems =
      !!displayProperties.priority ||
      (!!displayProperties.start_date && !!displayProperties.due_date) ||
      !!displayProperties.assignee ||
      (isEstimateEnabled && !!displayProperties.estimate);
    const hasContextItems =
      !!displayProperties.labels ||
      !!displayProperties.state ||
      (!isEpic && !!projectDetails?.module_view && !!displayProperties.modules) ||
      (!isEpic && !!projectDetails?.cycle_view && !!displayProperties.cycle) ||
      (!isEpic && showSubIssueCount && !!displayProperties.sub_issue_count && !!subIssueCount) ||
      (!!displayProperties.link && !!issue.link_count) ||
      (!!displayProperties.attachment_count && !!issue.attachment_count);
    const keyOnDecisionLine = !hasContextItems && hasDecisionItems;
    const hasDecisionLine = hasDecisionItems || !!kanbanSlots?.decisionEnd;
    return (
      <div className={className}>
        {hasDecisionLine && (
          <div className="flex h-5 min-w-0 flex-nowrap items-center gap-1.5" data-card-line="decision">
            {priorityProperty}
            {dateProperty}
            {assigneeProperty}
            {estimateProperty}
            <span className="min-w-0 flex-1" aria-hidden />
            {keyOnDecisionLine && workItemKey}
            {kanbanSlots?.decisionEnd}
          </div>
        )}
        {kanbanSlots?.beforeContext}
        {(hasContextItems || (!keyOnDecisionLine && !!workItemKey)) && (
          <div className="flex min-w-0 items-end gap-1.5" data-card-line="context">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {moduleProperty}
              {labelsProperty}
              {stateProperty}
              {cycleProperty}
              {subIssueProperty}
              {linkProperty}
              {attachmentProperty}
              {additionalProperties}
            </div>
            {workItemKey}
          </div>
        )}
      </div>
    );
  }

  if (isList && listPart === "date") {
    if (!displayProperties.due_date || !issue.target_date) return null;
    return (
      <div className={className} onFocus={handleEventPropagation} onClick={handleEventPropagation}>
        <DateTimeDurationPopup
          value={{
            target_date: issue.target_date ?? null,
            target_time: issue.target_time ?? null,
            start_date: issue.start_date ?? null,
            start_time: issue.start_time ?? null,
          }}
          onChange={(patch) => updateIssue && updateIssue(issue.project_id!, issue.id, patch)}
          disabled={isReadOnly}
          compact
          shortLabel
          relativeLabel
          hideIcon
          // The column reads «Сегодня» in ink; only a passed date is red.
          buttonClassName={cn("border-0 text-caption-md-semibold text-primary", {
            "text-danger-primary": isPastDue(issue.target_date, stateDetails?.group),
          })}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {listLead && displayProperties.labels && <ListLead lead={listLead} />}
      {stateProperty}
      {priorityProperty}
      {dateProperty}
      {assigneeProperty}
      {estimateProperty}
      {moduleProperty}
      {cycleProperty}
      {subIssueProperty}
      {attachmentProperty}
      {linkProperty}
      {additionalProperties}
      {labelsProperty}
    </div>
  );
});

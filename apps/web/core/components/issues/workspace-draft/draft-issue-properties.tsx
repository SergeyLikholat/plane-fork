/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// icons
import { DueDatePropertyIcon, StartDatePropertyIcon } from "@plane/propel/icons";
// types
import type { TIssuePriorities, TWorkspaceDraftIssue } from "@plane/types";
import { getDate, renderFormattedPayloadDate, shouldHighlightIssueDueDate } from "@plane/utils";
// components
import { CycleDropdown } from "@/components/dropdowns/cycle";
import { DateTimeDurationPopup } from "@/components/issues/date-time-duration-popup";
import { useCalendarOptions } from "@/components/issues/use-calendar-options";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
// helpers
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useWorkspaceDraftIssues } from "@/hooks/store/workspace-draft";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { IssuePropertyLabels } from "../issue-layouts/properties";
// local components

export interface IIssueProperties {
  issue: TWorkspaceDraftIssue;
  updateIssue:
    | ((projectId: string | null, issueId: string, data: Partial<TWorkspaceDraftIssue>) => Promise<void>)
    | undefined;
  className: string;
}

export const DraftIssueProperties = observer(function DraftIssueProperties(props: IIssueProperties) {
  const { issue, updateIssue, className } = props;
  // store hooks
  const { getProjectById } = useProject();
  const { labelMap } = useLabel();
  const { addCycleToIssue, addModulesToIssue } = useWorkspaceDraftIssues();
  const { areEstimateEnabledByProjectId } = useProjectEstimates();
  const { getStateById } = useProjectState();
  const { isMobile } = usePlatformOS();
  const projectDetails = getProjectById(issue.project_id);

  // router
  const { workspaceSlug } = useParams();
  // derived values
  const stateDetails = getStateById(issue.state_id);

  const issueOperations = useMemo(
    () => ({
      updateIssueModules: async (moduleIds: string[]) => {
        if (!workspaceSlug || !issue.id) return;
        await addModulesToIssue(workspaceSlug.toString(), issue.id, moduleIds);
      },
      addIssueToCycle: async (cycleId: string) => {
        if (!workspaceSlug || !issue.id) return;
        await addCycleToIssue(workspaceSlug.toString(), issue.id, cycleId);
      },
      removeIssueFromCycle: async () => {
        if (!workspaceSlug || !issue.id) return;
        // TODO: To be checked
        await addCycleToIssue(workspaceSlug.toString(), issue.id, "");
      },
    }),
    [workspaceSlug, issue, addCycleToIssue, addModulesToIssue]
  );

  const handleState = (stateId: string) =>
    issue?.project_id && updateIssue && updateIssue(issue.project_id, issue.id, { state_id: stateId });

  const handlePriority = (value: TIssuePriorities) =>
    issue?.project_id && updateIssue && updateIssue(issue.project_id, issue.id, { priority: value });

  const handleLabel = (ids: string[]) =>
    issue?.project_id && updateIssue && updateIssue(issue.project_id, issue.id, { label_ids: ids });

  const handleAssignee = (ids: string[]) =>
    issue?.project_id && updateIssue && updateIssue(issue.project_id, issue.id, { assignee_ids: ids });

  const handleModule = useCallback(
    (moduleIds: string[] | null) => {
      if (!issue || !issue.module_ids || !moduleIds) return;
      issueOperations.updateIssueModules(moduleIds);
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

  const handleStartDate = (date: Date | null) =>
    issue?.project_id &&
    updateIssue &&
    updateIssue(issue.project_id, issue.id, {
      start_date: date ? (renderFormattedPayloadDate(date) ?? undefined) : undefined,
    });

  const handleTargetDate = (date: Date | null) =>
    issue?.project_id &&
    updateIssue &&
    updateIssue(issue.project_id, issue.id, {
      target_date: date ? (renderFormattedPayloadDate(date) ?? undefined) : undefined,
    });

  const handleEstimate = (value: string | undefined) =>
    issue?.project_id && updateIssue && updateIssue(issue.project_id, issue.id, { estimate_point: value });

  const calendarOpts = useCalendarOptions(issue.project_id, issue.label_ids);

  if (!issue.project_id) return null;

  const defaultLabelOptions = issue?.label_ids?.map((id) => labelMap[id]) || [];

  const minDate = getDate(issue.start_date);
  minDate?.setDate(minDate.getDate());

  const maxDate = getDate(issue.target_date);
  maxDate?.setDate(maxDate.getDate());

  const handleEventPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div className={className}>
      {/* basic properties */}
      {/* state */}
      <div className="h-5" onClick={handleEventPropagation}>
        <StateDropdown
          buttonContainerClassName="truncate max-w-40"
          value={issue.state_id}
          onChange={handleState}
          projectId={issue.project_id}
          buttonVariant="border-with-text"
          renderByDefault={isMobile}
          showTooltip
        />
      </div>

      {/* priority */}
      <div className="h-5" onClick={handleEventPropagation}>
        <PriorityDropdown
          value={issue?.priority}
          onChange={handlePriority}
          buttonVariant="border-without-text"
          buttonClassName="border"
          renderByDefault={isMobile}
          showTooltip
        />
      </div>

      {/* label */}

      <IssuePropertyLabels
        projectId={issue?.project_id || null}
        value={issue?.label_ids || null}
        defaultOptions={defaultLabelOptions}
        onChange={handleLabel}
        renderByDefault={isMobile}
        hideDropdownArrow
      />

      {/* Combined date / time / duration popup */}
      <div className="h-5" onClick={handleEventPropagation}>
        <DateTimeDurationPopup
          value={{
            target_date: issue.target_date ?? null,
            target_time: issue.target_time ?? null,
            start_date: issue.start_date ?? null,
            start_time: issue.start_time ?? null,
          }}
          onChange={(patch) =>
            issue.project_id && updateIssue && updateIssue(issue.project_id, issue.id, patch)
          }
          compact
          calendars={{
            options: calendarOpts.options,
            selectedId: calendarOpts.selectedId,
            onChange: (id) =>
              issue.project_id &&
              updateIssue &&
              updateIssue(issue.project_id, issue.id, {
                label_ids: calendarOpts.buildNextLabelIds(issue.label_ids, id),
              }),
          }}
          buttonClassName={`border border-subtle-1 rounded ${
            shouldHighlightIssueDueDate(issue?.target_date || null, stateDetails?.group)
              ? "text-danger-primary"
              : ""
          }`}
        />
      </div>

      {/* assignee */}
      <div className="h-5" onClick={handleEventPropagation}>
        <MemberDropdown
          projectId={issue?.project_id}
          value={issue?.assignee_ids}
          onChange={handleAssignee}
          multiple
          buttonVariant={issue.assignee_ids?.length > 0 ? "transparent-without-text" : "border-without-text"}
          buttonClassName={issue.assignee_ids?.length > 0 ? "hover:bg-transparent px-0" : ""}
          showTooltip={issue?.assignee_ids?.length === 0}
          placeholder="Assignees"
          optionsClassName="z-10"
          tooltipContent=""
          renderByDefault={isMobile}
        />
      </div>

      {/* modules */}
      {projectDetails?.module_view && (
        <div className="h-5" onClick={handleEventPropagation}>
          <ModuleDropdown
            buttonContainerClassName="truncate max-w-40"
            projectId={issue?.project_id}
            value={issue?.module_ids ?? []}
            onChange={handleModule}
            renderByDefault={isMobile}
            multiple
            buttonVariant="border-with-text"
            showCount
            showTooltip
          />
        </div>
      )}

      {/* cycles */}
      {projectDetails?.cycle_view && (
        <div className="h-5" onClick={handleEventPropagation}>
          <CycleDropdown
            buttonContainerClassName="truncate max-w-40"
            projectId={issue?.project_id}
            value={issue?.cycle_id || null}
            onChange={handleCycle}
            buttonVariant="border-with-text"
            renderByDefault={isMobile}
            showTooltip
          />
        </div>
      )}

      {/* estimates */}
      {issue.project_id && areEstimateEnabledByProjectId(issue.project_id?.toString()) && (
        <div className="h-5" onClick={handleEventPropagation}>
          <EstimateDropdown
            value={issue.estimate_point ?? undefined}
            onChange={handleEstimate}
            projectId={issue.project_id}
            buttonVariant="border-with-text"
            renderByDefault={isMobile}
            showTooltip
          />
        </div>
      )}
    </div>
  );
});

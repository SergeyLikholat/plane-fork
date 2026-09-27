/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Bell, MapPin } from "lucide-react";
// i18n
import { useTranslation } from "@plane/i18n";
// ui
import {
  CycleIcon,
  StatePropertyIcon,
  ModuleIcon,
  MembersPropertyIcon,
  PriorityPropertyIcon,
  DueDatePropertyIcon,
  LabelPropertyIcon,
  UserCirclePropertyIcon,
  EstimatePropertyIcon,
  ParentPropertyIcon,
} from "@plane/propel/icons";
import { cn, getDate, shouldHighlightIssueDueDate } from "@plane/utils";
// components
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { DateTimeDurationPopup } from "@/components/issues/date-time-duration-popup";
import { ReminderPopup } from "@/components/issues/reminder-popup";
import { useCalendarOptions } from "@/components/issues/use-calendar-options";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// plane web components
// components
import { WorkItemAdditionalSidebarProperties } from "@/plane-web/components/issues/issue-details/additional-properties";
import { IssueParentSelectRoot } from "@/plane-web/components/issues/issue-details/parent-select-root";
import { DateAlert } from "@/plane-web/components/issues/issue-details/sidebar/date-alert";
import { TransferHopInfo } from "@/plane-web/components/issues/issue-details/sidebar/transfer-hop-info";
import { IssueWorklogProperty } from "@/plane-web/components/issues/worklog/property";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { IssueControlProperties } from "./control/control-properties";
import { IssueCycleSelect } from "./cycle-select";
import { IssueLabel } from "./label";
import { IssueLocationProperty } from "./location-property";
import { IssueModuleSelect } from "./module-select";
import type { TIssueOperations } from "./root";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  isEditable: boolean;
};

export const IssueDetailsSidebar = observer(function IssueDetailsSidebar(props: Props) {
  const { t } = useTranslation();
  const { workspaceSlug, projectId, issueId, issueOperations, isEditable } = props;
  // store hooks
  const { getProjectById } = useProject();
  const { areEstimateEnabledByProjectId } = useProjectEstimates();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getUserDetails } = useMember();
  const { getStateById } = useProjectState();
  const issue = getIssueById(issueId);
  if (!issue) return <></>;

  const createdByDetails = getUserDetails(issue.created_by);

  // derived values
  const projectDetails = getProjectById(issue.project_id);
  const stateDetails = getStateById(issue.state_id);

  const minDate = issue.start_date ? getDate(issue.start_date) : null;
  minDate?.setDate(minDate.getDate());

  const maxDate = issue.target_date ? getDate(issue.target_date) : null;
  maxDate?.setDate(maxDate.getDate());

  const calendarOpts = useCalendarOptions(projectId, issue.label_ids);

  return (
    <>
      <div className="flex h-full w-full flex-col items-center divide-y-2 divide-subtle-1 overflow-hidden">
        <div className="h-full w-full overflow-y-auto px-6">
          <h5 className="mt-5 text-body-xs-medium">{t("common.properties")}</h5>
          <div className={`mt-4 mb-2 space-y-2.5 truncate ${!isEditable ? "opacity-60" : ""}`}>
            <SidebarPropertyListItem icon={StatePropertyIcon} label={t("common.state")}>
              <StateDropdown
                value={issue?.state_id}
                onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { state_id: val })}
                projectId={projectId?.toString() ?? ""}
                disabled={!isEditable}
                buttonVariant="transparent-with-text"
                className="group w-full grow"
                buttonContainerClassName="w-full text-left h-7.5"
                buttonClassName="text-body-xs-regular"
                dropdownArrow
                dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
              />
            </SidebarPropertyListItem>

            <SidebarPropertyListItem icon={MembersPropertyIcon} label={t("common.assignees")}>
              <MemberDropdown
                value={issue?.assignee_ids ?? undefined}
                onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: val })}
                disabled={!isEditable}
                projectId={projectId?.toString() ?? ""}
                placeholder={t("issue.add.assignee")}
                multiple
                buttonVariant={issue?.assignee_ids?.length > 1 ? "transparent-without-text" : "transparent-with-text"}
                className="group w-full grow"
                buttonContainerClassName="w-full text-left h-7.5"
                buttonClassName={`text-body-xs-regular justify-between ${issue?.assignee_ids?.length > 0 ? "" : "text-placeholder"}`}
                hideIcon={issue.assignee_ids?.length === 0}
                dropdownArrow
                dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
              />
            </SidebarPropertyListItem>

            <SidebarPropertyListItem icon={PriorityPropertyIcon} label={t("common.priority")}>
              <PriorityDropdown
                value={issue?.priority}
                onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { priority: val })}
                disabled={!isEditable}
                buttonVariant="transparent-with-text"
                className="h-7.5 w-full grow rounded-sm"
                buttonContainerClassName="size-full text-left"
                buttonClassName="size-full px-2 py-0.5 whitespace-nowrap [&_svg]:size-3.5"
              />
            </SidebarPropertyListItem>

            {createdByDetails && (
              <SidebarPropertyListItem icon={UserCirclePropertyIcon} label={t("common.created_by")}>
                <div className="flex gap-2 px-2">
                  <ButtonAvatars showTooltip userIds={createdByDetails.id} />
                  <span className="grow truncate text-body-xs-regular leading-5">{createdByDetails?.display_name}</span>
                </div>
              </SidebarPropertyListItem>
            )}

            {/* TickTick-стиль: единый popup с табами «Дата» / «Длительность». */}
            <SidebarPropertyListItem icon={DueDatePropertyIcon} label="Дата">
              <div className="flex w-full items-center gap-2">
                <DateTimeDurationPopup
                  value={{
                    target_date: issue.target_date ?? null,
                    target_time: issue.target_time ?? null,
                    start_date: issue.start_date ?? null,
                    start_time: issue.start_time ?? null,
                  }}
                  onChange={(patch) =>
                    issueOperations.update(workspaceSlug, projectId, issueId, patch)
                  }
                  disabled={!isEditable}
                  calendars={{
                    options: calendarOpts.options,
                    selectedId: calendarOpts.selectedId,
                    onChange: (id) =>
                      issueOperations.update(workspaceSlug, projectId, issueId, {
                        label_ids: calendarOpts.buildNextLabelIds(issue.label_ids, id),
                      } as Partial<typeof issue>),
                  }}
                  buttonClassName={cn({
                    "text-danger-primary": shouldHighlightIssueDueDate(
                      issue.target_date,
                      stateDetails?.group
                    ),
                  })}
                />
                {issue.target_date && <DateAlert date={issue.target_date} workItem={issue} projectId={projectId} />}
              </div>
            </SidebarPropertyListItem>

            {/* Reminders → Google Calendar push notifications (fork-only).
              * Plane itself does not deliver; alerting is delegated to GCal
              * via plane-gcal-sync. Disabled when there's no target_date. */}
            <SidebarPropertyListItem icon={Bell} label="Напоминание">
              <ReminderPopup
                value={issue.reminders ?? []}
                hasDate={!!issue.target_date}
                hasTime={!!issue.target_time}
                disabled={!isEditable}
                onChange={(next) =>
                  issueOperations.update(workspaceSlug, projectId, issueId, {
                    reminders: next,
                  } as Partial<typeof issue>)
                }
              />
            </SidebarPropertyListItem>

            <IssueControlProperties
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              disabled={!isEditable}
            />

            {projectId && areEstimateEnabledByProjectId(projectId) && (
              <SidebarPropertyListItem icon={EstimatePropertyIcon} label={t("common.estimate")}>
                <EstimateDropdown
                  value={issue?.estimate_point ?? undefined}
                  onChange={(val: string | undefined) =>
                    issueOperations.update(workspaceSlug, projectId, issueId, { estimate_point: val })
                  }
                  projectId={projectId}
                  disabled={!isEditable}
                  buttonVariant="transparent-with-text"
                  className="group w-full grow"
                  buttonContainerClassName="w-full text-left h-7.5"
                  buttonClassName={`justify-start text-body-xs-regular ${issue?.estimate_point !== null ? "" : "text-placeholder"}`}
                  placeholder={t("common.none")}
                  hideIcon={!issue?.estimate_point}
                  dropdownArrow
                  dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
                />
              </SidebarPropertyListItem>
            )}

            {projectDetails?.module_view && (
              <SidebarPropertyListItem icon={ModuleIcon} label={t("common.modules")}>
                <IssueModuleSelect
                  className="w-full grow"
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  issueId={issueId}
                  issueOperations={issueOperations}
                  disabled={!isEditable}
                />
              </SidebarPropertyListItem>
            )}

            {projectDetails?.cycle_view && (
              <SidebarPropertyListItem
                icon={CycleIcon}
                label={t("common.cycle")}
                appendElement={<TransferHopInfo workItem={issue} />}
              >
                <IssueCycleSelect
                  className="h-7.5 w-full grow"
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  issueId={issueId}
                  issueOperations={issueOperations}
                  disabled={!isEditable}
                />
              </SidebarPropertyListItem>
            )}

            <SidebarPropertyListItem icon={MapPin} label="Расположение">
              <IssueLocationProperty
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
              />
            </SidebarPropertyListItem>

            <SidebarPropertyListItem icon={ParentPropertyIcon} label={t("common.parent")}>
              <IssueParentSelectRoot
                className="h-7.5 w-full grow"
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                issueOperations={issueOperations}
                disabled={!isEditable}
              />
            </SidebarPropertyListItem>

            <SidebarPropertyListItem icon={LabelPropertyIcon} label={t("common.labels")}>
              <IssueLabel
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                disabled={!isEditable}
              />
            </SidebarPropertyListItem>

            <IssueWorklogProperty
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              disabled={!isEditable}
            />

            <WorkItemAdditionalSidebarProperties
              workItemId={issue.id}
              workItemTypeId={issue.type_id}
              projectId={projectId}
              workspaceSlug={workspaceSlug}
              isEditable={isEditable}
            />
          </div>
        </div>
      </div>
    </>
  );
});

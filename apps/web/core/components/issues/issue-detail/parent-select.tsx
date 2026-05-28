/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { ExternalLink } from "lucide-react";

import { useTranslation } from "@plane/i18n";
import { EditIcon, CloseIcon } from "@plane/propel/icons";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web components
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
// local imports
import { ParentIssuesListModal } from "../parent-issues-list-modal";

type TIssueParentSelect = {
  className?: string;
  disabled?: boolean;
  issueId: string;
  projectId: string;
  workspaceSlug: string;
  handleParentIssue: (_issueId?: string | null) => Promise<void>;
  handleRemoveSubIssue: (
    workspaceSlug: string,
    projectId: string,
    parentIssueId: string,
    issueId: string
  ) => Promise<void>;
  workItemLink: string;
};

export const IssueParentSelect = observer(function IssueParentSelect(props: TIssueParentSelect) {
  const {
    className = "",
    disabled = false,
    issueId,
    projectId,
    workspaceSlug,
    handleParentIssue,
    handleRemoveSubIssue,
  } = props;
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { isParentIssueModalOpen, toggleParentIssueModal } = useIssueDetail();

  // derived values
  const issue = getIssueById(issueId);
  const parentIssue = issue?.parent_id ? getIssueById(issue.parent_id) : undefined;
  const parentIssueProjectDetails =
    parentIssue && parentIssue.project_id ? getProjectById(parentIssue.project_id) : undefined;
  const { isMobile } = usePlatformOS();
  const { handleRedirection } = useIssuePeekOverviewRedirection(false);

  // Open the parent in the same tab via the standard peek-overview panel —
  // the user explicitly asked NOT to open a new browser tab. handleRedirection
  // pushes the parent's URL on mobile and triggers setPeekIssue on desktop.
  const openParent = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (parentIssue) handleRedirection(workspaceSlug, parentIssue, isMobile);
  };

  if (!issue) return <></>;

  return (
    <>
      <ParentIssuesListModal
        projectId={projectId}
        issueId={issueId}
        isOpen={isParentIssueModalOpen === issueId}
        handleClose={() => toggleParentIssueModal(null)}
        onChange={(issue: any) => handleParentIssue(issue?.id)}
      />
      <button
        type="button"
        className={cn(
          "group flex items-center justify-between gap-2 rounded-sm px-2 py-0.5 outline-none",
          {
            "cursor-not-allowed": disabled,
            "hover:bg-layer-transparent-hover": !disabled,
            "bg-layer-transparent-selected": isParentIssueModalOpen,
          },
          className
        )}
        onClick={() => toggleParentIssueModal(issue.id)}
        disabled={disabled}
      >
        {issue.parent_id && parentIssue ? (
          <div className="flex min-w-0 items-center gap-1.5">
            {/* Identifier chip (e.g. MYSELF-19) — clicking switches the peek
                panel to the parent within the same tab. */}
            <span
              role="link"
              tabIndex={0}
              onClick={openParent}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openParent(e as unknown as React.MouseEvent);
              }}
              className="flex-shrink-0 cursor-pointer"
            >
              {parentIssue?.project_id && parentIssueProjectDetails && (
                <IssueIdentifier
                  projectId={parentIssue.project_id}
                  issueTypeId={parentIssue.type_id}
                  projectIdentifier={parentIssueProjectDetails?.identifier}
                  issueSequenceId={parentIssue.sequence_id}
                  size="xs"
                  variant="secondary"
                />
              )}
            </span>
            {/* Parent issue name — main signal, also navigates to parent */}
            <Tooltip tooltipHeading="Title" tooltipContent={parentIssue.name} isMobile={isMobile}>
              <span
                role="link"
                tabIndex={0}
                onClick={openParent}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openParent(e as unknown as React.MouseEvent);
                }}
                className="min-w-0 cursor-pointer truncate text-body-xs-medium text-secondary hover:text-primary hover:underline"
              >
                {parentIssue.name}
              </span>
            </Tooltip>
            {/* Explicit "open" arrow so the user has a clear affordance even
                when the identifier chip is mistaken for static metadata. */}
            <Tooltip tooltipContent="Открыть родительскую задачу" position="bottom" isMobile={isMobile}>
              <button
                type="button"
                onClick={openParent}
                className="flex-shrink-0 cursor-pointer rounded-sm p-0.5 text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
              >
                <ExternalLink className="h-3 w-3" strokeWidth={2.25} />
              </button>
            </Tooltip>

            {!disabled && (
              <Tooltip tooltipContent={t("common.remove")} position="bottom" isMobile={isMobile}>
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRemoveSubIssue(workspaceSlug, projectId, parentIssue.id, issueId);
                  }}
                  className="flex-shrink-0"
                >
                  <CloseIcon className="h-2.5 w-2.5 text-tertiary hover:text-danger-primary" />
                </span>
              </Tooltip>
            )}
          </div>
        ) : (
          <span className="text-body-xs-medium text-placeholder">{t("issue.add.parent")}</span>
        )}
        {!disabled && (
          <span
            className={cn("flex-shrink-0 p-1 opacity-0 group-hover:opacity-100", {
              "text-placeholder": !issue.parent_id && !parentIssue,
            })}
          >
            <EditIcon className="h-2.5 w-2.5 flex-shrink-0" />
          </span>
        )}
      </button>
    </>
  );
});

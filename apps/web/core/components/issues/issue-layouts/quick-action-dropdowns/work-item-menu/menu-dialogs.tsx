/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Dialogs of the ⋯ menu; only the open one is mounted. */

import { omit } from "lodash-es";
import type { EIssuesStoreType, TIssue } from "@plane/types";
import { ArchiveIssueModal } from "@/components/issues/archive-issue-modal";
import { DeleteIssueModal } from "@/components/issues/delete-issue-modal";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { BigTaskPicker } from "./big-task-picker";
import { DateDialog } from "./date-dialog";
import { planReschedule, swapPersonLabel } from "./helpers";
import { PersonDialog } from "./person-dialog";
import type { TPersonDialogMode } from "./person-dialog";
import type { TMenuOperations } from "./use-menu-operations";

export type TMenuDialog =
  | { kind: "child" | "copy" | "delete" | "archive" | "date" | "big-task" }
  | { kind: "person"; mode: TPersonDialogMode };

type Props = {
  dialog: TMenuDialog | null;
  onClose: () => void;
  issue: TIssue;
  projectIdentifier: string | undefined;
  storeType: EIssuesStoreType;
  handleDelete: () => Promise<void>;
  handleArchive?: () => Promise<void>;
  ops: TMenuOperations;
};

export function WorkItemMenuDialogs(props: Props) {
  const { dialog, onClose, issue, projectIdentifier, storeType, handleDelete, handleArchive, ops } = props;
  const { workspaceSlug, projectId } = ops;
  if (!dialog) return null;

  switch (dialog.kind) {
    case "archive":
      return <ArchiveIssueModal data={issue} isOpen handleClose={onClose} onSubmit={handleArchive} />;
    case "delete":
      return <DeleteIssueModal data={issue} isOpen handleClose={onClose} onSubmit={handleDelete} />;
    case "copy":
      return (
        <CreateUpdateIssueModal
          isOpen
          onClose={onClose}
          data={omit({ ...issue, name: `${issue.name} (копия)`, sourceIssueId: issue.id }, ["id"])}
          storeType={storeType}
        />
      );
    case "child":
      return projectId ? (
        <CreateUpdateIssueModal
          isOpen
          onClose={onClose}
          data={{ project_id: projectId, parent_id: issue.id }}
          storeType={storeType}
          isProjectSelectionDisabled
        />
      ) : null;
    case "person":
      return workspaceSlug && projectId ? (
        <PersonDialog
          mode={dialog.mode}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueName={issue.name}
          labelIds={issue.label_ids ?? []}
          onClose={onClose}
          onSubmit={(personId, peopleIds) =>
            dialog.mode === "handover"
              ? ops.handover(personId)
              : ops.update(
                  { label_ids: swapPersonLabel(issue.label_ids ?? [], new Set(peopleIds), personId) },
                  "Исполнитель сменён"
                )
          }
        />
      ) : null;
    case "date":
      return (
        <DateDialog
          issueName={issue.name}
          value={issue.target_date}
          onClose={onClose}
          onSubmit={(date) => ops.update(planReschedule(issue, date))}
        />
      );
    case "big-task":
      return workspaceSlug && projectId ? (
        <BigTaskPicker
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          projectIdentifier={projectIdentifier}
          issueId={issue.id}
          issueName={issue.name}
          currentParentId={issue.parent_id}
          onClose={onClose}
          onSubmit={ops.makeStepOf}
        />
      ) : null;
    default:
      return null;
  }
}

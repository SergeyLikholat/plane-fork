/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * After a next step was created or a Big task closed: bring every view that
 * may show them up to date. Mirrors what the control block does after a
 * touch (activity + comments of the touched item), plus the lists.
 */
import type { RootStore } from "@/plane-web/store/root.store";
import { announceBigTaskChanged, revalidateBigTaskContext } from "./helpers";

type TRefreshInput = {
  workspaceSlug: string;
  projectId: string;
  bigTaskId: string;
  /** `userId` route param: «Ваша работа» is open. */
  routeUserId?: string;
  /** `projectId` route param: a project list / board is open. */
  routeProjectId?: string;
};

const logFailure = (what: string) => (error: unknown) => console.error(`big-task: failed to refresh ${what}`, error);

export const refreshAfterBigTaskChange = (rootStore: RootStore, input: TRefreshInput) => {
  const { workspaceSlug, projectId, bigTaskId, routeUserId, routeProjectId } = input;
  const issueStore = rootStore.issue;

  void revalidateBigTaskContext();
  announceBigTaskChanged();

  // The Big task is open in the detail page or the peek: its sub-issues,
  // comment («＋ Следующий шаг: …») and history changed.
  if (issueStore.issues.getIssueById(bigTaskId)) {
    const detail = issueStore.issueDetail;
    detail.fetchSubIssues(workspaceSlug, projectId, bigTaskId).catch(logFailure("sub-issues"));
    detail.fetchComments(workspaceSlug, projectId, bigTaskId).catch(logFailure("comments"));
    detail.fetchActivities(workspaceSlug, projectId, bigTaskId).catch(logFailure("activity"));
  }

  if (routeUserId) {
    issueStore.profileIssues
      .fetchIssuesWithExistingPagination(workspaceSlug, routeUserId, "mutation")
      .catch(logFailure("«Ваша работа»"));
  }
  if (routeProjectId === projectId) {
    issueStore.projectIssues
      .fetchIssuesWithExistingPagination(workspaceSlug, projectId, "mutation")
      .catch(logFailure("project list"));
  }
};

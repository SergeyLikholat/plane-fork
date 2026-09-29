/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

export type TControlFrequency = "daily" | "twice_week" | "weekly";
export type TControlPhase = "setup" | "check" | "acceptance";
export type TControlOutcome =
  | "assigned"
  | "progress"
  | "no_progress"
  | "new_deadline"
  | "submitted"
  | "accepted"
  | "returned"
  /** A pure check with nothing to accept: the question is settled, the task closes. */
  | "closed";

/** Control block of a supervised work item («На контроле»). Dates are `YYYY-MM-DD`. */
export type TIssueControl = {
  promised_date: string | null;
  frequency: TControlFrequency;
  no_progress_streak: number;
  last_touch_at: string | null;
  phase: TControlPhase;
  /** Mirror of the issue's `target_date` — the date of the next touch. */
  next_touch: string | null;
};

export type TIssueControlUpdate = Partial<Pick<TIssueControl, "promised_date" | "frequency">>;

export type TControlTouchPayload = {
  outcome: TControlOutcome;
  comment?: string;
  promised_date?: string;
  next_date?: string;
  /** `assigned` only: control frequency agreed at the briefing. */
  frequency?: TControlFrequency;
  /** `assigned` only: what the assignee delivers; appended to the description. */
  deliverable?: string;
};

export type TControlTouchResponse = {
  control: TIssueControl;
  issue: {
    target_date: string | null;
    start_date: string | null;
    state_id: string | null;
    estimate_point: string | null;
    label_ids: string[];
    description_html: string | null;
  };
  comment_id: string;
};

export type TControlHandoverResponse = Pick<TControlTouchResponse, "control" | "issue">;

export class IssueControlService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private url(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/control/`;
  }

  async retrieve(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueControl> {
    return this.get(this.url(workspaceSlug, projectId, issueId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueControlUpdate
  ): Promise<TIssueControl> {
    return this.patch(this.url(workspaceSlug, projectId, issueId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async touch(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TControlTouchPayload
  ): Promise<TControlTouchResponse> {
    return this.post(`${this.url(workspaceSlug, projectId, issueId)}touch/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** «Передать на контроль…»: «На контроле», the person's label, phase «🗣 Постановка». */
  async handover(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    personLabelId: string
  ): Promise<TControlHandoverResponse> {
    return this.post(`${this.url(workspaceSlug, projectId, issueId)}handover/`, { person_label_id: personLabelId })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

/** Parent of a work item, as returned by `big-task-context`. Dates are `YYYY-MM-DD`. */
export type TBigTaskParent = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
  project_identifier: string | null;
  /** Final deadline of the parent. */
  target_date: string | null;
  is_big_task: boolean;
};

export type TBigTaskStep = {
  id: string;
  name: string;
  target_date: string | null;
  state_group: string;
  /** Name of the step's «ЛЮДИ» label; null when the owner does it himself. */
  person: string | null;
};

/** Progress of a Big task; cancelled steps are not counted. */
export type TBigTaskSummary = {
  total: number;
  done: number;
  open: number;
  /** Open step with the earliest date; null means «⚠ нет следующего шага». */
  current_step: TBigTaskStep | null;
  next_deadline: string | null;
};

export type TBigTaskContext = {
  /** child id → its parent (only for ids that have one). */
  parents: Record<string, TBigTaskParent>;
  /** Big task id → progress (only for ids in the «💼 Big Tasks» state). */
  big_tasks: Record<string, TBigTaskSummary>;
};

export const PERFORMER_ME = "me";

export type TNextStepPayload = {
  name: string;
  /** `"me"` or the id of a people label («ЛЮДИ») of the project. */
  performer: string;
  target_date?: string;
  weight?: number;
};

export type TNextStepResponse = {
  id: string;
  sequence_id: number;
  name: string;
  state_id: string;
  target_date: string | null;
  project_id: string;
  parent_id: string;
  estimate_point: string | null;
};

export class BigTaskService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getContext(workspaceSlug: string, issueIds: string[]): Promise<TBigTaskContext> {
    return this.get(`/api/workspaces/${workspaceSlug}/issues/big-task-context/`, {
      params: { issue_ids: issueIds.join(",") },
    })
      .then((response) => (response?.data ?? { parents: {}, big_tasks: {} }) as TBigTaskContext)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createNextStep(
    workspaceSlug: string,
    projectId: string,
    bigTaskId: string,
    data: TNextStepPayload
  ): Promise<TNextStepResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${bigTaskId}/next-step/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async complete(
    workspaceSlug: string,
    projectId: string,
    bigTaskId: string
  ): Promise<{ id: string; state_id: string }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${bigTaskId}/big-task/complete/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

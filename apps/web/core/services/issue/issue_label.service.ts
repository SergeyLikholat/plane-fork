/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IIssueLabel } from "@plane/types";
// services
import { APIService } from "@/services/api.service";
// types

export class IssueLabelService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getWorkspaceIssueLabels(workspaceSlug: string): Promise<IIssueLabel[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/labels/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProjectLabels(workspaceSlug: string, projectId: string): Promise<IIssueLabel[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-labels/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createIssueLabel(workspaceSlug: string, projectId: string, data: any): Promise<IIssueLabel> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-labels/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchIssueLabel(workspaceSlug: string, projectId: string, labelId: string, data: any): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-labels/${labelId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteIssueLabel(workspaceSlug: string, projectId: string, labelId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-labels/${labelId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Fork-only: copy labels from another project in the same workspace into
   * the target project. Mirrors the backend endpoint
   *   POST /api/workspaces/:slug/projects/:target/copy-labels-from-project/
   *
   * Categories are reused by name when already present in the target;
   * child labels with duplicate names are skipped (default) or renamed
   * with " (копия)" suffix when on_conflict === "rename".
   */
  async copyLabelsFromProject(
    workspaceSlug: string,
    targetProjectId: string,
    payload: {
      source_project_id: string;
      label_ids: string[];
      on_conflict?: "skip" | "rename";
    }
  ): Promise<{
    created: IIssueLabel[];
    reused: { id: string; name: string }[];
    renamed: IIssueLabel[];
    skipped: { name: string; reason: string }[];
  }> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${targetProjectId}/copy-labels-from-project/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

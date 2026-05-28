/**
 * Service for the per-project «передача задач» (issue transfer rules)
 * automation. CRUD + apply.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssueTransferRule, TIssueTransferRulePayload } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProjectTransferRuleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TIssueTransferRule[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/transfer-rules/`)
      .then((r) => r?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: TIssueTransferRulePayload
  ): Promise<TIssueTransferRule> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/transfer-rules/`, data)
      .then((r) => r?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    data: TIssueTransferRulePayload
  ): Promise<TIssueTransferRule> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/transfer-rules/${ruleId}/`,
      data
    )
      .then((r) => r?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reorder(
    workspaceSlug: string,
    projectId: string,
    ruleIds: string[]
  ): Promise<{ reordered: string[] }> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/transfer-rules/reorder/`,
      { rule_ids: ruleIds }
    )
      .then((r) => r?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, ruleId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/transfer-rules/${ruleId}/`
    )
      .then((r) => r?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async applyToIssue(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    ruleId: string
  ): Promise<{ applied: string[]; rule_id: string; target_state_id: string }> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/apply-rule/${ruleId}/`,
      {}
    )
      .then((r) => r?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

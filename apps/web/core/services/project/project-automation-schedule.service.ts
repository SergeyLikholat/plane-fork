/**
 * Service for project-scoped scheduled automations.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueAutomationSchedule,
  TIssueAutomationSchedulePayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProjectAutomationScheduleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TIssueAutomationSchedule[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/automation-schedules/`)
      .then((r) => r?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: TIssueAutomationSchedulePayload
  ): Promise<TIssueAutomationSchedule> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/automation-schedules/`,
      data
    )
      .then((r) => r?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    id: string,
    data: TIssueAutomationSchedulePayload
  ): Promise<TIssueAutomationSchedule> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/automation-schedules/${id}/`,
      data
    )
      .then((r) => r?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, id: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/automation-schedules/${id}/`
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
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/automation-schedules/reorder/`,
      { rule_ids: ruleIds }
    )
      .then((r) => r?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

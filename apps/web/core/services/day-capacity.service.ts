/**
 * The requesting user's daily load limit in a workspace:
 * `GET/PATCH /api/workspaces/<slug>/day-capacity/`.
 */
import { API_BASE_URL } from "@plane/constants";
import type { TDayCapacity, TDayCapacityPatch } from "@/components/issues/issue-layouts/week-board/day-limit";
import { APIService } from "@/services/api.service";

export class DayCapacityService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private url(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/day-capacity/`;
  }

  async fetchCapacity(workspaceSlug: string): Promise<TDayCapacity> {
    return this.get(this.url(workspaceSlug))
      .then((response) => response?.data as TDayCapacity)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateCapacity(workspaceSlug: string, patch: TDayCapacityPatch): Promise<TDayCapacity> {
    return this.patch(this.url(workspaceSlug), patch)
      .then((response) => response?.data as TDayCapacity)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const dayCapacityService = new DayCapacityService();

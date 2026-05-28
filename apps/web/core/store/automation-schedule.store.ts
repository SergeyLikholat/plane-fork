/**
 * Singleton MobX store for project automation schedules.
 *
 * Mirrors `transfer-rule.store.ts` (same shape, distinct collection). Fetch
 * is deduped via in-flight promise to avoid the kanban-card stampede.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type {
  TIssueAutomationSchedule,
  TIssueAutomationSchedulePayload,
} from "@plane/types";
// services
import { ProjectAutomationScheduleService } from "@/services/project/project-automation-schedule.service";

const cacheKey = (workspaceSlug: string, projectId: string) => `${workspaceSlug}:${projectId}`;

export class AutomationScheduleStore {
  schedulesByProject: Record<string, TIssueAutomationSchedule[]> = {};
  fetched: Record<string, boolean> = {};
  loading: Record<string, boolean> = {};
  private inflight: Record<string, Promise<TIssueAutomationSchedule[]> | undefined> = {};
  service = new ProjectAutomationScheduleService();

  constructor() {
    makeObservable(this, {
      schedulesByProject: observable,
      fetched: observable,
      loading: observable,
      fetchSchedules: action,
      createSchedule: action,
      updateSchedule: action,
      deleteSchedule: action,
      reorderSchedules: action,
      isLoadingFor: action,
    });
  }

  isLoadingFor(workspaceSlug: string, projectId: string): boolean {
    return !!this.loading[cacheKey(workspaceSlug, projectId)];
  }

  async fetchSchedules(workspaceSlug: string, projectId: string, force = false): Promise<TIssueAutomationSchedule[]> {
    const k = cacheKey(workspaceSlug, projectId);
    if (!force && this.fetched[k]) return this.schedulesByProject[projectId] ?? [];
    const existing = this.inflight[k];
    if (existing && !force) return existing;
    const promise = (async () => {
      runInAction(() => {
        this.loading[k] = true;
      });
      try {
        const items = await this.service.list(workspaceSlug, projectId);
        runInAction(() => {
          this.schedulesByProject[projectId] = items;
          this.fetched[k] = true;
        });
        return items;
      } finally {
        runInAction(() => {
          this.loading[k] = false;
          this.inflight[k] = undefined;
        });
      }
    })();
    this.inflight[k] = promise;
    return promise;
  }

  async createSchedule(
    workspaceSlug: string,
    projectId: string,
    data: TIssueAutomationSchedulePayload
  ): Promise<TIssueAutomationSchedule> {
    const created = await this.service.create(workspaceSlug, projectId, data);
    runInAction(() => {
      const list = this.schedulesByProject[projectId] ?? [];
      this.schedulesByProject[projectId] = [...list, created];
    });
    return created;
  }

  async updateSchedule(
    workspaceSlug: string,
    projectId: string,
    id: string,
    data: TIssueAutomationSchedulePayload
  ): Promise<TIssueAutomationSchedule> {
    const updated = await this.service.update(workspaceSlug, projectId, id, data);
    runInAction(() => {
      const list = this.schedulesByProject[projectId] ?? [];
      this.schedulesByProject[projectId] = list.map((r) => (r.id === id ? updated : r));
    });
    return updated;
  }

  async deleteSchedule(workspaceSlug: string, projectId: string, id: string): Promise<void> {
    await this.service.destroy(workspaceSlug, projectId, id);
    runInAction(() => {
      const list = this.schedulesByProject[projectId] ?? [];
      this.schedulesByProject[projectId] = list.filter((r) => r.id !== id);
    });
  }

  async reorderSchedules(
    workspaceSlug: string,
    projectId: string,
    orderedIds: string[]
  ): Promise<void> {
    const previous = this.schedulesByProject[projectId] ?? [];
    const byId = new Map(previous.map((r) => [r.id, r]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((r): r is TIssueAutomationSchedule => Boolean(r));
    runInAction(() => {
      this.schedulesByProject[projectId] = reordered.map((r, i) => ({
        ...r,
        sequence: (i + 1) * 1000,
      }));
    });
    try {
      await this.service.reorder(workspaceSlug, projectId, orderedIds);
    } catch (err) {
      runInAction(() => {
        this.schedulesByProject[projectId] = previous;
      });
      throw err;
    }
  }
}

export const automationScheduleStore = new AutomationScheduleStore();

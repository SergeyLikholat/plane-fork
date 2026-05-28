/**
 * Lightweight singleton MobX store for project transfer rules.
 *
 * Kept out of RootStore intentionally — this feature is fully self-contained
 * (settings UI + kanban card popover) and doesn't need to be referenced from
 * other stores. Components import `transferRuleStore` directly.
 *
 * Cache is keyed by `${workspaceSlug}:${projectId}` so switching projects
 * fetches fresh data once and reuses it on subsequent renders.
 */

import { action, computed, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { TIssueTransferRule, TIssueTransferRulePayload, TTransferRuleActions } from "@plane/types";
// services
import { ProjectTransferRuleService } from "@/services/project/project-transfer-rule.service";

/**
 * Pure helper — replay a rule's add/remove mutations on a local id list so
 * the UI can reflect the new assignees/labels immediately, without waiting
 * for the next polling tick to fetch the truth from the backend.
 *
 * `remove` semantics mirror the backend:
 *   • "all"  → drop everything
 *   • array  → drop matching ids
 *   • undef  → no-op
 * `add` is appended, ignoring duplicates.
 */
export function applyRuleListLocally(
  current: readonly string[] | null | undefined,
  add: readonly string[] | undefined,
  remove: "all" | readonly string[] | undefined
): string[] {
  let next = current ? Array.from(current) : [];
  if (remove === "all") next = [];
  else if (Array.isArray(remove)) {
    const drop = new Set(remove);
    next = next.filter((id) => !drop.has(id));
  }
  for (const id of add ?? []) if (!next.includes(id)) next.push(id);
  return next;
}

/** Convenience wrapper so callers can pass the whole rule.actions object. */
export function previewIssueAfterRule(
  issue: { assignee_ids?: string[] | null; label_ids?: string[] | null },
  actions: TTransferRuleActions | undefined | null
): { assignee_ids: string[]; label_ids: string[] } {
  const a = actions ?? {};
  return {
    assignee_ids: applyRuleListLocally(issue.assignee_ids ?? [], a.add_assignees, a.remove_assignees),
    label_ids: applyRuleListLocally(issue.label_ids ?? [], a.add_labels, a.remove_labels),
  };
}

const cacheKey = (workspaceSlug: string, projectId: string) => `${workspaceSlug}:${projectId}`;

export class TransferRuleStore {
  // Map<projectId, rule[]> — projectId is enough for lookups, the cacheKey
  // above only gates fetch dedup.
  rulesByProject: Record<string, TIssueTransferRule[]> = {};
  fetched: Record<string, boolean> = {};
  loading: Record<string, boolean> = {};
  // In-flight promise per cacheKey — prevents the kanban-card stampede where
  // every visible card calls fetchRules in the same tick. Without this, all
  // calls see `fetched[k] === false` and fire individually.
  private inflight: Record<string, Promise<TIssueTransferRule[]> | undefined> = {};
  service = new ProjectTransferRuleService();

  constructor() {
    makeObservable(this, {
      rulesByProject: observable,
      fetched: observable,
      loading: observable,
      fetchRules: action,
      createRule: action,
      updateRule: action,
      deleteRule: action,
      reorderRules: action,
      isLoadingFor: action,
    });
  }

  /** Returns rules for a project (empty array if not yet fetched). */
  getRules = computed(() => (projectId: string): TIssueTransferRule[] =>
    this.rulesByProject[projectId] ?? []
  ).get;

  isLoadingFor(workspaceSlug: string, projectId: string): boolean {
    return !!this.loading[cacheKey(workspaceSlug, projectId)];
  }

  async fetchRules(workspaceSlug: string, projectId: string, force = false): Promise<TIssueTransferRule[]> {
    const k = cacheKey(workspaceSlug, projectId);
    if (!force && this.fetched[k]) return this.rulesByProject[projectId] ?? [];
    const existing = this.inflight[k];
    if (existing && !force) return existing;

    const promise = (async () => {
      runInAction(() => {
        this.loading[k] = true;
      });
      try {
        const rules = await this.service.list(workspaceSlug, projectId);
        runInAction(() => {
          this.rulesByProject[projectId] = rules;
          this.fetched[k] = true;
        });
        return rules;
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

  async createRule(
    workspaceSlug: string,
    projectId: string,
    data: TIssueTransferRulePayload
  ): Promise<TIssueTransferRule> {
    const created = await this.service.create(workspaceSlug, projectId, data);
    runInAction(() => {
      const list = this.rulesByProject[projectId] ?? [];
      this.rulesByProject[projectId] = [...list, created];
    });
    return created;
  }

  async updateRule(
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    data: TIssueTransferRulePayload
  ): Promise<TIssueTransferRule> {
    const updated = await this.service.update(workspaceSlug, projectId, ruleId, data);
    runInAction(() => {
      const list = this.rulesByProject[projectId] ?? [];
      this.rulesByProject[projectId] = list.map((r) => (r.id === ruleId ? updated : r));
    });
    return updated;
  }

  /** Optimistic reorder; reverts on server error. */
  async reorderRules(
    workspaceSlug: string,
    projectId: string,
    orderedIds: string[]
  ): Promise<void> {
    const previous = this.rulesByProject[projectId] ?? [];
    const byId = new Map(previous.map((r) => [r.id, r]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((r): r is TIssueTransferRule => Boolean(r));
    runInAction(() => {
      this.rulesByProject[projectId] = reordered.map((r, i) => ({
        ...r,
        sequence: (i + 1) * 1000,
      }));
    });
    try {
      await this.service.reorder(workspaceSlug, projectId, orderedIds);
    } catch (err) {
      runInAction(() => {
        this.rulesByProject[projectId] = previous;
      });
      throw err;
    }
  }

  async deleteRule(workspaceSlug: string, projectId: string, ruleId: string): Promise<void> {
    await this.service.destroy(workspaceSlug, projectId, ruleId);
    runInAction(() => {
      const list = this.rulesByProject[projectId] ?? [];
      this.rulesByProject[projectId] = list.filter((r) => r.id !== ruleId);
    });
  }

  async applyRule(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    ruleId: string
  ): Promise<{ applied: string[]; rule_id: string; target_state_id: string }> {
    return this.service.applyToIssue(workspaceSlug, projectId, issueId, ruleId);
  }
}

export const transferRuleStore = new TransferRuleStore();

/**
 * Week board — how many times each work item's due date was pushed later.
 * Items postponed more than RESCHEDULE_ALERT_AFTER times get a «↻N» mark:
 * they are either too big (split them) or not needed now («Может быть»).
 */
import { createContext, useContext, useEffect, useState } from "react";
import { API_BASE_URL } from "@plane/constants";
import type { TIssue } from "@plane/types";
import { APIService } from "@/services/api.service";

export const RESCHEDULE_ALERT_AFTER = 2;

type TRescheduleCounts = Record<string, number>;

class RescheduleCountService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getCounts(workspaceSlug: string, issueIds: string[]): Promise<TRescheduleCounts> {
    return this.get(`/api/workspaces/${workspaceSlug}/issues/reschedule-counts/`, {
      params: { issue_ids: issueIds.join(",") },
    })
      .then((response) => (response?.data ?? {}) as TRescheduleCounts)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const service = new RescheduleCountService();

/** Re-fetches only when the set of ids or any due date changes, not on every poll. */
export const useRescheduleCounts = (workspaceSlug: string | undefined, issues: TIssue[] | undefined) => {
  const [counts, setCounts] = useState<TRescheduleCounts>({});
  const key = (issues ?? []).map((it) => `${it.id}:${it.target_date ?? ""}`).join("|");

  useEffect(() => {
    if (!workspaceSlug || !issues || issues.length === 0) return;
    let cancelled = false;
    service
      .getCounts(
        workspaceSlug,
        issues.map((it) => it.id)
      )
      .then((next) => {
        if (!cancelled) setCounts(next);
      })
      .catch((error) => console.error("week-board: failed to load reschedule counts", error));
    return () => {
      cancelled = true;
    };
    // `key` captures ids and dates; `issues` identity changes on every poll.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, key]);

  return counts;
};

export const RescheduleCountsContext = createContext<TRescheduleCounts>({});

export const useRescheduleCount = (issueId: string): number => useContext(RescheduleCountsContext)[issueId] ?? 0;

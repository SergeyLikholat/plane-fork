/**
 * Week board — which weights a person stands behind.
 *
 * `apply_default_weight` fills the «Вес» estimate silently; the board marks
 * such weights «не подтверждено» until the owner either picks the same value
 * in the chip (POST here) or changes it (the server sees the estimate activity).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@plane/constants";
import type { TIssue } from "@plane/types";
import { APIService } from "@/services/api.service";
import type { TWeightInfo } from "./weights";

type TConfirmedResponse = { confirmed: string[] };

class WeightConfirmationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private url(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/issues/weight-confirmations/`;
  }

  async getConfirmed(workspaceSlug: string, issueIds: string[]): Promise<string[]> {
    return this.get(this.url(workspaceSlug), { params: { issue_ids: issueIds.join(",") } })
      .then((response) => ((response?.data as TConfirmedResponse | undefined)?.confirmed ?? []).map(String))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async confirm(workspaceSlug: string, issueIds: string[]): Promise<string[]> {
    return this.post(this.url(workspaceSlug), { issue_ids: issueIds })
      .then((response) => ((response?.data as TConfirmedResponse | undefined)?.confirmed ?? []).map(String))
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const weightConfirmationService = new WeightConfirmationService();

/**
 * Own task, briefing or acceptance whose weight nobody has confirmed. A label guess of
 * 0 (payments, personal time) needs no weight; checks cost 1 by rule.
 */
export const needsWeightConfirmation = (info: TWeightInfo, isConfirmed: boolean): boolean => {
  if (info.kind === "check") return false;
  if (info.isImplicit) return info.weight > 0;
  return !isConfirmed;
};

/**
 * Confirmed ids from the server, merged with ids confirmed in this session:
 * a GET that raced a POST must not bring the dashed border back.
 */
export const useWeightConfirmations = (workspaceSlug: string | undefined, issues: TIssue[] | undefined) => {
  const [serverIds, setServerIds] = useState<ReadonlySet<string>>(() => new Set());
  const [localIds, setLocalIds] = useState<ReadonlySet<string>>(() => new Set());
  const key = (issues ?? []).map((it) => `${it.id}:${it.estimate_point ?? ""}`).join("|");

  useEffect(() => {
    setServerIds(new Set());
    setLocalIds(new Set());
  }, [workspaceSlug]);

  useEffect(() => {
    if (!workspaceSlug || !issues || issues.length === 0) return;
    let cancelled = false;
    const load = async () => {
      try {
        const ids = await weightConfirmationService.getConfirmed(
          workspaceSlug,
          issues.map((it) => it.id)
        );
        if (!cancelled) setServerIds(new Set(ids));
      } catch (error) {
        console.error("week-board: failed to load weight confirmations", error);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // `key` captures ids and estimates; `issues` identity changes on every poll.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, key]);

  const setLocal = useCallback((issueId: string, isConfirmed: boolean) => {
    setLocalIds((prev) => {
      const next = new Set(prev);
      if (isConfirmed) next.add(issueId);
      else next.delete(issueId);
      return next;
    });
  }, []);

  /** Optimistic: marks at once, reverts and rethrows if the POST fails. */
  const confirm = useCallback(
    async (issueId: string) => {
      if (!workspaceSlug) return;
      setLocal(issueId, true);
      try {
        await weightConfirmationService.confirm(workspaceSlug, [issueId]);
      } catch (error) {
        setLocal(issueId, false);
        throw error;
      }
    },
    [workspaceSlug, setLocal]
  );

  const isConfirmed = useCallback(
    (issueId: string) => localIds.has(issueId) || serverIds.has(issueId),
    [localIds, serverIds]
  );

  return useMemo(() => ({ isConfirmed, confirm }), [isConfirmed, confirm]);
};

export type TWeekBoardWeightContext = {
  isConfirmed: (issueId: string) => boolean;
  /** Pick a weight in the chip: change it if different, then confirm. */
  pickWeight: (issue: TIssue, pointId: string) => Promise<void>;
  /** Board-wide «не подтверждено» highlight is on. */
  isHighlightingUnconfirmed: boolean;
};

export const WeekBoardWeightContext = createContext<TWeekBoardWeightContext>({
  isConfirmed: () => false,
  pickWeight: async () => {},
  isHighlightingUnconfirmed: false,
});

export const useWeekBoardWeight = (): TWeekBoardWeightContext => useContext(WeekBoardWeightContext);

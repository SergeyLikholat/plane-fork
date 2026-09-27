/**
 * Week board — data access. Loads every open work item of a «Ваша работа» tab
 * straight from the user-issues endpoint, bypassing the profile issue store:
 * the board groups by day on the client and must not depend on whatever
 * group_by / pagination the store is in for other layouts.
 */
import type { TIssue, TIssueResponseResults, TStateGroups } from "@plane/types";
import { IssueService } from "@/services/issue";
import { UserService } from "@/services/user.service";

export type TProfileViewType = "assigned" | "created" | "subscribed";

/** Everything except completed / cancelled. `supervised` is the fork's «На контроле» group. */
const OPEN_STATE_GROUPS: TStateGroups[] = ["backlog", "unstarted", "started", "supervised"];
const PER_PAGE = 500;
/** Safety stop: 10 × 500 open items is far beyond a real workload. */
const MAX_PAGES = 10;

const userService = new UserService();
const issueService = new IssueService();

/** Accepts both flat and grouped list payloads. */
const flattenResults = (raw: TIssueResponseResults | undefined): TIssue[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as TIssue[];
  const out: TIssue[] = [];
  for (const group of Object.values(raw)) {
    if (Array.isArray(group?.results)) out.push(...(group.results as TIssue[]));
  }
  return out;
};

const roleParam = (viewType: TProfileViewType): "assignees" | "created_by" | "subscriber" => {
  if (viewType === "created") return "created_by";
  if (viewType === "subscribed") return "subscriber";
  return "assignees";
};

export const fetchOpenProfileIssues = async (
  workspaceSlug: string,
  userId: string,
  viewType: TProfileViewType
): Promise<TIssue[]> => {
  const collected: TIssue[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string | number> = {
      per_page: PER_PAGE,
      state_group: OPEN_STATE_GROUPS.join(","),
      [roleParam(viewType)]: userId,
    };
    if (cursor) params.cursor = cursor;
    // Pages are cursor-chained, so they have to be fetched one after another.
    // oxlint-disable-next-line no-await-in-loop
    const response = await userService.getUserProfileIssues(workspaceSlug, userId, params);
    collected.push(...flattenResults(response?.results));
    if (!response?.next_page_results || !response.next_cursor) break;
    cursor = response.next_cursor;
  }
  // The endpoint already excludes archived and draft items; keep the guard in
  // case the manager changes upstream. Dedup protects against page overlap.
  const seen = new Set<string>();
  return collected.filter((issue) => {
    if (issue.archived_at || issue.is_draft || seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });
};

export const patchIssueDates = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  data: Pick<Partial<TIssue>, "target_date" | "start_date">
): Promise<unknown> => issueService.patchIssue(workspaceSlug, projectId, issueId, data);

export const patchIssueWeight = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  estimatePointId: string | null
): Promise<unknown> => issueService.patchIssue(workspaceSlug, projectId, issueId, { estimate_point: estimatePointId });

/**
 * Ask the open layout to re-fetch its work items right now instead of waiting
 * for the next 15-second poll. Used after edits that can move an item out of
 * the page's filters (a touch sets the next date, a new due date, a state
 * change): the server decides what still matches, so «due today» drops the
 * item at once. Debounced, so a burst of edits costs one request.
 */
export const LAYOUT_REFRESH_EVENT = "plane:layout-refresh";

const REFRESH_DEBOUNCE_MS = 150;
let timer: ReturnType<typeof setTimeout> | undefined;

export const requestLayoutRefresh = (): void => {
  if (typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    window.dispatchEvent(new Event(LAYOUT_REFRESH_EVENT));
  }, REFRESH_DEBOUNCE_MS);
};

type TRefreshParams = {
  storeType: string;
  workspaceSlug?: string;
  projectId?: string;
  viewId?: string;
  userId?: string;
  cycleId?: string;
  moduleId?: string;
};

/**
 * Re-fetch the layout store in place (existing pagination, «mutation» loader:
 * no blank flash). Signatures differ per store, hence the dispatch.
 */
export const refreshLayoutStore = (issues: unknown, params: TRefreshParams): void => {
  const fn = (issues as Record<string, unknown> | undefined)?.fetchIssuesWithExistingPagination;
  const { storeType, workspaceSlug: ws, projectId: pid, viewId, userId, cycleId, moduleId } = params;
  if (typeof fn !== "function" || !ws) return;
  const call = (...args: unknown[]) => {
    // Refresh errors stay silent: a toast every 15 s would only be noise.
    Promise.resolve(fn.apply(issues, args)).catch(() => undefined);
  };
  if (storeType === "PROFILE" && userId) call(ws, userId, "mutation");
  else if (storeType === "PROJECT_VIEW" && pid && viewId) call(ws, pid, viewId, "mutation");
  else if (storeType === "CYCLE" && pid && cycleId) call(ws, pid, "mutation", cycleId);
  else if (storeType === "MODULE" && pid && moduleId) call(ws, pid, "mutation", moduleId);
  else if (storeType === "PROJECT" && pid) call(ws, pid, "mutation");
};

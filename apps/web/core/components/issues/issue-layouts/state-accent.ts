/**
 * Visual accent for list rows, driven by the work item's state.
 *
 * Two of the four `started` states carry very different meaning for the owner
 * of the «Ваша работа» page: «📌 В процессе» is work he is doing himself,
 * «📍 На контроле» is work someone else does that he only supervises. Grouping
 * separates them into sections, but a scanning eye still needs a per-row cue —
 * hence a state-coloured rail on every row plus a muted title on supervised
 * ones.
 *
 * The marker list is intentionally a plain constant: this is a personal fork
 * with a hand-curated, workspace-wide state naming scheme, and matching by
 * name is the only signal the data model actually carries. Update it here if
 * the state gets renamed.
 */
const CONTROL_STATE_MARKERS = ["на контроле"];

/** True when the state means "someone else does it, I only supervise". */
export const isControlStateName = (stateName: string | undefined): boolean => {
  if (!stateName) return false;
  const normalized = stateName.trim().toLowerCase();
  return CONTROL_STATE_MARKERS.some((marker) => normalized.includes(marker));
};

/**
 * Shared hook that turns Plane labels with `cal:` prefix in the current
 * project into options for the DateTimeDurationPopup calendar selector.
 *
 * Each Google Calendar maps to a label `cal:{summary}` whose color mirrors
 * the GCal calendar's backgroundColor (synchronised by plane-gcal-sync).
 *
 * Returns a {@link CalendarOption} array sorted alphabetically by display name
 * and a helper to compute the next `label_ids` array when the user picks a
 * different calendar (or clears it). The helper preserves all non-cal:* labels.
 */

import { useMemo } from "react";
import { useLabel } from "@/hooks/store/use-label";
import type { CalendarOption } from "./date-time-duration-popup";

export const CAL_LABEL_PREFIX = "cal:";
// Fork-only: which `cal:*` label is "default" when the issue has none
// attached yet. Plane backend ALSO auto-attaches this label on issue
// creation (see plane/utils/default_cal_label.py) — the frontend
// preselect is purely a visual cue so the user sees "Текучка" in the
// dropdown right away without saving first.
const DEFAULT_CAL_LABEL_NAME = "cal:Текучка";

type Result = {
  options: CalendarOption[];
  /** Currently selected cal:* label id from the issue's label_ids (or null). */
  selectedId: string | null;
  /** Compute new label_ids when the user picks a calendar (id) or clears (null). */
  buildNextLabelIds: (currentIds: readonly string[] | null | undefined, nextId: string | null) => string[];
};

export function useCalendarOptions(
  projectId: string | null | undefined,
  currentLabelIds: readonly string[] | null | undefined
): Result {
  const { labelMap } = useLabel();

  return useMemo(() => {
    const projectLabels = Object.values(labelMap).filter(
      (l) => l?.project_id === projectId && (l.name ?? "").startsWith(CAL_LABEL_PREFIX)
    );

    const options: CalendarOption[] = projectLabels
      .map((l) => ({
        id: l.id,
        name: (l.name ?? "").slice(CAL_LABEL_PREFIX.length),
        color: l.color || "#9ca3af",
      }))
      .filter((o) => o.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));

    const calIdSet = new Set(options.map((o) => o.id));
    // First, see if the issue already has a cal:* label picked.
    const userSelectedId =
      (currentLabelIds ?? []).find((id) => calIdSet.has(id)) ?? null;
    // Fall back to the default ("Текучка") so the dropdown shows it
    // pre-selected on fresh issues. Backend will physically attach this
    // label on the next save if the user does nothing.
    const defaultId =
      projectLabels.find((l) => l.name === DEFAULT_CAL_LABEL_NAME)?.id ?? null;
    const selectedId = userSelectedId ?? defaultId;

    const buildNextLabelIds = (
      currentIds: readonly string[] | null | undefined,
      nextId: string | null
    ): string[] => {
      const cleared = (currentIds ?? []).filter((id) => !calIdSet.has(id));
      if (nextId !== null && calIdSet.has(nextId)) {
        return [...cleared, nextId];
      }
      return cleared;
    };

    return { options, selectedId, buildNextLabelIds };
  }, [labelMap, projectId, currentLabelIds]);
}

/**
 * The requesting user's daily load limit, shared by the week board and the
 * calendar-week through one SWR key: a change made on the board shows up in
 * the calendar without a reload. Until the server answers, every day is
 * DEFAULT_DAY_LIMIT.
 *
 * Mutators are optimistic: the change is visible at once, rolled back with a
 * toast if the PATCH fails.
 */
import { useCallback, useMemo } from "react";
import useSWR from "swr";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { WORKSPACE_DAY_CAPACITY } from "@/constants/fetch-keys";
import { dayCapacityService } from "@/services/day-capacity.service";
import {
  DEFAULT_DAY_CAPACITY,
  applyDayCapacityPatch,
  dayKey,
  hasDayOverride,
  resolveDayLimit,
  weekdayIndex,
  withWeekdayLimit,
} from "./day-limit";
import type { TDayCapacity, TDayCapacityPatch } from "./day-limit";

export type TDayCapacityApi = {
  /** False until the server answered: editing is off so defaults can't overwrite the real template. */
  isLoaded: boolean;
  limitFor: (date: Date) => number;
  hasOverride: (date: Date) => boolean;
  weekdayLimits: number[];
  overrides: Record<string, number>;
  /** Exception for this one date. */
  setDayLimit: (date: Date, limit: number) => Promise<boolean>;
  /** Template for the date's weekday; drops this date's exception so the new value applies to it too. */
  setWeekdayLimit: (date: Date, limit: number) => Promise<boolean>;
  clearDayLimit: (date: Date) => Promise<boolean>;
};

const errorMessage = (error: unknown): string => {
  const serverMessage = (error as { error?: unknown } | undefined)?.error;
  return typeof serverMessage === "string" ? serverMessage : "Изменение не сохранено, лимит вернулся к прежнему.";
};

export const useDayCapacity = (workspaceSlug: string | undefined): TDayCapacityApi => {
  const { data, mutate } = useSWR(
    workspaceSlug ? WORKSPACE_DAY_CAPACITY(workspaceSlug) : null,
    workspaceSlug ? () => dayCapacityService.fetchCapacity(workspaceSlug) : null,
    { revalidateOnFocus: false }
  );
  const capacity: TDayCapacity = data ?? DEFAULT_DAY_CAPACITY;

  const update = useCallback(
    async (patch: TDayCapacityPatch): Promise<boolean> => {
      if (!workspaceSlug) return false;
      try {
        await mutate(dayCapacityService.updateCapacity(workspaceSlug, patch), {
          optimisticData: (current) => applyDayCapacityPatch(current ?? DEFAULT_DAY_CAPACITY, patch),
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        });
        return true;
      } catch (error) {
        console.error("day-capacity: failed to save", patch, error);
        setToast({ type: TOAST_TYPE.ERROR, title: "Не удалось изменить лимит дня", message: errorMessage(error) });
        return false;
      }
    },
    [workspaceSlug, mutate]
  );

  const setDayLimit = useCallback(
    (date: Date, limit: number) => update({ set_override: { date: dayKey(date), limit } }),
    [update]
  );
  const setWeekdayLimit = useCallback(
    (date: Date, limit: number) =>
      update({
        weekday_limits: withWeekdayLimit(capacity.weekday_limits, weekdayIndex(date), limit),
        ...(hasDayOverride(capacity, date) ? { clear_override: dayKey(date) } : {}),
      }),
    [update, capacity]
  );
  const clearDayLimit = useCallback((date: Date) => update({ clear_override: dayKey(date) }), [update]);
  const limitFor = useCallback((date: Date) => resolveDayLimit(capacity, date), [capacity]);
  const hasOverride = useCallback((date: Date) => hasDayOverride(capacity, date), [capacity]);

  return useMemo(
    () => ({
      isLoaded: data !== undefined,
      limitFor,
      hasOverride,
      weekdayLimits: capacity.weekday_limits,
      overrides: capacity.date_overrides,
      setDayLimit,
      setWeekdayLimit,
      clearDayLimit,
    }),
    [data, limitFor, hasOverride, capacity, setDayLimit, setWeekdayLimit, clearDayLimit]
  );
};

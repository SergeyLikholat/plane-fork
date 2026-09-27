/**
 * Daily load limit — pure rules (no store, no network).
 *
 * The limit of a day is its per-date exception if there is one, otherwise the
 * weekly template value for its weekday (index 0 = Monday). Limit 0 is a day
 * off. Mirrors `apps/api/plane/utils/day_capacity.py`.
 */

export const DEFAULT_DAY_LIMIT = 13;
export const MIN_DAY_LIMIT = 0;
export const MAX_DAY_LIMIT = 40;
export const DAY_LIMIT_PRESETS = [0, 5, 8, 10, 13] as const;
const DAYS_IN_WEEK = 7;

export type TDayCapacity = {
  /** Seven limits, Monday first. */
  weekday_limits: number[];
  /** `YYYY-MM-DD` → limit. */
  date_overrides: Record<string, number>;
};

/** Any combination; the server clears before it sets. */
export type TDayCapacityPatch = {
  weekday_limits?: number[];
  set_override?: { date: string; limit: number };
  clear_override?: string;
};

export const DEFAULT_DAY_CAPACITY: TDayCapacity = {
  weekday_limits: Array.from({ length: DAYS_IN_WEEK }, () => DEFAULT_DAY_LIMIT),
  date_overrides: {},
};

/** «понедельники» … «воскресенья» — «Все …», Monday first. */
const WEEKDAY_ACCUSATIVE_PLURAL = [
  "понедельники",
  "вторники",
  "среды",
  "четверги",
  "пятницы",
  "субботы",
  "воскресенья",
] as const;

/** Monday = 0 … Sunday = 6. */
export const weekdayIndex = (date: Date): number => (date.getDay() + 6) % DAYS_IN_WEEK;

export const weekdayPluralName = (date: Date): string => WEEKDAY_ACCUSATIVE_PLURAL[weekdayIndex(date)];

/** Local `YYYY-MM-DD` (same as the date part of `target_date`). */
export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const clampDayLimit = (value: number): number =>
  Math.min(MAX_DAY_LIMIT, Math.max(MIN_DAY_LIMIT, Math.round(Number.isFinite(value) ? value : 0)));

export const hasDayOverride = (capacity: TDayCapacity, date: Date): boolean =>
  Object.prototype.hasOwnProperty.call(capacity.date_overrides, dayKey(date));

export const resolveDayLimit = (capacity: TDayCapacity, date: Date): number => {
  const override = capacity.date_overrides[dayKey(date)];
  if (typeof override === "number") return override;
  return capacity.weekday_limits[weekdayIndex(date)] ?? DEFAULT_DAY_LIMIT;
};

/** Template with one weekday replaced (new array). */
export const withWeekdayLimit = (weekdayLimits: number[], weekday: number, limit: number): number[] =>
  Array.from({ length: DAYS_IN_WEEK }, (_, i) => (i === weekday ? limit : (weekdayLimits[i] ?? DEFAULT_DAY_LIMIT)));

/** Local (optimistic) result of a PATCH; server-side pruning is not replicated. New object. */
export const applyDayCapacityPatch = (capacity: TDayCapacity, patch: TDayCapacityPatch): TDayCapacity => {
  const overrides = { ...capacity.date_overrides };
  if (patch.clear_override !== undefined) delete overrides[patch.clear_override];
  if (patch.set_override) overrides[patch.set_override.date] = patch.set_override.limit;
  return {
    weekday_limits: patch.weekday_limits ? [...patch.weekday_limits] : [...capacity.weekday_limits],
    date_overrides: overrides,
  };
};

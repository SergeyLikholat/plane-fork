/**
 * Client copy of `compute_next_touch` (apps/api/plane/utils/control_touch.py),
 * used only to PRE-FILL the «next date» field in the touch dialogs. The server
 * stays the source of truth: when the owner leaves the proposal untouched, the
 * dialog sends no `next_date` and the server computes the same date itself.
 */
import type { TControlFrequency, TControlOutcome } from "@/services/issue/issue-control.service";
import { RISK_STREAK } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);
const isWeekend = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6;

const shiftForward = (d: Date): Date => {
  let day = d;
  while (isWeekend(day)) day = addDays(day, 1);
  return day;
};

const shiftBack = (d: Date): Date => {
  let day = d;
  while (isWeekend(day)) day = addDays(day, -1);
  return day;
};

export const nextWorkingDay = (today: Date): Date => shiftForward(addDays(startOfDay(today), 1));

/** Next Monday or Thursday strictly after `today`. */
const nextTwiceWeekDay = (today: Date): Date => {
  let day = addDays(startOfDay(today), 1);
  while (day.getDay() !== 1 && day.getDay() !== 4) day = addDays(day, 1);
  return day;
};

const byFrequency = (today: Date, frequency: TControlFrequency): Date => {
  if (frequency === "daily") return nextWorkingDay(today);
  if (frequency === "weekly") return shiftForward(addDays(startOfDay(today), 7));
  return nextTwiceWeekDay(today);
};

export const computeNextTouch = (today: Date, frequency: TControlFrequency, promised: Date | null): Date => {
  const base = startOfDay(today);
  if (promised && startOfDay(promised) <= base) return nextWorkingDay(base);
  const candidate = byFrequency(base, frequency);
  if (!promised) return candidate;
  const due = startOfDay(promised);
  const mandatory = [shiftBack(addDays(due, -1)), shiftBack(due)].filter((d) => d > base);
  return [candidate, ...mandatory].reduce((min, d) => (d < min ? d : min));
};

type TProposalInput = {
  outcome: TControlOutcome;
  frequency: TControlFrequency;
  streak: number;
  /** Promised date in effect after this touch (new one for new_deadline / returned / assigned). */
  promised: Date | null;
  today?: Date;
};

/** Date the server would set for this outcome; null when the outcome closes the task. */
export const proposeNextDate = ({
  outcome,
  frequency,
  streak,
  promised,
  today = new Date(),
}: TProposalInput): Date | null => {
  if (outcome === "accepted") return null;
  if (outcome === "submitted") return nextWorkingDay(today);
  if (outcome === "no_progress") {
    const effective = streak + 1 >= RISK_STREAK ? "daily" : frequency;
    return computeNextTouch(today, effective, promised);
  }
  return computeNextTouch(today, frequency, promised);
};

/** Field label for the next action this outcome leads to. */
export const nextDateLabel = (outcome: TControlOutcome): string => {
  if (outcome === "submitted") return "Дата приёмки";
  if (outcome === "assigned") return "Первое касание";
  return "Следующее касание";
};

export const parseIsoDay = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

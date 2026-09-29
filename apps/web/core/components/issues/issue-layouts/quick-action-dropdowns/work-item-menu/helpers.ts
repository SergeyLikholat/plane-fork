/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * The ⋯ menu of work items (list rows, kanban cards, spreadsheet) — pure
 * rules: what kind of work item it is, which state is which, what a date
 * move changes. No stores, no React.
 */

import type { TIssue } from "@plane/types";
import { renderFormattedPayloadDate } from "@plane/utils";
import { isBigTaskStateName, isControlStateName } from "@/components/issues/issue-layouts/state-accent";

/** Fibonacci weights of the «Вес» estimate. */
export const MENU_WEIGHTS = [1, 2, 3, 5, 8, 13] as const;

export const CLOSED_STATE_GROUPS = new Set(["completed", "cancelled"]);

type TStateLike = { id: string; name: string; group: string; sequence?: number };

const normalizeStateName = (name: string | undefined | null): string =>
  (name ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

const MAYBE_MARKER = "может быть";

export const isMaybeStateName = (name: string | undefined | null): boolean =>
  normalizeStateName(name).includes(MAYBE_MARKER);

/** The first state (by the store's order) matching the predicate. */
const findState = <T extends TStateLike>(states: T[] | undefined, predicate: (state: T) => boolean): T | undefined =>
  states?.find(predicate);

export const findBigTasksState = <T extends TStateLike>(states: T[] | undefined) =>
  findState(states, (state) => isBigTaskStateName(state.name));

export const findMaybeState = <T extends TStateLike>(states: T[] | undefined) =>
  findState(states, (state) => isMaybeStateName(state.name));

/** «На контроле» by name, else any state of the `supervised` group — as the backend picks it. */
export const findControlState = <T extends TStateLike>(states: T[] | undefined) =>
  findState(states, (state) => state.group === "supervised" && isControlStateName(state.name)) ??
  findState(states, (state) => state.group === "supervised");

/** «AX-214» when the identifier is known. */
export const formatWorkItemKey = (projectIdentifier: string | null | undefined, sequenceId: number | undefined) =>
  projectIdentifier && sequenceId !== undefined ? `${projectIdentifier}-${sequenceId}` : null;

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DAYS_IN_WEEK = 7;
const MONDAY = 1;

const atMidnight = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date: Date, days: number): Date => {
  const next = atMidnight(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** Monday of the next calendar week (the week starts on Monday): from a Monday — in 7 days, from a Sunday — tomorrow. */
export const nextWeekMonday = (now: Date): Date => {
  const daysAhead = (DAYS_IN_WEEK + MONDAY - now.getDay()) % DAYS_IN_WEEK || DAYS_IN_WEEK;
  return addDays(now, daysAhead);
};

export type TRescheduleChanges = Pick<Partial<TIssue>, "target_date" | "start_date" | "target_time" | "start_time">;

/**
 * Fields to send when the due date moves to `next` (`YYYY-MM-DD`) or is
 * cleared (`null`). A same-day block (start date = due date) moves whole;
 * a start that would land after the new due date is dropped. Clearing drops
 * the times as well, like «Очистить» in the date popup.
 */
export const planReschedule = (
  issue: Pick<TIssue, "target_date" | "start_date">,
  next: string | null
): TRescheduleChanges => {
  if (next === null) return { target_date: null, target_time: null, start_date: null, start_time: null };
  const changes: TRescheduleChanges = { target_date: next };
  const start = issue.start_date?.slice(0, 10) ?? null;
  const due = issue.target_date?.slice(0, 10) ?? null;
  if (start && due && start === due) changes.start_date = next;
  else if (start && start > next) changes.start_date = null;
  return changes;
};

export const toPayloadDate = (date: Date): string | null => renderFormattedPayloadDate(date) ?? null;

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Label ids with every «ЛЮДИ» label replaced by `personId`. */
export const swapPersonLabel = (labelIds: string[], peopleIds: Set<string>, personId: string): string[] => [
  ...labelIds.filter((id) => !peopleIds.has(id)),
  personId,
];

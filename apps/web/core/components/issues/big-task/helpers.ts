/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Big tasks — pure helpers shared by the «Какой следующий шаг?» dialog, the
 * sidebar / peek block, list rows and the week board.
 */
import { mutate } from "swr";
import { normalizeLabelName } from "@/components/issues/issue-layouts/week-board/weights";
import { PERFORMER_ME } from "@/services/issue/big-task.service";

export { isBigTaskStateName } from "@/components/issues/issue-layouts/state-accent";

/** Fibonacci weights offered for a step. */
export const STEP_WEIGHTS = [1, 2, 3, 5, 8, 13] as const;
/** Own step — «мелочь»; a step for someone else starts with «🗣 Постановка» (3). */
export const OWN_STEP_WEIGHT = 2;
export const SETUP_STEP_WEIGHT = 3;

export const defaultStepWeight = (performer: string): number =>
  performer === PERFORMER_ME ? OWN_STEP_WEIGHT : SETUP_STEP_WEIGHT;

const PEOPLE_PARENT_LABEL = "люди";

export const isPeopleParentName = (name: string | undefined | null): boolean =>
  normalizeLabelName(name ?? "") === PEOPLE_PARENT_LABEL;

/** SWR keys of `big-task-context` are `[BIG_TASK_CONTEXT_KEY, slug, ids]`. */
export const BIG_TASK_CONTEXT_KEY = "BIG_TASK_CONTEXT";

export const bigTaskContextKey = (workspaceSlug: string, issueIds: string[]) =>
  // Sorts a copy: the web tsconfig lib is ES2022, no toSorted.
  // oxlint-disable-next-line unicorn/no-array-sort
  [BIG_TASK_CONTEXT_KEY, workspaceSlug, [...issueIds].sort().join(",")] as const;

/** Refetch every mounted `big-task-context` (lists, sidebar, peek, week board). */
export const revalidateBigTaskContext = () => mutate((key) => Array.isArray(key) && key[0] === BIG_TASK_CONTEXT_KEY);

const REVALIDATE_DEBOUNCE_MS = 250;
let revalidateTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Debounced refetch after any saved work-item change (parent, state, date,
 * labels…): parent chips, Big-task progress and «current step» are derived
 * server-side, so they must be re-asked — a burst of edits gives one request.
 */
export const scheduleBigTaskContextRevalidate = () => {
  if (revalidateTimer) clearTimeout(revalidateTimer);
  revalidateTimer = setTimeout(() => {
    revalidateTimer = undefined;
    void revalidateBigTaskContext();
  }, REVALIDATE_DEBOUNCE_MS);
};

/** Fired after a step is created or a Big task closed; the week board refetches on it. */
export const BIG_TASK_CHANGED_EVENT = "plane:big-task-changed";

export const announceBigTaskChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BIG_TASK_CHANGED_EVENT));
};

/** «PRJ-12» when the identifier is known, else just the number. */
export const formatIssueKey = (projectIdentifier: string | null | undefined, sequenceId: number | undefined) =>
  projectIdentifier ? `${projectIdentifier}-${sequenceId ?? ""}` : `#${sequenceId ?? ""}`;

const SHORT_DAY = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

/** "2026-10-01" → «1 окт.»; null for an empty value. */
export const formatShortDay = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return SHORT_DAY.format(new Date(y, m - 1, d));
};

/** Russian plural: 1 шаг, 2 шага, 5 шагов. */
export const pluralSteps = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "шаг";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "шага";
  return "шагов";
};

/** Russian plural: 1 подзадача, 2 подзадачи, 5 подзадач. */
export const pluralSubIssues = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "подзадача";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "подзадачи";
  return "подзадач";
};

type TStepLike = { name: string; person: string | null; target_date: string | null };

/** «Согласовать узлы · Фурсов А. · 1 окт.» — own steps read «я». */
export const describeStep = (step: TStepLike): string =>
  [step.name, step.person ?? "я", formatShortDay(step.target_date)].filter(Boolean).join(" · ");

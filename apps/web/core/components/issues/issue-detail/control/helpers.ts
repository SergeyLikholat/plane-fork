/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Control block helpers (pure). Phase detection reuses the week-board weight
 * rules so the sidebar, the peek and the board agree on what a supervised
 * work item is.
 */

import { getDate } from "@plane/utils";
import { isControlStateName } from "@/components/issues/issue-layouts/state-accent";
import { detectControlKind } from "@/components/issues/issue-layouts/week-board/weights";
import type { TControlFrequency, TControlOutcome, TControlPhase } from "@/services/issue/issue-control.service";

export const RISK_STREAK = 2;

export const FREQUENCY_OPTIONS: { value: TControlFrequency; label: string }[] = [
  { value: "daily", label: "Каждый день" },
  { value: "twice_week", label: "2 раза в неделю" },
  { value: "weekly", label: "Раз в неделю" },
];

export const PHASE_TITLES: Record<TControlPhase, string> = {
  setup: "🗣 Постановка",
  check: "👁 Проверка",
  acceptance: "✅ Приёмка",
};

export type TCheckOutcomeOption = {
  value: Extract<TControlOutcome, "progress" | "no_progress" | "new_deadline" | "submitted" | "closed">;
  label: string;
  hint: string;
};

export const CHECK_OUTCOMES: TCheckOutcomeOption[] = [
  { value: "progress", label: "Движется", hint: "Следующее касание — по частоте" },
  { value: "no_progress", label: "Без движения", hint: "Второй раз подряд — каждый день и 🔥" },
  { value: "new_deadline", label: "Новый срок", hint: "Назвал другую дату" },
  { value: "submitted", label: "Сдал — на приёмку", hint: "Этап сменится на ✅ Приёмку" },
  { value: "closed", label: "Вопрос закрыт", hint: "Задача закроется, приёмка не нужна" },
];

type TControlDetectInput = {
  labelNames: string[];
  stateGroup?: string | null;
  stateName?: string;
};

/** Phase of a supervised item, or null when the item is not under control. */
export const getControlPhase = (input: TControlDetectInput): TControlPhase | null => {
  const kind = detectControlKind({
    labels: input.labelNames.map((name) => ({ name })),
    stateGroup: input.stateGroup,
    isControlState: isControlStateName(input.stateName),
  });
  return kind;
};

export const getFrequencyLabel = (value: TControlFrequency | undefined): string =>
  FREQUENCY_OPTIONS.find((option) => option.value === value)?.label ?? FREQUENCY_OPTIONS[1].label;

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export type TTouchDue = "overdue" | "today" | "soon" | "later";

/** How urgent the next touch is relative to `now`. */
export const getTouchDue = (value: string | null | undefined, now: Date = new Date()): TTouchDue | null => {
  const date = getDate(value);
  if (!date) return null;
  const diff = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "soon";
  return "later";
};

const DAY_FORMAT = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short" });

/** «чт, 1 окт.» */
export const formatRuDay = (value: string | null | undefined): string | null => {
  const date = getDate(value);
  return date ? DAY_FORMAT.format(date) : null;
};

/** Russian plural for «раз»: 2 раза, 5 раз. */
export const pluralTimes = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "раза";
  return "раз";
};

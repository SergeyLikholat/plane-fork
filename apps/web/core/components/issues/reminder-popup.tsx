/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Reminder picker (fork-only) — bridges Plane and Google Calendar.
 *
 * Plane itself does NOT deliver these notifications; alerting is handed
 * off to Google Calendar via plane-gcal-sync, which maps the Plane
 * `issue.reminders` JSONB array onto `event.reminders.overrides[]`.
 *
 * UI mirrors the Google Calendar mobile "Notifications" sheet:
 *   - When `hasDate=false` the trigger is disabled (no anchor for the
 *     offset to count back from). Without a target date a popup
 *     reminder is meaningless, and GCal would reject the push.
 *   - When empty: trigger shows «Без напоминания», compact.
 *   - When set: trigger shows the count + the closest reminder
 *     ("за 30 мин · 2 шт."). Popup lists every reminder with × to
 *     remove, plus a preset grid + an inline custom-value form.
 *   - Hard-capped at 5 (Google Calendar's documented per-event max).
 */

import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { Bell, Plus, X } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import type { TIssueReminder, TIssueReminderMethod } from "@plane/types";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";

const MAX_REMINDERS = 5;
// Google Calendar accepts 0–40320 minutes (4 weeks). We keep the same range.
const MAX_MINUTES = 40320;
// For all-day events Google semantics treat the reminder anchor as 09:00
// the morning of the event (not midnight). To get "1 day before at 9 AM"
// Google's stored value is (24h - 9h) = 15h = 900 minutes from start of
// the all-day event (which itself starts at 00:00). Our UI labels show
// "за N дней (в 9:00)" so the user reads it the same way as in GCal.
const ALL_DAY_ANCHOR_HOUR = 9;
const ALL_DAY_ANCHOR_OFFSET = ALL_DAY_ANCHOR_HOUR * 60; // 540

type Preset = { label: string; minutes: number };

const PRESETS_TIMED: Preset[] = [
  { label: "В момент срока", minutes: 0 },
  { label: "За 5 мин", minutes: 5 },
  { label: "За 10 мин", minutes: 10 },
  { label: "За 15 мин", minutes: 15 },
  { label: "За 30 мин", minutes: 30 },
  { label: "За 1 час", minutes: 60 },
  { label: "За 2 часа", minutes: 120 },
  { label: "За 1 день", minutes: 1440 },
  { label: "За 2 дня", minutes: 2880 },
  { label: "За 1 неделю", minutes: 10080 },
];

// All-day presets count back from the GCal default-anchor 9:00 AM of the
// event day. e.g. "1 day before" => 09:00 the previous morning =
// 1*24h − 9h = 15h before midnight = 900 minutes.
const PRESETS_ALL_DAY: Preset[] = [
  { label: "За 1 день (в 9:00)", minutes: 1 * 1440 - ALL_DAY_ANCHOR_OFFSET },
  { label: "За 2 дня (в 9:00)", minutes: 2 * 1440 - ALL_DAY_ANCHOR_OFFSET },
  { label: "За 1 неделю (в 9:00)", minutes: 7 * 1440 - ALL_DAY_ANCHOR_OFFSET },
  { label: "За 2 недели (в 9:00)", minutes: 14 * 1440 - ALL_DAY_ANCHOR_OFFSET },
  { label: "За 4 недели (в 9:00)", minutes: 28 * 1440 - ALL_DAY_ANCHOR_OFFSET },
];

type CustomUnit = "minutes" | "hours" | "days" | "weeks";

const UNIT_TO_MINUTES: Record<CustomUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
};

// "За X дней (в 9:00)" reverse-decode: (minutes + 540) / 1440 = days,
// remainder must be 0 to declare an exact 9:00 anchor.
function formatAllDay(minutes: number): string {
  const shifted = minutes + ALL_DAY_ANCHOR_OFFSET;
  if (shifted > 0 && shifted % 1440 === 0) {
    const days = shifted / 1440;
    if (days % 7 === 0) {
      const w = days / 7;
      return `за ${w} ${w === 1 ? "неделю" : w < 5 ? "недели" : "недель"} (в 9:00)`;
    }
    const noun = days === 1 ? "день" : days < 5 ? "дня" : "дней";
    return `за ${days} ${noun} (в 9:00)`;
  }
  // Non-canonical value (custom input) — show in hours/minutes from
  // midnight so the user has SOME idea of when it fires.
  return formatTimed(minutes);
}

function formatTimed(m: number): string {
  if (m === 0) return "В момент срока";
  if (m % 10080 === 0) {
    const w = m / 10080;
    return `за ${w} ${w === 1 ? "неделю" : w < 5 ? "недели" : "недель"}`;
  }
  if (m % 1440 === 0) {
    const d = m / 1440;
    const noun = d === 1 ? "день" : d < 5 ? "дня" : "дней";
    return `за ${d} ${noun}`;
  }
  if (m % 60 === 0) {
    const h = m / 60;
    const noun = h === 1 ? "час" : h < 5 ? "часа" : "часов";
    return `за ${h} ${noun}`;
  }
  return `за ${m} мин`;
}

function formatMinutes(m: number, hasTime: boolean): string {
  return hasTime ? formatTimed(m) : formatAllDay(m);
}

type Props = {
  value: TIssueReminder[];
  onChange: (next: TIssueReminder[]) => void;
  hasDate: boolean;
  // When true → task has a concrete `target_time`, so the event will be
  // pushed as a timed GCal event and reminders fire offset-from-deadline.
  // When false → all-day event; reminders count back from 9:00 AM the day
  // of the deadline (Google's documented default for all-day reminders).
  hasTime: boolean;
  disabled?: boolean;
  buttonClassName?: string;
};

export const ReminderPopup: React.FC<Props> = ({
  value,
  onChange,
  hasDate,
  hasTime,
  disabled,
  buttonClassName = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customN, setCustomN] = useState<string>("");
  const [customUnit, setCustomUnit] = useState<CustomUnit>(hasTime ? "minutes" : "days");

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [referenceEl, setReferenceEl] = useState<HTMLButtonElement | null>(null);
  const [popperEl, setPopperEl] = useState<HTMLDivElement | null>(null);
  const { styles, attributes } = usePopper(referenceEl, popperEl, {
    placement: "bottom-start",
    modifiers: [{ name: "preventOverflow", options: { padding: 12 } }],
  });
  useOutsideClickDetector(wrapperRef, () => {
    if (isOpen) setIsOpen(false);
  });

  const isDisabled = disabled || !hasDate;
  const reachedCap = value.length >= MAX_REMINDERS;

  // Reminders are sorted by minutes-before-event ascending (the one that
  // fires earliest = highest minutes value, shown last). Stable sort.
  const sorted = useMemo(
    () => [...value].sort((a, b) => a.minutes - b.minutes),
    [value]
  );

  const triggerLabel = useMemo(() => {
    if (!hasDate) return "Сначала срок";
    if (value.length === 0) return "Без напоминания";
    const closest = sorted[0];
    if (!closest) return "Без напоминания";
    if (value.length === 1) return formatMinutes(closest.minutes, hasTime);
    return `${formatMinutes(closest.minutes, hasTime)} · ${value.length} шт.`;
  }, [hasDate, value.length, sorted, hasTime]);

  const presets = hasTime ? PRESETS_TIMED : PRESETS_ALL_DAY;

  const addPreset = (minutes: number, method: TIssueReminderMethod = "popup") => {
    if (reachedCap) return;
    // Don't add a duplicate (same method + minutes pair already present).
    if (value.some((r) => r.method === method && r.minutes === minutes)) return;
    onChange([...value, { method, minutes }]);
  };

  const addCustom = () => {
    const n = parseInt(customN, 10);
    if (!Number.isFinite(n) || n < 0) return;
    let minutes = n * UNIT_TO_MINUTES[customUnit];
    // For all-day events: the user's "за N дней" means "N days before
    // at 9:00 AM", same anchor as the preset list. Subtract the 9:00
    // offset so the saved value matches what Google expects.
    if (!hasTime) {
      minutes = Math.max(0, minutes - ALL_DAY_ANCHOR_OFFSET);
    }
    minutes = Math.min(MAX_MINUTES, minutes);
    addPreset(minutes);
    setCustomN("");
  };

  const removeAt = (idx: number) => {
    const target = sorted[idx];
    if (!target) return;
    // Map sorted index → original index. Stable because of stable sort.
    const origIdx = value.findIndex(
      (r, i) =>
        r.minutes === target.minutes &&
        r.method === target.method &&
        value
          .slice(0, i)
          .filter((p) => p.minutes === target.minutes && p.method === target.method)
          .length ===
          sorted
            .slice(0, idx)
            .filter((p) => p.minutes === target.minutes && p.method === target.method)
            .length
    );
    if (origIdx < 0) return;
    onChange(value.filter((_, i) => i !== origIdx));
  };

  const button = (
    <button
      ref={setReferenceEl}
      type="button"
      disabled={isDisabled}
      onClick={() => setIsOpen((o) => !o)}
      className={cn(
        "group/reminder-trigger flex h-7.5 w-full items-center gap-2 rounded-sm px-2 py-0.5 text-body-xs-regular hover:bg-surface-2",
        isDisabled && "cursor-not-allowed opacity-60",
        value.length > 0 ? "text-primary" : "text-placeholder",
        buttonClassName
      )}
    >
      <Bell className="size-3.5 shrink-0" />
      <span className="truncate">{triggerLabel}</span>
    </button>
  );

  const trigger = !hasDate ? (
    <Tooltip
      tooltipContent="Сначала установите срок выполнения"
      position="top"
      disabled={hasDate}
    >
      <div className="w-full">{button}</div>
    </Tooltip>
  ) : (
    button
  );

  return (
    <div ref={wrapperRef} className="w-full">
      {trigger}
      {isOpen &&
        !isDisabled &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setPopperEl}
            // Popup renders in document.body via createPortal — outside
            // wrapperRef. Without this attribute, any click inside the
            // popup is treated as "outside" by useOutsideClickDetector,
            // closing the popup before the button's onClick fires (so
            // no preset is ever added). The hook checks for this
            // attribute on event.target.closest() and bails out.
            data-prevent-outside-click
            style={styles.popper}
            {...attributes.popper}
            className="relative z-30 w-[260px] rounded-md border border-subtle-1 bg-surface-1 p-3 shadow-md"
          >
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Закрыть"
              className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-sm text-tertiary hover:bg-surface-2 hover:text-primary"
            >
              <X className="size-3.5" />
            </button>
            {sorted.length > 0 && (
              <div className="mb-2 pr-6">
                <div className="mb-1 text-body-xs-medium text-secondary">
                  Активные ({sorted.length}/{MAX_REMINDERS})
                </div>
                <div className="flex flex-wrap gap-1">
                  {sorted.map((r, idx) => (
                    <span
                      key={`${r.method}-${r.minutes}-${idx}`}
                      className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-body-xxs-regular"
                    >
                      {formatMinutes(r.minutes, hasTime)}
                      <button
                        type="button"
                        onClick={() => removeAt(idx)}
                        className="text-tertiary hover:text-danger-primary"
                        aria-label="Удалить напоминание"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-1 pr-6 text-body-xs-medium text-secondary">Добавить</div>
            <div className="mb-2 max-h-[210px] overflow-y-auto">
              {presets.map((p) => {
                const already = value.some(
                  (r) => r.method === "popup" && r.minutes === p.minutes
                );
                const disabledPreset = already || reachedCap;
                return (
                  <button
                    key={p.minutes}
                    type="button"
                    disabled={disabledPreset}
                    onClick={() => addPreset(p.minutes)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-body-xs-regular",
                      disabledPreset
                        ? "cursor-not-allowed text-placeholder"
                        : "hover:bg-surface-2"
                    )}
                  >
                    <span>{p.label}</span>
                    {already && <span className="text-tertiary">✓</span>}
                  </button>
                );
              })}
            </div>

            {!reachedCap && (
              <div className="border-t border-subtle-1 pt-2">
                <div className="mb-1 text-body-xs-medium text-secondary">Другое</div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={MAX_MINUTES}
                    value={customN}
                    placeholder="0"
                    onChange={(e) => setCustomN(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCustom();
                    }}
                    className="h-7 w-14 rounded-sm border border-subtle-1 bg-surface-1 px-2 text-body-xs-regular"
                  />
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value as CustomUnit)}
                    className="h-7 rounded-sm border border-subtle-1 bg-surface-1 px-1 text-body-xs-regular"
                  >
                    {hasTime ? (
                      <>
                        <option value="minutes">мин</option>
                        <option value="hours">ч</option>
                        <option value="days">дн</option>
                      </>
                    ) : (
                      <>
                        <option value="days">дн</option>
                        <option value="weeks">нед</option>
                      </>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={addCustom}
                    disabled={customN.trim() === ""}
                    className="ml-auto inline-flex items-center gap-1 rounded-sm bg-accent-primary px-2 py-1 text-body-xs-medium text-on-color disabled:opacity-50"
                  >
                    <Plus className="size-3" /> Добавить
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default ReminderPopup;

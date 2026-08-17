/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Reminder picker (fork-only) — bridges Plane and Google Calendar.
 *
 * Plane itself does NOT deliver these notifications; alerting is handed off to
 * Google Calendar via plane-gcal-sync, which maps the Plane `issue.reminders`
 * JSONB array onto `event.reminders.overrides[]`.
 *
 * The editor deliberately mirrors Google Calendar's own notification block —
 * one row per reminder, each row edited in place:
 *
 *   timed event    [Уведомление ▾] [10] [минут ▾]  до начала         [×]
 *   all-day event  [Уведомление ▾] [1]  [дней  ▾]  до, в [09:00]     [×]
 *
 * Google stores every reminder as a single "minutes before the event starts"
 * integer (0…40320). For all-day events the event starts at local midnight,
 * so "N days before at HH:MM" is encoded as `N * 1440 - (HH * 60 + MM)`.
 * Verified against real events in the user's calendar: a birthday reminder
 * "1 day before at 9:00" is stored as 900, "7 days before at 9:00" as 9540.
 *
 * Because the encoding cannot go negative, a same-day all-day reminder can
 * only be 00:00 (minutes = 0) — anything later that morning would need a
 * negative offset. The day selector therefore starts at 0 but forces 00:00.
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
const MINUTES_PER_DAY = 1440;

/** Default time-of-day for all-day reminders, matching Google's own default. */
const DEFAULT_ALL_DAY_TIME = 9 * 60; // 09:00

/**
 * All-day reminders start at "1 day before" on purpose.
 *
 * Zero days would mean firing at or after the event's own midnight, i.e. a
 * negative offset — and Google silently collapses anything negative to 0
 * (verified against the live API: -540 comes back as 0). So "0 days at 09:00",
 * "0 days at 00:00" and "0 days at 10:00" all store the same zero, and the
 * time box stops meaning anything. Google's own UI still shows a time there,
 * which is what made the setting look broken. We just don't offer it.
 *
 * For a genuine "at 09:00 on the due date", give the task a time instead —
 * it then syncs as a timed event where offsets behave normally.
 */
const MIN_ALL_DAY_DAYS = 1;

type TimedUnit = "minutes" | "hours" | "days" | "weeks";

const TIMED_UNIT_MINUTES: Record<TimedUnit, number> = {
  minutes: 1,
  hours: 60,
  days: MINUTES_PER_DAY,
  weeks: 7 * MINUTES_PER_DAY,
};

const TIMED_UNIT_LABELS: Record<TimedUnit, string> = {
  minutes: "минут",
  hours: "часов",
  days: "дней",
  weeks: "недель",
};

/** Largest unit that divides the offset evenly — what Google shows on reopen. */
function decodeTimed(minutes: number): { count: number; unit: TimedUnit } {
  const units: TimedUnit[] = ["weeks", "days", "hours", "minutes"];
  for (const unit of units) {
    const size = TIMED_UNIT_MINUTES[unit];
    if (minutes >= size && minutes % size === 0) return { count: minutes / size, unit };
  }
  return { count: minutes, unit: "minutes" };
}

/**
 * Split an all-day offset back into "N days before at HH:MM".
 * minutes = days * 1440 - timeOfDay, so days is the offset rounded UP to whole
 * days and the remainder is the time of day.
 */
function decodeAllDay(minutes: number): { days: number; timeOfDay: number } {
  const days = Math.ceil(minutes / MINUTES_PER_DAY);
  return { days, timeOfDay: days * MINUTES_PER_DAY - minutes };
}

function encodeAllDay(days: number, timeOfDay: number): number {
  return clampMinutes(days * MINUTES_PER_DAY - timeOfDay);
}

const clampMinutes = (m: number) => Math.min(MAX_MINUTES, Math.max(0, Math.round(m)));

const toTimeInput = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const fromTimeInput = (value: string): number | undefined => {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
  return h * 60 + m;
};

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** Short summary used on the collapsed trigger. */
function formatSummary(minutes: number, hasTime: boolean): string {
  if (hasTime) {
    if (minutes === 0) return "в момент срока";
    const { count, unit } = decodeTimed(minutes);
    const noun =
      unit === "minutes"
        ? plural(count, "минуту", "минуты", "минут")
        : unit === "hours"
          ? plural(count, "час", "часа", "часов")
          : unit === "days"
            ? plural(count, "день", "дня", "дней")
            : plural(count, "неделю", "недели", "недель");
    return `за ${count} ${noun}`;
  }
  const { days, timeOfDay } = decodeAllDay(minutes);
  if (days === 0) return "в день срока, 00:00";
  return `за ${days} ${plural(days, "день", "дня", "дней")}, ${toTimeInput(timeOfDay)}`;
}

const METHOD_LABELS: Record<TIssueReminderMethod, string> = {
  popup: "Уведомление",
  email: "Эл. почта",
};

type Props = {
  value: TIssueReminder[];
  onChange: (next: TIssueReminder[]) => void;
  hasDate: boolean;
  // When true → task has a concrete `target_time`, so the event will be pushed
  // as a timed GCal event and reminders are a plain offset from the deadline.
  // When false → all-day event; reminders are "N days before at HH:MM".
  hasTime: boolean;
  disabled?: boolean;
  buttonClassName?: string;
};

const SELECT_CLASS = "h-7 rounded-sm border border-subtle-1 bg-surface-1 px-1 text-body-xs-regular text-primary";
const NUMBER_CLASS = "h-7 w-14 rounded-sm border border-subtle-1 bg-surface-1 px-2 text-body-xs-regular text-primary";

export const ReminderPopup: React.FC<Props> = ({
  value,
  onChange,
  hasDate,
  hasTime,
  disabled,
  buttonClassName = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  // Raw text of each row's number box. Kept separately so clearing the field
  // mid-edit doesn't immediately rewrite the stored offset to 0 (and bounce
  // the cursor). Falls back to the decoded value when absent.
  const [drafts, setDrafts] = useState<Record<number, string>>({});

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

  const triggerLabel = useMemo(() => {
    if (!hasDate) return "Сначала срок";
    if (value.length === 0) return "Без уведомлений";
    const closest = [...value].toSorted((a, b) => a.minutes - b.minutes)[0];
    if (!closest) return "Без уведомлений";
    const head = formatSummary(closest.minutes, hasTime);
    return value.length === 1 ? head : `${head} · ${value.length} шт.`;
  }, [hasDate, value, hasTime]);

  const updateRow = (index: number, patch: Partial<TIssueReminder>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    if (reachedCap) return;
    // New rows start on Google's own defaults: 30 minutes before a timed
    // event, the previous morning at 09:00 for an all-day one.
    const minutes = hasTime ? 30 : encodeAllDay(1, DEFAULT_ALL_DAY_TIME);
    onChange([...value, { method: "popup", minutes }]);
  };

  const removeRow = (index: number) => {
    setDrafts({});
    onChange(value.filter((_, i) => i !== index));
  };

  const renderRow = (row: TIssueReminder, index: number) => {
    const methodSelect = (
      <select
        value={row.method}
        onChange={(e) => updateRow(index, { method: e.target.value as TIssueReminderMethod })}
        className={SELECT_CLASS}
        aria-label="Способ уведомления"
      >
        <option value="popup">{METHOD_LABELS.popup}</option>
        <option value="email">{METHOD_LABELS.email}</option>
      </select>
    );

    const removeButton = (
      <button
        type="button"
        onClick={() => removeRow(index)}
        aria-label="Удалить уведомление"
        className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-tertiary hover:bg-surface-2 hover:text-danger-primary"
      >
        <X className="size-3.5" />
      </button>
    );

    if (hasTime) {
      const { count, unit } = decodeTimed(row.minutes);
      const draft = drafts[index] ?? String(count);
      return (
        <div key={index} className="flex flex-wrap items-center gap-1">
          {methodSelect}
          <input
            type="number"
            min={0}
            value={draft}
            onChange={(e) => {
              setDrafts((d) => ({ ...d, [index]: e.target.value }));
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) {
                updateRow(index, { minutes: clampMinutes(n * TIMED_UNIT_MINUTES[unit]) });
              }
            }}
            onBlur={() => setDrafts((d) => ({ ...d, [index]: "" as string }))}
            className={NUMBER_CLASS}
            aria-label="Количество"
          />
          <select
            value={unit}
            onChange={(e) => {
              const nextUnit = e.target.value as TimedUnit;
              updateRow(index, { minutes: clampMinutes(count * TIMED_UNIT_MINUTES[nextUnit]) });
            }}
            className={SELECT_CLASS}
            aria-label="Единица"
          >
            {(Object.keys(TIMED_UNIT_LABELS) as TimedUnit[]).map((u) => (
              <option key={u} value={u}>
                {TIMED_UNIT_LABELS[u]}
              </option>
            ))}
          </select>
          <span className="text-body-xs-regular text-secondary">до начала</span>
          {removeButton}
        </div>
      );
    }

    const { days, timeOfDay } = decodeAllDay(row.minutes);
    const draft = drafts[index] ?? String(days);
    return (
      <div key={index} className="flex flex-wrap items-center gap-1">
        {methodSelect}
        <input
          type="number"
          min={MIN_ALL_DAY_DAYS}
          value={draft}
          onChange={(e) => {
            setDrafts((d) => ({ ...d, [index]: e.target.value }));
            const n = parseInt(e.target.value, 10);
            if (!Number.isFinite(n)) return;
            updateRow(index, {
              minutes: encodeAllDay(Math.max(MIN_ALL_DAY_DAYS, n), timeOfDay),
            });
          }}
          onBlur={() => setDrafts((d) => ({ ...d, [index]: "" as string }))}
          className={NUMBER_CLASS}
          aria-label="Дней"
        />
        <span className="text-body-xs-regular text-secondary">{plural(days, "день", "дня", "дней")} до, в</span>
        <input
          type="time"
          value={toTimeInput(timeOfDay)}
          onChange={(e) => {
            const time = fromTimeInput(e.target.value);
            if (time === undefined) return;
            updateRow(index, {
              minutes: encodeAllDay(Math.max(MIN_ALL_DAY_DAYS, days), time),
            });
          }}
          className={cn(NUMBER_CLASS, "w-[92px]")}
          aria-label="Время"
        />
        {removeButton}
      </div>
    );
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
    <Tooltip tooltipContent="Сначала установите срок выполнения" position="top" disabled={hasDate}>
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
            // The popup renders into document.body via createPortal, outside
            // wrapperRef. Without this attribute useOutsideClickDetector treats
            // clicks inside it as "outside" and closes the popup before the
            // control's own handler runs.
            data-prevent-outside-click
            style={styles.popper}
            {...attributes.popper}
            className="shadow-md relative z-30 w-[420px] max-w-[calc(100vw-24px)] rounded-md border border-subtle-1 bg-surface-1 p-3"
          >
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Закрыть"
              className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-sm text-tertiary hover:bg-surface-2 hover:text-primary"
            >
              <X className="size-3.5" />
            </button>

            <div className="mb-2 pr-6 text-body-xs-medium text-secondary">Уведомления</div>

            {value.length === 0 ? (
              <div className="mb-2 text-body-xs-regular text-placeholder">
                Уведомлений нет — событие в календаре будет беззвучным.
              </div>
            ) : (
              <div className="mb-2 flex flex-col gap-1.5">{value.map(renderRow)}</div>
            )}

            <button
              type="button"
              onClick={addRow}
              disabled={reachedCap}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm px-1 py-1 text-body-xs-medium",
                reachedCap ? "cursor-not-allowed text-placeholder" : "text-accent-primary hover:bg-surface-2"
              )}
            >
              <Plus className="size-3" />
              Добавить уведомление
            </button>
            {reachedCap && (
              <div className="text-body-xxs-regular mt-1 text-tertiary">
                Google Calendar допускает не более {MAX_REMINDERS} уведомлений на событие.
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default ReminderPopup;

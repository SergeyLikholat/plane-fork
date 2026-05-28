/**
 * Combined date + time + duration picker. TickTick-style: a single trigger
 * opens a popup with two tabs.
 *
 *   • Tab "Дата"        — pick a target_date and (optionally) target_time.
 *                         No "all-day" toggle: a date without time is
 *                         implicitly all-day.
 *   • Tab "Длительность" — pick start_(date,time) AND target_(date,time).
 *
 * Forward duration semantics (TickTick): the chosen time on Tab "Дата"
 * anchors the TOP of the pill on the calendar; switching to "Длительность"
 * fills end = anchor + 1h.
 *
 * Local draft state is kept until "OK"; "Очистить" wipes all four fields.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { ru } from "date-fns/locale";
import { CalendarDays, Check, Clock, X } from "lucide-react";
import { Calendar } from "@plane/propel/calendar";
import { useOutsideClickDetector } from "@plane/hooks";
import { cn } from "@plane/utils";
import {
  TIME_OPTIONS,
  formatTimeShort,
  formatTriggerLabel,
  fromPayloadDate,
  toPayloadDate,
  type DateTimeFields,
} from "./time-utils";

type Tab = "date" | "duration";

export type CalendarOption = {
  /** Plane label id (the cal:* label uuid) */
  id: string;
  /** Display name without the cal: prefix */
  name: string;
  /** Hex color matching the GCal calendar's backgroundColor */
  color: string;
};

type Props = {
  value: DateTimeFields;
  onChange: (patch: DateTimeFields) => void;
  disabled?: boolean;
  placeholder?: string;
  buttonClassName?: string;
  /**
   * `compact` shrinks the trigger to match other property pills (kanban /
   * list / spreadsheet rows). Default = full-size for sidebar/peek.
   */
  compact?: boolean;
  /**
   * Optional calendar (cal:*-label) selector rendered below the date/duration
   * tabs. When provided, the popup shows a "Календарь" row with a colored
   * dot per option. Selecting one ensures only that cal:*-label is on the
   * issue (other label_ids are preserved).
   */
  calendars?: {
    options: CalendarOption[];
    selectedId: string | null;
    onChange: (id: string | null) => void;
  };
};

export function DateTimeDurationPopup(props: Props) {
  const {
    value,
    onChange,
    disabled,
    placeholder = "Дата",
    buttonClassName = "",
    compact = false,
    calendars,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("date");
  const [draft, setDraft] = useState<DateTimeFields>(value);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [referenceEl, setReferenceEl] = useState<HTMLButtonElement | null>(null);
  const [popperEl, setPopperEl] = useState<HTMLDivElement | null>(null);
  const { styles, attributes } = usePopper(referenceEl, popperEl, {
    placement: "bottom-start",
    modifiers: [
      { name: "flip", options: { fallbackPlacements: ["top-start", "top-end", "bottom-end"] } },
      { name: "preventOverflow", options: { padding: 12, tether: false, altAxis: true } },
    ],
  });

  // Mobile gating happens via CSS media queries (lg: prefix = ≥1024px),
  // NOT JS state. Previous matchMedia-based detection was unreliable:
  // useEffect ran after first render and "Request desktop site" mode
  // returned wrong width. CSS @media is synchronous and reliable.
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!isOpen) return;
    const v = valueRef.current;
    setDraft(v);
    setShowTimePicker(false);
    const isMultiDay = !!(v.start_date && v.target_date && v.start_date !== v.target_date);
    const hasDuration = !!(v.start_time && v.target_time && v.start_time !== v.target_time);
    setTab(isMultiDay || hasDuration ? "duration" : "date");
  }, [isOpen]);

  useOutsideClickDetector(wrapperRef, () => {
    if (isOpen) setIsOpen(false);
  });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const triggerLabel = formatTriggerLabel(value);

  const handleClear = () => {
    onChange({ target_date: null, target_time: null, start_date: null, start_time: null });
    setIsOpen(false);
  };
  const handleClearFromTrigger = (e: React.MouseEvent) => {
    // preventDefault is required because list-block wraps the row in
    // <a target="_blank">; without it the browser opens the issue in a new
    // tab even though we stopPropagation here.
    e.preventDefault();
    e.stopPropagation();
    handleClear();
  };

  const switchTab = (next: Tab) => {
    setShowTimePicker(false);
    setDraft((prev) => smartFillOnTabSwitch(prev, next));
    setTab(next);
  };

  const handleOk = () => {
    onChange(normalizeOnSubmit(draft, tab));
    setIsOpen(false);
  };

  // Tab Дата handlers
  const onPickDate = (d: Date | undefined) => {
    if (!d) return;
    setDraft((prev) => ({
      ...prev,
      target_date: toPayloadDate(d),
      // Tab Дата has no duration mode — keep start_date null
      start_date: null,
    }));
  };
  const onPickTime = (t: string) => {
    setDraft((prev) => ({
      ...prev,
      // If the user picks a time before committing a date, anchor to today.
      // Time-of-day without a date can't be saved as a Plane field, so the
      // edit silently drops; auto-filling today matches the most common
      // intent ("сделать сегодня в HH:MM") and preserves any date already
      // chosen on this draft.
      target_date: prev.target_date ?? toPayloadDate(new Date()),
      target_time: `${t}:00`,
      start_time: null,
      start_date: null,
    }));
    setShowTimePicker(false);
  };
  const onClearTime = () => {
    setDraft((prev) => ({ ...prev, target_time: null, start_time: null, start_date: null }));
    setShowTimePicker(false);
  };

  // Tab Длительность handlers
  const onChangeRangeDate = (which: "start" | "end", d: Date | undefined) => {
    if (!d) return;
    const ds = toPayloadDate(d);
    setDraft((prev) =>
      which === "start" ? { ...prev, start_date: ds } : { ...prev, target_date: ds }
    );
  };
  const onChangeRangeTime = (which: "start" | "end", t: string) => {
    setDraft((prev) =>
      which === "start"
        ? { ...prev, start_time: t ? `${t}:00` : null }
        : { ...prev, target_time: t ? `${t}:00` : null }
    );
  };
  const onToggleRangeAllDay = (allDay: boolean) => {
    if (allDay) {
      setDraft((prev) => ({ ...prev, start_time: null, target_time: null }));
    } else {
      setDraft((prev) => {
        const today = toPayloadDate(new Date());
        const sd = prev.start_date ?? prev.target_date ?? today;
        const td = prev.target_date ?? prev.start_date ?? today;
        const startTime = nextHourTimeStr();
        return {
          start_date: sd,
          target_date: td,
          start_time: startTime,
          target_time: addHourTimeStr(startTime),
        };
      });
    }
  };

  const rangeValid = useMemo(() => {
    if (tab !== "duration") return true;
    if (!draft.start_date || !draft.target_date) return false;
    const sd = fromPayloadDate(draft.start_date);
    const td = fromPayloadDate(draft.target_date);
    if (!sd || !td) return false;
    const startMs = sd.getTime() + (parseTimeMs(draft.start_time) ?? 0);
    const endMs = td.getTime() + (parseTimeMs(draft.target_time) ?? 0);
    return endMs > startMs;
  }, [tab, draft]);

  return (
    <div ref={wrapperRef} className={cn("inline-flex", { "opacity-50": disabled })}>
      <button
        ref={setReferenceEl}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "group flex min-w-0 max-w-full items-center gap-1.5 rounded-sm hover:bg-layer-transparent-hover",
          compact ? "h-5 gap-1 px-1.5 text-caption-sm-regular" : "h-7 px-1 text-body-xs-medium",
          { "text-placeholder": !triggerLabel, "text-secondary": !!triggerLabel },
          buttonClassName
        )}
      >
        <CalendarDays className={cn("flex-shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        <span className="truncate">{triggerLabel ?? placeholder}</span>
        {triggerLabel && !disabled && (
          <X
            className={cn(
              "flex-shrink-0 text-tertiary opacity-0 group-hover:opacity-100",
              compact ? "h-2.5 w-2.5" : "h-3 w-3"
            )}
            onClick={handleClearFromTrigger}
          />
        )}
      </button>

      {isOpen &&
        createPortal(
          // Both layouts render simultaneously; CSS @media decides which.
          <>
            {/* ── Mobile/tablet: bottom-sheet (visible at <lg = <1024px) ─ */}
            <div
              className="fixed inset-0 z-[60] lg:hidden"
              data-prevent-outside-click
            >
              <div
                className="absolute inset-0 bg-black/30"
                onClick={() => setIsOpen(false)}
              />
              <div className="absolute right-0 bottom-0 left-0 flex max-h-[85svh] flex-col overflow-hidden rounded-t-lg border-t border-strong bg-surface-1 text-secondary shadow-raised-200">
                <div className="flex flex-shrink-0 gap-1 border-b border-subtle-1 p-1">
                  <TabButton active={tab === "date"} onClick={() => switchTab("date")}>
                    Дата
                  </TabButton>
                  <TabButton active={tab === "duration"} onClick={() => switchTab("duration")}>
                    Длительность
                  </TabButton>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {tab === "date" ? (
                    <DateTab
                      draft={draft}
                      showTimePicker={showTimePicker}
                      onToggleTimePicker={() => setShowTimePicker((v) => !v)}
                      onPickDate={onPickDate}
                      onPickTime={onPickTime}
                      onClearTime={onClearTime}
                    />
                  ) : (
                    <DurationTab
                      draft={draft}
                      onChangeDate={onChangeRangeDate}
                      onChangeTime={onChangeRangeTime}
                      onAllDay={onToggleRangeAllDay}
                    />
                  )}
                  {calendars && calendars.options.length > 0 && (
                    <CalendarPicker
                      options={calendars.options}
                      selectedId={calendars.selectedId}
                      onChange={calendars.onChange}
                    />
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-subtle-1 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-sm px-4 py-2 text-body-sm-medium text-secondary hover:bg-layer-transparent-hover"
                  >
                    Очистить
                  </button>
                  <button
                    type="button"
                    onClick={handleOk}
                    disabled={!rangeValid}
                    className="rounded-sm bg-accent-primary px-4 py-2 text-body-sm-medium text-on-color disabled:opacity-50"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>

            {/* ── Desktop: popper-positioned floating popup (≥lg = ≥1024px) ─ */}
            <div
              ref={setPopperEl}
              data-prevent-outside-click
              style={styles.popper}
              {...attributes.popper}
              className="z-[60] hidden lg:flex w-[340px] max-h-[calc(100dvh-24px)] flex-col overflow-hidden rounded-md border border-strong bg-surface-1 text-secondary shadow-raised-200"
            >
              <div className="flex flex-shrink-0 gap-1 border-b border-subtle-1 p-1">
                <TabButton active={tab === "date"} onClick={() => switchTab("date")}>
                  Дата
                </TabButton>
                <TabButton active={tab === "duration"} onClick={() => switchTab("duration")}>
                  Длительность
                </TabButton>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {tab === "date" ? (
                  <DateTab
                    draft={draft}
                    showTimePicker={showTimePicker}
                    onToggleTimePicker={() => setShowTimePicker((v) => !v)}
                    onPickDate={onPickDate}
                    onPickTime={onPickTime}
                    onClearTime={onClearTime}
                  />
                ) : (
                  <DurationTab
                    draft={draft}
                    onChangeDate={onChangeRangeDate}
                    onChangeTime={onChangeRangeTime}
                    onAllDay={onToggleRangeAllDay}
                  />
                )}
                {calendars && calendars.options.length > 0 && (
                  <CalendarPicker
                    options={calendars.options}
                    selectedId={calendars.selectedId}
                    onChange={calendars.onChange}
                  />
                )}
              </div>
              <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-subtle-1 p-2">
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-sm px-3 py-1 text-body-xs-medium text-secondary hover:bg-layer-transparent-hover"
                >
                  Очистить
                </button>
                <button
                  type="button"
                  onClick={handleOk}
                  disabled={!rangeValid}
                  className="rounded-sm bg-accent-primary px-3 py-1 text-body-xs-medium text-on-color disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "flex-1 rounded-sm px-3 py-1.5 text-body-xs-medium transition-colors",
        props.active
          ? "bg-surface-2 text-primary"
          : "text-tertiary hover:bg-layer-transparent-hover"
      )}
    >
      {props.children}
    </button>
  );
}

// ── Tab: Дата ───────────────────────────────────────────────────────────────
function DateTab(props: {
  draft: DateTimeFields;
  showTimePicker: boolean;
  onToggleTimePicker: () => void;
  onPickDate: (d: Date | undefined) => void;
  onPickTime: (t: string) => void;
  onClearTime: () => void;
}) {
  const { draft, showTimePicker, onToggleTimePicker, onPickDate, onPickTime, onClearTime } = props;
  const selected = fromPayloadDate(draft.target_date);
  const tt = formatTimeShort(draft.target_time);

  return (
    <div className="px-2 pb-2 pt-1">
      <Calendar
        className="rounded-md p-1"
        captionLayout="dropdown"
        selected={selected ?? undefined}
        defaultMonth={selected ?? new Date()}
        onSelect={onPickDate}
        showOutsideDays
        mode="single"
        fixedWeeks
        weekStartsOn={1}
        locale={ru}
      />

      <div className="mt-2 flex items-center justify-between rounded border border-subtle-1 px-2 py-1.5 text-body-xs-medium">
        <button
          type="button"
          onClick={onToggleTimePicker}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <Clock className="h-3.5 w-3.5 text-tertiary" />
          <span className={tt ? "text-primary" : "text-tertiary"}>
            {tt ? `Время · ${tt}` : "Время"}
          </span>
        </button>
        {tt && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClearTime();
            }}
            className="text-tertiary hover:text-primary"
            title="Очистить время"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {showTimePicker && (
        <div className="mt-1 max-h-44 overflow-y-auto rounded border border-subtle-1">
          {TIME_OPTIONS.map((opt) => {
            const isCurrent = opt === tt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onPickTime(opt)}
                className={cn(
                  "block w-full px-3 py-1 text-left text-body-xs-medium hover:bg-layer-transparent-hover",
                  isCurrent && "bg-accent-primary/10 text-accent-primary"
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Длительность ───────────────────────────────────────────────────────
function DurationTab(props: {
  draft: DateTimeFields;
  onChangeDate: (which: "start" | "end", d: Date | undefined) => void;
  onChangeTime: (which: "start" | "end", t: string) => void;
  onAllDay: (allDay: boolean) => void;
}) {
  const { draft, onChangeDate, onChangeTime, onAllDay } = props;
  const isAllDay = !draft.start_time && !draft.target_time;

  return (
    <div className="space-y-3 px-3 pb-3 pt-3 text-body-xs-medium">
      <RangeRow
        label="Начать"
        date={draft.start_date}
        time={draft.start_time}
        allDay={isAllDay}
        onChangeDate={(d) => onChangeDate("start", d)}
        onChangeTime={(t) => onChangeTime("start", t)}
      />
      <RangeRow
        label="Закончить"
        date={draft.target_date}
        time={draft.target_time}
        allDay={isAllDay}
        onChangeDate={(d) => onChangeDate("end", d)}
        onChangeTime={(t) => onChangeTime("end", t)}
      />
      <div className="flex items-center justify-between pt-1">
        <span className="text-secondary">Весь день</span>
        <Toggle on={isAllDay} onClick={() => onAllDay(!isAllDay)} />
      </div>
    </div>
  );
}

function RangeRow(props: {
  label: string;
  date: string | null;
  time: string | null;
  allDay: boolean;
  onChangeDate: (d: Date | undefined) => void;
  onChangeTime: (t: string) => void;
}) {
  const timeShort = formatTimeShort(props.time);
  return (
    <div className="grid grid-cols-[64px_1fr_92px] items-center gap-2">
      <span className="text-tertiary">{props.label}</span>
      <DatePopButton value={props.date} onChange={props.onChangeDate} />
      <select
        value={timeShort}
        disabled={props.allDay}
        onChange={(e) => props.onChangeTime(e.target.value)}
        className="h-7 w-full rounded-sm border border-subtle-1 bg-surface-1 px-1 text-body-xs-medium disabled:opacity-50"
      >
        <option value="">—</option>
        {TIME_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Custom date input that opens the same Plane Calendar as the Date tab —
 * matches font/size/style. Replaces native <input type="date">.
 */
function DatePopButton(props: { value: string | null; onChange: (d: Date | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [refEl, setRefEl] = useState<HTMLButtonElement | null>(null);
  const [popEl, setPopEl] = useState<HTMLDivElement | null>(null);
  const { styles, attributes } = usePopper(refEl, popEl, {
    placement: "bottom-start",
    modifiers: [{ name: "preventOverflow", options: { padding: 12 } }],
  });

  useOutsideClickDetector(wrapRef, () => setOpen(false));

  const selected = fromPayloadDate(props.value);
  const label = selected
    ? selected.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  return (
    <div ref={wrapRef} className="relative w-full">
      <button
        ref={setRefEl}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 w-full truncate rounded-sm border border-subtle-1 bg-surface-1 px-2 text-left text-body-xs-medium hover:bg-layer-transparent-hover"
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={setPopEl}
            data-prevent-outside-click
            style={styles.popper}
            {...attributes.popper}
            className="z-[70] rounded-md border border-strong bg-surface-1 p-1 shadow-raised-200"
          >
            <Calendar
              className="rounded-md"
              captionLayout="dropdown"
              selected={selected ?? undefined}
              defaultMonth={selected ?? new Date()}
              onSelect={(d) => {
                props.onChange(d ?? undefined);
                setOpen(false);
              }}
              showOutsideDays
              mode="single"
              fixedWeeks
              weekStartsOn={1}
              locale={ru}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

// ── Calendar picker ─────────────────────────────────────────────────────────
function CalendarPicker(props: {
  options: CalendarOption[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  const { options, selectedId, onChange } = props;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [refEl, setRefEl] = useState<HTMLButtonElement | null>(null);
  const [popEl, setPopEl] = useState<HTMLDivElement | null>(null);
  const { styles, attributes } = usePopper(refEl, popEl, {
    placement: "bottom-start",
    modifiers: [{ name: "preventOverflow", options: { padding: 12 } }],
  });
  useOutsideClickDetector(wrapRef, () => setOpen(false));

  const selected = options.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="border-t border-subtle-1 px-3 py-2 text-body-xs-medium">
      <div className="grid grid-cols-[80px_1fr] items-center gap-2">
        <span className="text-tertiary">Календарь</span>
        <div ref={wrapRef} className="relative">
          <button
            ref={setRefEl}
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-7 w-full items-center gap-2 rounded-sm border border-subtle-1 bg-surface-1 px-2 text-left hover:bg-layer-transparent-hover"
          >
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: selected?.color ?? "#9ca3af" }}
            />
            <span className={cn("truncate", selected ? "text-primary" : "text-tertiary")}>
              {selected ? selected.name : "По умолчанию"}
            </span>
          </button>
          {open &&
            createPortal(
              <div
                ref={setPopEl}
                data-prevent-outside-click
                style={styles.popper}
                {...attributes.popper}
                className="z-[70] max-h-60 min-w-[180px] overflow-y-auto rounded-md border border-strong bg-surface-1 p-1 shadow-raised-200"
              >
                <CalendarOptionRow
                  active={selectedId === null}
                  dotColor={null}
                  label="По умолчанию"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                />
                {options.map((opt) => (
                  <CalendarOptionRow
                    key={opt.id}
                    active={opt.id === selectedId}
                    dotColor={opt.color}
                    label={opt.name}
                    onClick={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>,
              document.body
            )}
        </div>
      </div>
    </div>
  );
}

/**
 * Single calendar option row. Highlight follows the cursor (hover wins over
 * selected state) so the user always sees what's about to be picked. The
 * currently selected option is marked with a check icon, not a sticky
 * background.
 */
function CalendarOptionRow(props: {
  active: boolean;
  dotColor: string | null;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-body-xs-medium",
        "text-secondary hover:bg-accent-primary/15 hover:text-primary"
      )}
    >
      <span
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: props.dotColor ?? "#9ca3af" }}
      />
      <span className={cn("flex-1 truncate", props.active && "font-medium text-primary")}>
        {props.label}
      </span>
      {props.active && <Check className="h-3 w-3 flex-shrink-0 text-accent-primary" />}
    </button>
  );
}

function Toggle(props: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "relative h-4 w-7 rounded-full transition-colors",
        props.on ? "bg-accent-primary" : "bg-layer-3"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all",
          props.on ? "left-3.5" : "left-0.5"
        )}
      />
    </button>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function parseTimeMs(s: string | null | undefined): number | null {
  if (!s) return null;
  const parts = s.split(":");
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return ((hh * 60 + mm) * 60 + (Number(parts[2]) || 0)) * 1000;
}

function fmtTimeStr(totalMin: number): string {
  const t = Math.max(0, Math.min(23 * 60 + 59, totalMin));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function nextHourTimeStr(now: Date = new Date()): string {
  const h = now.getMinutes() === 0 ? now.getHours() : now.getHours() + 1;
  return fmtTimeStr(Math.min(23, h) * 60);
}

function addHourTimeStr(time: string): string {
  const ms = parseTimeMs(time) ?? 0;
  const totalMin = Math.floor(ms / 60000) + 60;
  return fmtTimeStr(totalMin); // capped at 23:59 inside fmtTimeStr
}

/**
 * Smart-fill values when user toggles between tabs (forward semantics).
 */
function smartFillOnTabSwitch(prev: DateTimeFields, next: Tab): DateTimeFields {
  if (next === "duration") {
    const today = toPayloadDate(new Date());
    // No date set at all → today, next-hour to next-hour+1
    if (!prev.target_date) {
      const start = nextHourTimeStr();
      return { start_date: today, target_date: today, start_time: start, target_time: addHourTimeStr(start) };
    }
    // Time set on Date tab → use it as anchor (forward: end = start + 1h)
    if (prev.target_time) {
      const start = prev.target_time;
      return {
        target_date: prev.target_date,
        start_date: prev.target_date,
        start_time: start,
        target_time: addHourTimeStr(start),
      };
    }
    // No time → start = next-hour from now, end = +1h
    const start = nextHourTimeStr();
    return {
      target_date: prev.target_date,
      start_date: prev.target_date,
      start_time: start,
      target_time: addHourTimeStr(start),
    };
  }
  // Going to "Дата" — collapse to deadline-only. Keep target_date and the
  // start_time as the new target_time anchor (forward semantics).
  return {
    target_date: prev.target_date ?? prev.start_date,
    target_time: prev.start_time ?? prev.target_time ?? null,
    start_date: null,
    start_time: null,
  };
}

function normalizeOnSubmit(draft: DateTimeFields, tab: Tab): DateTimeFields {
  if (tab === "date") {
    if (!draft.target_date) {
      return { target_date: null, target_time: null, start_date: null, start_time: null };
    }
    return {
      target_date: draft.target_date,
      target_time: draft.target_time,
      start_date: null,
      start_time: null,
    };
  }
  return {
    target_date: draft.target_date,
    target_time: draft.target_time,
    start_date: draft.start_date,
    start_time: draft.start_time,
  };
}

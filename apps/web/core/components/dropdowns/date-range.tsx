/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { observer } from "mobx-react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Combobox } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
// ui
import type { DateRange, Matcher } from "@plane/propel/calendar";
import { Calendar } from "@plane/propel/calendar";
import { CloseIcon, DueDatePropertyIcon } from "@plane/propel/icons";
import { ComboDropDown } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
// helpers
// hooks
import { useUserProfile } from "@/hooks/store/user";
import { useDropdown } from "@/hooks/use-dropdown";
// components
import { DropdownButton } from "./buttons";
import { MergedDateDisplay } from "./merged-date";
// types
import type { TButtonVariants } from "./types";

type Props = {
  applyButtonText?: string;
  bothRequired?: boolean;
  buttonClassName?: string;
  buttonContainerClassName?: string;
  buttonFromDateClassName?: string;
  buttonToDateClassName?: string;
  buttonVariant: TButtonVariants;
  cancelButtonText?: string;
  className?: string;
  clearIconClassName?: string;
  disabled?: boolean;
  hideIcon?: {
    from?: boolean;
    to?: boolean;
  };
  isClearable?: boolean;
  mergeDates?: boolean;
  minDate?: Date;
  maxDate?: Date;
  onSelect?: (range: DateRange | undefined) => void;
  placeholder?: {
    from?: string;
    to?: string;
  };
  placement?: Placement;
  required?: boolean;
  showTooltip?: boolean;
  tabIndex?: number;
  value: {
    from: Date | undefined;
    to: Date | undefined;
  };
  renderByDefault?: boolean;
  renderPlaceholder?: boolean;
  customTooltipContent?: React.ReactNode;
  customTooltipHeading?: string;
  defaultOpen?: boolean;
  renderInPortal?: boolean;
};

const MS_PER_DAY = 86_400_000;

/** Local midnight — all range maths compares whole days, never clock time. */
const atMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => {
  const next = atMidnight(d);
  next.setDate(next.getDate() + n);
  return next;
};
// Rounded because a DST boundary makes the raw difference 23 or 25 hours.
const diffInDays = (a: Date, b: Date) => Math.round((atMidnight(a).getTime() - atMidnight(b).getTime()) / MS_PER_DAY);
const isSameDayLocal = (a: Date, b: Date) => atMidnight(a).getTime() === atMidnight(b).getTime();

/** Stable local-date key for hit-testing day cells during a drag. */
const toDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromDayKey = (key: string) => {
  const [y, m, day] = key.split("-").map(Number);
  return y && m && day ? new Date(y, m - 1, day) : undefined;
};

export const DateRangeDropdown = observer(function DateRangeDropdown(props: Props) {
  const { t } = useTranslation();
  const {
    buttonClassName,
    buttonContainerClassName,
    buttonFromDateClassName,
    buttonToDateClassName,
    buttonVariant,
    className,
    clearIconClassName = "",
    disabled = false,
    hideIcon = {
      from: true,
      to: true,
    },
    isClearable = false,
    mergeDates,
    minDate,
    maxDate,
    onSelect,
    placeholder = {
      from: t("project_cycles.add_date"),
      to: t("project_cycles.add_date"),
    },
    placement,
    showTooltip = false,
    tabIndex,
    value,
    renderByDefault = true,
    renderPlaceholder = true,
    customTooltipContent,
    customTooltipHeading,
    defaultOpen = false,
    renderInPortal = false,
  } = props;
  // states
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [dateRange, setDateRange] = useState<DateRange>(value);
  // hooks
  const { data } = useUserProfile();
  const startOfWeek = data?.start_of_the_week;
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  // popper-js refs
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  // popper-js init
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
    ],
  });

  const onOpen = () => {
    if (referenceElement) referenceElement.focus();
  };

  const { handleKeyDown, handleOnClick } = useDropdown({
    dropdownRef,
    isOpen,
    onOpen,
    setIsOpen,
  });

  const disabledDays: Matcher[] = [];
  if (minDate) disabledDays.push({ before: minDate });
  if (maxDate) disabledDays.push({ after: maxDate });

  const clearDates = () => {
    const clearedRange = { from: undefined, to: undefined };
    setDateRange(clearedRange);
    onSelect?.(clearedRange);
  };

  const hasDisplayedDates = dateRange.from || dateRange.to;

  const isDayDisabled = (day: Date) => (!!minDate && day < minDate) || (!!maxDate && day > maxDate);

  // Latest range, readable from window-level drag listeners whose closures
  // would otherwise capture a stale value.
  const dateRangeRef = useRef<DateRange>(dateRange);
  dateRangeRef.current = dateRange;

  /**
   * Active drag, if any.
   *   from / to -> one edge follows the pointer, the other stays put
   *   move      -> the whole range slides, keeping its length
   * `origin` is the range as it was when the drag started, `anchor` the day
   * the pointer went down on, `moved` whether it ever left that day (used to
   * tell a drag apart from a plain click).
   */
  const dragRef = useRef<{
    kind: "from" | "to" | "move";
    origin: DateRange;
    anchor: Date;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  /**
   * Click semantics, replacing react-day-picker's range algebra.
   *
   * RDP treats a click on a finished range as "move the nearest edge", with no
   * way to say "forget this range, start again from here" — so the start date
   * could never be moved later, only cleared and redone.
   *
   *   - no range yet, or the range is complete -> start a new range
   *   - a start exists without an end          -> set the end, swapping if it
   *                                               lands earlier than the start
   */
  const applyDayClick = (day: Date) => {
    if (disabled || isDayDisabled(day)) return;
    // A drag ends with pointerup, which the browser follows with a click on the
    // day under the cursor. Without this guard that click would immediately
    // restart the range the user just finished dragging.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const { from, to } = dateRange;
    const next: DateRange =
      !from || to ? { from: day, to: undefined } : day < from ? { from: day, to: from } : { from, to: day };
    setDateRange(next);
    onSelect?.(next);
  };

  /** Grab an edge (or the whole range) — only meaningful once both ends exist. */
  const handleDayPointerDown = (day: Date) => {
    if (disabled || isDayDisabled(day)) return;
    const { from, to } = dateRange;
    if (!from || !to) return;
    const target = atMidnight(day);
    let kind: "from" | "to" | "move" | null = null;
    if (isSameDayLocal(target, from)) kind = "from";
    else if (isSameDayLocal(target, to)) kind = "to";
    else if (target > atMidnight(from) && target < atMidnight(to)) kind = "move";
    if (!kind) return; // outside the range — let it stay a normal click
    dragRef.current = { kind, origin: { from, to }, anchor: target, moved: false };
    setIsDragging(true);
  };

  /** Pointer moved over `day` mid-drag. */
  const handleDragOver = (day: Date) => {
    const drag = dragRef.current;
    if (!drag || isDayDisabled(day)) return;
    const target = atMidnight(day);
    if (target.getTime() !== drag.anchor.getTime()) drag.moved = true;

    if (drag.kind === "move") {
      const offset = diffInDays(target, drag.anchor);
      const from = addDays(drag.origin.from as Date, offset);
      const to = addDays(drag.origin.to as Date, offset);
      // Slide as a whole or not at all — clamping one end would silently
      // change the range length.
      if (isDayDisabled(from) || isDayDisabled(to)) return;
      setDateRange({ from, to });
      return;
    }

    if (drag.kind === "from") {
      const fixed = atMidnight(drag.origin.to as Date);
      if (target > fixed) {
        // Dragged past the other end: the edge in hand becomes the new end.
        drag.kind = "to";
        drag.origin = { from: fixed, to: target };
        setDateRange({ from: fixed, to: target });
      } else {
        setDateRange({ from: target, to: fixed });
      }
      return;
    }

    const fixed = atMidnight(drag.origin.from as Date);
    if (target < fixed) {
      drag.kind = "from";
      drag.origin = { from: target, to: fixed };
      setDateRange({ from: target, to: fixed });
    } else {
      setDateRange({ from: fixed, to: target });
    }
  };

  // Drag tracking lives on window: the pointer regularly leaves the day it
  // started on, and touch pointers never fire enter/leave on other elements at
  // all. Hit-testing with elementFromPoint gives one code path for mouse and
  // touch alike.
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const key = el?.closest<HTMLElement>("[data-day-key]")?.dataset.dayKey;
      const day = key ? fromDayKey(key) : undefined;
      if (day) handleDragOver(day);
    };
    const onEnd = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      setIsDragging(false);
      if (!drag?.moved) return;
      // Swallow the click the browser fires right after pointerup, then clear
      // the flag on the next macrotask so a genuine click is never lost when
      // the drag happens to end outside a day cell.
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      onSelect?.(dateRangeRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  // react-day-picker uses the values in `components` as component *types*, so a
  // freshly-created function on every render would unmount and remount all 42
  // day cells — losing focus and thrashing the DOM mid-drag. Keep one stable
  // identity and reach current handlers through a ref, which stays correct
  // because RDP re-renders the cells whenever `selected` changes.
  const dayButtonDeps = useRef({ handleDayPointerDown, disabled, isDragging });
  dayButtonDeps.current = { handleDayPointerDown, disabled, isDragging };

  const DragDayButton = useMemo(
    () =>
      function DayButtonWithDrag({
        day,
        modifiers,
        ...buttonProps
      }: {
        day: { date: Date };
        modifiers: Record<string, boolean>;
      } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
        const buttonRef = useRef<HTMLButtonElement>(null);
        // Mirrors the stock DayButton so keyboard navigation still moves focus.
        useEffect(() => {
          if (modifiers.focused) buttonRef.current?.focus();
        }, [modifiers.focused]);
        const deps = dayButtonDeps.current;
        const isEdge = !!modifiers.range_start || !!modifiers.range_end;
        const isInside = !!modifiers.range_middle;
        return (
          <button
            {...buttonProps}
            ref={buttonRef}
            data-day-key={toDayKey(day.date)}
            onPointerDown={(e) => {
              buttonProps.onPointerDown?.(e);
              deps.handleDayPointerDown(day.date);
            }}
            className={cn(buttonProps.className, {
              "cursor-ew-resize": !deps.disabled && isEdge,
              "cursor-grab": !deps.disabled && isInside && !deps.isDragging,
              "cursor-grabbing": deps.isDragging,
            })}
          />
        );
      },
    []
  );

  useEffect(() => {
    // Never overwrite a half-finished pick. Consumers clear their stored value
    // while the range is incomplete, which used to feed an empty `value` back
    // in and wipe the start date the user had just clicked. Re-sync only while
    // the dropdown is closed.
    if (isOpen) return;
    setDateRange(value);
  }, [value, isOpen]);

  const comboButton = (
    <button
      ref={setReferenceElement}
      type="button"
      className={cn(
        "clickable block h-full max-w-full outline-none",
        {
          "cursor-not-allowed text-secondary": disabled,
          "cursor-pointer": !disabled,
        },
        buttonContainerClassName
      )}
      onClick={handleOnClick}
      disabled={disabled}
    >
      <DropdownButton
        className={buttonClassName}
        isActive={isOpen}
        tooltipHeading={customTooltipHeading ?? t("project_cycles.date_range")}
        tooltipContent={
          <>
            {customTooltipContent ?? (
              <>
                {dateRange.from ? renderFormattedDate(dateRange.from) : ""}
                {dateRange.from && dateRange.to ? " - " : ""}
                {dateRange.to ? renderFormattedDate(dateRange.to) : ""}
              </>
            )}
          </>
        }
        showTooltip={showTooltip}
        variant={buttonVariant}
        renderToolTipByDefault={renderByDefault}
      >
        {mergeDates ? (
          // Merged date display
          <div className="flex w-full items-center gap-1.5">
            {!hideIcon.from && <CalendarDays className="h-3 w-3 flex-shrink-0" />}
            {dateRange.from || dateRange.to ? (
              <MergedDateDisplay
                startDate={dateRange.from}
                endDate={dateRange.to}
                className="flex-grow truncate text-11"
              />
            ) : (
              renderPlaceholder && (
                <>
                  <span className="text-placeholder">{placeholder.from}</span>
                  {placeholder.from && placeholder.to && (
                    <ArrowRight className="h-3 w-3 flex-shrink-0 text-placeholder" />
                  )}
                  <span className="text-placeholder">{placeholder.to}</span>
                </>
              )
            )}
            {isClearable && !disabled && hasDisplayedDates && (
              <CloseIcon
                className={cn("h-2.5 w-2.5 flex-shrink-0 cursor-pointer", clearIconClassName)}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  clearDates();
                }}
              />
            )}
          </div>
        ) : (
          // Original separate date display
          <>
            <span
              className={cn(
                "flex h-full flex-grow items-center justify-center gap-1 rounded-xs",
                buttonFromDateClassName
              )}
            >
              {!hideIcon.from && <CalendarDays className="h-3 w-3 flex-shrink-0" />}
              {dateRange.from ? renderFormattedDate(dateRange.from) : renderPlaceholder ? placeholder.from : ""}
            </span>
            <ArrowRight className="h-3 w-3 flex-shrink-0" />
            <span
              className={cn(
                "flex h-full flex-grow items-center justify-center gap-1 rounded-xs",
                buttonToDateClassName
              )}
            >
              {!hideIcon.to && <DueDatePropertyIcon className="h-3 w-3 flex-shrink-0" />}
              {dateRange.to ? renderFormattedDate(dateRange.to) : renderPlaceholder ? placeholder.to : ""}
            </span>
            {isClearable && !disabled && hasDisplayedDates && (
              <CloseIcon
                className={cn("ml-1 h-2.5 w-2.5 flex-shrink-0 cursor-pointer", clearIconClassName)}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  clearDates();
                }}
              />
            )}
          </>
        )}
      </DropdownButton>
    </button>
  );

  const comboOptions = (
    <Combobox.Options data-prevent-outside-click static>
      <div
        className={cn("z-30 my-1 overflow-hidden rounded-md border-[0.5px] border-subtle-1 bg-surface-1", {
          // Kill text selection and touch scrolling for the duration of a drag.
          "[touch-action:none] select-none": isDragging,
        })}
        ref={setPopperElement}
        style={styles.popper}
        {...attributes.popper}
      >
        <Calendar
          className="rounded-md border border-subtle p-3 text-12"
          captionLayout="dropdown"
          selected={dateRange}
          // `onSelect` must stay wired: react-day-picker only treats `selected`
          // as controlled while it is present (see useRange — without it RDP
          // keeps its own internal range and our state is ignored). We take the
          // clicked day from the second argument and apply our own rules,
          // discarding the range RDP computed with addToRange.
          onSelect={(_range, triggerDate) => {
            if (triggerDate) applyDayClick(triggerDate);
          }}
          mode="range"
          disabled={disabledDays}
          showOutsideDays
          fixedWeeks
          weekStartsOn={startOfWeek}
          initialFocus
          components={{ DayButton: DragDayButton }}
        />
      </div>
    </Combobox.Options>
  );

  const Options = renderInPortal ? createPortal(comboOptions, document.body) : comboOptions;

  return (
    // ComboDropDown renders a headless combobox and owns the ARIA roles for
    // its button/options internally; the wrapper only forwards keyboard
    // events to it. Upstream Plane ships the same pattern in every dropdown.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <ComboDropDown
      as="div"
      ref={dropdownRef}
      tabIndex={tabIndex}
      className={cn("h-full", className)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (!isOpen) handleKeyDown(e);
        } else handleKeyDown(e);
      }}
      button={comboButton}
      disabled={disabled}
      renderByDefault={renderByDefault}
    >
      {isOpen && Options}
    </ComboDropDown>
  );
});

/**
 * Week board — editor of one day's load limit, opened from the «/ 13» in the
 * day column header. A compact stepper with quick presets and two ways to
 * save: this date only (exception) or every such weekday (template).
 *
 * Base UI popover: portalled (the column would clip it), closes on Escape
 * and outside click, returns focus to the trigger.
 */
import { useId, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import { cn } from "@plane/utils";
import { DAY_LIMIT_PRESETS, MAX_DAY_LIMIT, MIN_DAY_LIMIT, clampDayLimit, weekdayPluralName } from "./day-limit";

export type TDayLimitActions = {
  isEditable: boolean;
  setDayLimit: (date: Date, limit: number) => Promise<boolean>;
  setWeekdayLimit: (date: Date, limit: number) => Promise<boolean>;
  clearDayLimit: (date: Date) => Promise<boolean>;
};

const STEP_BUTTON =
  "grid size-7 place-items-center rounded-md border border-subtle-1 text-secondary transition-colors outline-none hover:bg-layer-1-hover hover:text-primary active:bg-layer-1-active focus-visible:border-accent-strong disabled:cursor-default disabled:opacity-40";

function LimitStepper(props: { value: number; onChange: (value: number) => void; onSubmit: () => void }) {
  const { value, onChange, onSubmit } = props;
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(clampDayLimit(value + (event.key === "ArrowUp" ? 1 : -1)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Меньше"
        disabled={value <= MIN_DAY_LIMIT}
        onClick={() => onChange(clampDayLimit(value - 1))}
        className={STEP_BUTTON}
      >
        <Minus className="size-3.5" strokeWidth={2} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Лимит, от ${MIN_DAY_LIMIT} до ${MAX_DAY_LIMIT}`}
        value={value}
        onChange={(event) => onChange(clampDayLimit(Number(event.target.value.replace(/\D/g, "") || 0)))}
        onKeyDown={onKeyDown}
        className="h-7 w-11 rounded-md border border-subtle-1 bg-surface-1 text-center text-14 font-semibold text-primary tabular-nums outline-none focus:border-accent-strong"
      />
      <button
        type="button"
        aria-label="Больше"
        disabled={value >= MAX_DAY_LIMIT}
        onClick={() => onChange(clampDayLimit(value + 1))}
        className={STEP_BUTTON}
      >
        <Plus className="size-3.5" strokeWidth={2} />
      </button>
      <span className="ml-1 text-11 text-tertiary">{value === 0 ? "выходной" : "очков"}</span>
    </div>
  );
}

function LimitPresets(props: { value: number; onPick: (value: number) => void }) {
  const { value, onPick } = props;
  return (
    <div className="flex gap-1" role="group" aria-label="Быстрый выбор">
      {DAY_LIMIT_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          aria-pressed={value === preset}
          onClick={() => onPick(preset)}
          className={cn(
            "h-6 min-w-7 flex-1 rounded-sm text-11 tabular-nums transition-colors outline-none focus-visible:ring-1 focus-visible:ring-accent-strong",
            value === preset
              ? "bg-accent-subtle font-semibold text-accent-primary"
              : "bg-layer-1 text-secondary hover:bg-layer-1-hover hover:text-primary"
          )}
        >
          {preset}
        </button>
      ))}
    </div>
  );
}

type Props = {
  date: Date;
  limit: number;
  hasOverride: boolean;
  actions: TDayLimitActions;
  triggerLabel: string;
  triggerClassName?: string;
  children: ReactNode;
};

export function DayLimitPopover(props: Props) {
  const { date, limit, hasOverride, actions, triggerLabel, triggerClassName, children } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(limit);
  const titleId = useId();
  const dayLabel = date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });

  const onOpenChange = (open: boolean) => {
    if (open) setDraft(limit);
    setIsOpen(open);
  };
  const saveDay = () => {
    setIsOpen(false);
    void actions.setDayLimit(date, draft);
  };
  const saveWeekday = () => {
    setIsOpen(false);
    void actions.setWeekdayLimit(date, draft);
  };
  const clearOverride = () => {
    setIsOpen(false);
    void actions.clearDayLimit(date);
  };

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <Popover.Button
        disabled={!actions.isEditable}
        aria-label={triggerLabel}
        title={triggerLabel}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-sm px-0.5 transition-colors outline-none hover:bg-layer-3 hover:text-primary focus-visible:ring-1 focus-visible:ring-accent-strong disabled:cursor-default disabled:hover:bg-transparent",
          isOpen && "bg-layer-3 text-primary",
          triggerClassName
        )}
      >
        {children}
      </Popover.Button>
      <Popover.Panel
        side="bottom"
        align="end"
        sideOffset={6}
        positionerClassName="z-30"
        aria-labelledby={titleId}
        className="w-60 space-y-2.5 rounded-lg border border-subtle-1 bg-surface-1 p-3 shadow-[0_12px_32px_-8px_rgb(41_47_61/0.28)] outline-none"
      >
        <p id={titleId} className="text-13 font-semibold text-primary">
          Лимит на {dayLabel}
        </p>
        <LimitStepper value={draft} onChange={setDraft} onSubmit={saveDay} />
        <LimitPresets value={draft} onPick={setDraft} />
        <div className="flex flex-col gap-1.5 border-t border-subtle pt-2.5">
          <button
            type="button"
            onClick={saveDay}
            className="h-7 rounded-md bg-accent-primary px-2 text-12 font-medium text-on-color transition-colors outline-none hover:bg-accent-primary-hover focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-1 active:bg-accent-primary-active"
          >
            Только этот день
          </button>
          <button
            type="button"
            onClick={saveWeekday}
            className="h-7 rounded-md border border-subtle-1 px-2 text-12 font-medium text-secondary transition-colors outline-none hover:bg-layer-1-hover hover:text-primary focus-visible:border-accent-strong active:bg-layer-1-active"
          >
            Все {weekdayPluralName(date)}
          </button>
          {hasOverride && (
            <button
              type="button"
              onClick={clearOverride}
              className="self-start rounded-sm text-11 text-link-primary underline-offset-2 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-accent-strong"
            >
              Сбросить исключение
            </button>
          )}
        </div>
      </Popover.Panel>
    </Popover>
  );
}

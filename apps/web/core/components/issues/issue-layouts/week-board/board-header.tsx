/**
 * Week board — top bar: week range, navigation, week total against the sum
 * of the shown days' limits, and the legend.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@plane/utils";
import { addDays } from "./use-board-model";
import { WeightChip } from "./weight-chip";
import { HEAVY_THRESHOLD } from "./weights";

const NAV_BUTTON =
  "inline-flex h-7 items-center justify-center rounded-md border border-subtle bg-surface-1 text-secondary transition-colors hover:bg-layer-1-hover hover:text-primary active:bg-layer-1-active outline-none focus-visible:border-accent-strong";

function UnconfirmedToggle(props: { count: number; isOn: boolean; onToggle: () => void }) {
  const { count, isOn, onToggle } = props;
  if (count === 0) {
    return <span className="text-11 text-success-secondary">✓ все веса подтверждены</span>;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isOn}
      title="Вес поставлен автоматически или угадан по метке. Нажмите, чтобы подсветить эти задачи на доске"
      className={cn(
        "rounded-sm border border-dashed px-1.5 py-0.5 text-11 tabular-nums transition-colors outline-none focus-visible:border-accent-strong",
        isOn
          ? "border-accent-strong bg-accent-subtle font-medium text-accent-primary"
          : "border-strong text-secondary hover:bg-layer-1-hover hover:text-primary"
      )}
    >
      не подтверждено: {count}
    </button>
  );
}

const LegendDot = () => (
  <span aria-hidden className="text-placeholder">
    ·
  </span>
);

/** Muted one-line key that wraps item by item on narrow screens. */
function Legend() {
  return (
    <p className="ml-auto flex max-w-full flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5 text-11 leading-4 text-tertiary">
      <span>Лимит дня — нажмите на число в шапке дня</span>
      <LegendDot />
      <span>
        <span className="rounded-sm bg-warning-subtle px-1 font-semibold text-warning-primary">{HEAVY_THRESHOLD}+</span>{" "}
        тяжёлая задача: не больше одной в день
      </span>
      <LegendDot />
      <span>
        <WeightChip weight={5} isImplicit className="h-4 align-middle" /> — вес угадан по метке, оценка не проставлена
      </span>
      <LegendDot />
      <span>👁 проверки одного человека: не больше 3 очков в день</span>
      <LegendDot />
      <span title="Этапы задачи на контроле">🗣 постановка · 👁 проверка · ✅ приёмка</span>
    </p>
  );
}

type Props = {
  weekStart: Date;
  isCurrentWeek: boolean;
  weekTotal: number;
  /** Sum of the seven shown days' limits. */
  weekLimit: number;
  /** Own tasks, briefings and acceptances with an unconfirmed weight; null while loading. */
  unconfirmedCount: number | null;
  isHighlightingUnconfirmed: boolean;
  onToggleHighlightUnconfirmed: () => void;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
};

export function WeekBoardHeader(props: Props) {
  const {
    weekStart,
    isCurrentWeek,
    weekTotal,
    weekLimit,
    unconfirmedCount,
    isHighlightingUnconfirmed,
    onToggleHighlightUnconfirmed,
    onPrev,
    onToday,
    onNext,
  } = props;
  const weekEnd = addDays(weekStart, 6);
  const title = `${weekStart.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${weekEnd.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-strong bg-surface-1 px-4 py-2.5">
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Предыдущая неделя" onClick={onPrev} className={cn(NAV_BUTTON, "w-7")}>
          <ChevronLeft className="size-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onToday}
          disabled={isCurrentWeek}
          className={cn(NAV_BUTTON, "px-2.5 text-12 font-medium disabled:cursor-default disabled:opacity-50")}
        >
          Сегодня
        </button>
        <button type="button" aria-label="Следующая неделя" onClick={onNext} className={cn(NAV_BUTTON, "w-7")}>
          <ChevronRight className="size-4" strokeWidth={2} />
        </button>
      </div>
      <h2 className="text-16 font-semibold text-primary">{title}</h2>
      <span className="text-12 text-tertiary tabular-nums">
        неделя: <span className="font-semibold text-secondary">{weekTotal}</span> / {weekLimit}
      </span>
      {unconfirmedCount !== null && (
        <UnconfirmedToggle
          count={unconfirmedCount}
          isOn={isHighlightingUnconfirmed}
          onToggle={onToggleHighlightUnconfirmed}
        />
      )}
      <Legend />
    </div>
  );
}

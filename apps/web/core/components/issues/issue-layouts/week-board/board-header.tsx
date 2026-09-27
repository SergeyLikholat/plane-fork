/**
 * Week board — top bar: week range, navigation, week total and the legend.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@plane/utils";
import { addDays } from "./use-board-model";
import { DAY_LIMIT, HEAVY_THRESHOLD } from "./weights";

const NAV_BUTTON =
  "inline-flex h-7 items-center justify-center rounded-md border border-subtle bg-surface-1 text-secondary transition-colors hover:bg-layer-1-hover hover:text-primary active:bg-layer-1-active outline-none focus-visible:border-accent-strong";

type Props = {
  weekStart: Date;
  isCurrentWeek: boolean;
  weekTotal: number;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
};

export function WeekBoardHeader(props: Props) {
  const { weekStart, isCurrentWeek, weekTotal, onPrev, onToday, onNext } = props;
  const weekEnd = addDays(weekStart, 6);
  const title = `${weekStart.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${weekEnd.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`;
  const weekLimit = DAY_LIMIT * 7;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-subtle bg-surface-1 px-4 py-2.5">
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
      <div className="ml-auto flex items-center gap-3 text-11 text-tertiary">
        <span>
          Лимит дня <span className="font-semibold text-secondary">{DAY_LIMIT}</span>
        </span>
        <span aria-hidden className="h-3 w-px bg-layer-3" />
        <span>
          <span className="rounded-sm bg-warning-subtle px-1 font-semibold text-warning-primary">
            {HEAVY_THRESHOLD}+
          </span>{" "}
          тяжёлая — одна в день
        </span>
        <span aria-hidden className="h-3 w-px bg-layer-3" />
        <span>
          <span className="text-tertiary">~</span>вес по метке · 👁 проверки человека ≤ 3 в день
        </span>
      </div>
    </div>
  );
}

/**
 * Profile Planner layout — list + embedded day calendar for the «Ваша работа»
 * tabs.
 *
 * Desktop / tablet (≥ 768px): two panes side-by-side, list 70% / calendar 30%.
 * Mobile portrait (< 768px): tabs «Список» / «День», each pane fills the
 * viewport. Trying to fit both panes on a 360–414px screen produces unreadable
 * 50px columns, so we collapse to one-at-a-time view. Tablet keeps the desktop
 * layout (≥ 768px width is enough for the 70/30 split to remain useful).
 *
 * Both panes share the SAME profile issues store and read from a single
 * fetch. The list pane owns the network round-trip via its existing
 * BaseListRoot; the calendar runs in `embedded` mode (no fetch, just renders
 * what is already in the store, filtered to the active day).
 *
 * Clicking a task in either pane uses the standard issue peek panel.
 */
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { cn } from "@plane/utils";
// local imports
import { CalendarWeekLayout } from "@/components/issues/issue-layouts/calendar-week/project-root";
import { ProfileIssuesListLayout } from "@/components/issues/issue-layouts/list/roots/profile-issues-root";

const CROSS_HOVER_CLASS = "cw-cross-hovered";

/**
 * Bind a delegated pointerover/pointerout listener to `rootRef` that toggles
 * the cross-pane highlight class on every element carrying the same
 * `data-cw-issue-id`. Pure DOM manipulation — neither pane re-renders when
 * the user moves the mouse, which matters because the list can hold 100+
 * MobX-observed blocks.
 */
function useCrossPaneHover(rootRef: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let activeId: string | null = null;
    const setActive = (id: string | null) => {
      if (id === activeId) return;
      if (activeId) {
        root
          .querySelectorAll<HTMLElement>(`[data-cw-issue-id="${CSS.escape(activeId)}"]`)
          .forEach((el) => el.classList.remove(CROSS_HOVER_CLASS));
      }
      activeId = id;
      if (activeId) {
        root
          .querySelectorAll<HTMLElement>(`[data-cw-issue-id="${CSS.escape(activeId)}"]`)
          .forEach((el) => el.classList.add(CROSS_HOVER_CLASS));
      }
    };

    const onOver = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      const card = t?.closest<HTMLElement>("[data-cw-issue-id]");
      setActive(card?.getAttribute("data-cw-issue-id") ?? null);
    };
    const onLeaveRoot = () => setActive(null);

    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerleave", onLeaveRoot);
    return () => {
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerleave", onLeaveRoot);
      setActive(null);
    };
  }, [rootRef]);
}

type PlannerTab = "list" | "day";

const MOBILE_QUERY = "(max-width: 767px)";

/** Tracks whether the viewport is narrower than the tablet breakpoint. */
function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    // Older Safari: addListener; modern browsers: addEventListener.
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);
  return isMobile;
}

export const ProfilePlannerLayout = observer(function ProfilePlannerLayout() {
  const isMobile = useIsMobileViewport();
  const [tab, setTab] = useState<PlannerTab>("list");
  // Single root ref for both desktop and mobile layouts — the hover hook
  // attaches a delegated listener to whichever one is currently mounted.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useCrossPaneHover(rootRef);
  const [dayWidthPct, setDayWidthPct] = useDayPaneWidth();

  if (isMobile) {
    return (
      <div ref={rootRef} className="flex h-full w-full flex-col">
        <div className="flex flex-shrink-0 items-center gap-1 border-b border-subtle-1 px-3 py-2">
          <TabButton active={tab === "list"} onClick={() => setTab("list")} label="Список" />
          <TabButton active={tab === "day"} onClick={() => setTab("day")} label="День" />
        </div>
        <div className="relative min-h-0 w-full flex-1 overflow-hidden">
          {tab === "list" ? (
            <div className="h-full w-full overflow-auto">
              <ProfileIssuesListLayout />
            </div>
          ) : (
            <CalendarWeekLayout embedded />
          )}
        </div>
      </div>
    );
  }

  // Desktop / tablet — list + day calendar with a draggable splitter.
  return (
    <div ref={rootRef} className="flex h-full w-full">
      <div className="relative h-full min-w-0 flex-1 overflow-hidden">
        <div className="h-full w-full overflow-auto">
          <ProfileIssuesListLayout />
        </div>
      </div>
      <PaneSplitter containerRef={rootRef} widthPct={dayWidthPct} onChange={setDayWidthPct} />
      <div className="relative h-full min-w-0 shrink-0 overflow-hidden" style={{ width: `${dayWidthPct}%` }}>
        <CalendarWeekLayout embedded />
      </div>
    </div>
  );
});

const DAY_PANE_STORAGE_KEY = "planner-day-pane-width-pct";
const DAY_PANE_DEFAULT_PCT = 30;
const DAY_PANE_MIN_PCT = 15;
const DAY_PANE_MAX_PCT = 70;
const KEYBOARD_STEP_PCT = 2;

const clampPct = (value: number): number => Math.min(DAY_PANE_MAX_PCT, Math.max(DAY_PANE_MIN_PCT, value));

/** Width of the day pane in % of the planner, remembered in localStorage. */
function useDayPaneWidth(): [number, (pct: number) => void] {
  const [pct, setPct] = useState<number>(() => {
    if (typeof window === "undefined") return DAY_PANE_DEFAULT_PCT;
    const saved = Number(window.localStorage.getItem(DAY_PANE_STORAGE_KEY));
    return Number.isFinite(saved) && saved > 0 ? clampPct(saved) : DAY_PANE_DEFAULT_PCT;
  });
  const update = (next: number) => {
    const value = clampPct(next);
    setPct(value);
    try {
      window.localStorage.setItem(DAY_PANE_STORAGE_KEY, String(Math.round(value * 10) / 10));
    } catch {
      // Private mode / quota: the width simply isn't remembered.
    }
  };
  return [pct, update];
}

type PaneSplitterProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  widthPct: number;
  onChange: (pct: number) => void;
};

/**
 * Vertical handle between the list and the day calendar. Drag, arrows, double-click resets.
 * Grey like the list's «desk», so there is no white strip between the cards and the day grid;
 * the line sits on the calendar's edge.
 */
function PaneSplitter({ containerRef, widthPct, onChange }: PaneSplitterProps) {
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    const rect = container.getBoundingClientRect();
    const onMove = (e: PointerEvent) => onChange(((rect.right - e.clientX) / rect.width) * 100);
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") onChange(widthPct + KEYBOARD_STEP_PCT);
    else if (event.key === "ArrowRight") onChange(widthPct - KEYBOARD_STEP_PCT);
    else return;
    event.preventDefault();
  };

  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a separator has no native element
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина календаря дня"
      aria-valuemin={DAY_PANE_MIN_PCT}
      aria-valuemax={DAY_PANE_MAX_PCT}
      aria-valuenow={Math.round(widthPct)}
      tabIndex={0}
      title="Потяните, чтобы изменить ширину. Двойной клик — вернуть как было"
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange(DAY_PANE_DEFAULT_PCT)}
      onKeyDown={onKeyDown}
      className="group relative z-[2] w-2 shrink-0 cursor-col-resize bg-canvas outline-none"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 right-0 w-0 border-r border-strong transition-colors",
          "group-hover:border-r-[3px] group-hover:border-accent-strong group-focus-visible:border-r-[3px] group-focus-visible:border-accent-strong",
          isDragging && "border-r-[3px] border-accent-strong"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-1/2 h-8 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-subtle-1 bg-surface-1 shadow-raised-100 transition-opacity",
          "opacity-70 group-hover:opacity-100"
        )}
      />
    </div>
  );
}

type TabButtonProps = {
  active: boolean;
  onClick: () => void;
  label: string;
};

function TabButton({ active, onClick, label }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-sm rounded-md px-3 py-1 font-medium transition-colors",
        // bg-accent-primary + text-on-color is the canonical Plane "active
        // pill" combo (see workspace-notifications/sidebar menu items).
        // bg-accent-strong does NOT exist — only border-accent-strong does.
        active ? "bg-accent-primary text-on-color" : "text-tertiary hover:bg-layer-1-hover hover:text-primary"
      )}
    >
      {label}
    </button>
  );
}

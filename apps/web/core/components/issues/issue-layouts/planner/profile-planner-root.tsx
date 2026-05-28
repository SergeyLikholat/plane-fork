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

  // Desktop / tablet — original split layout, untouched.
  return (
    <div ref={rootRef} className="flex h-full w-full">
      <div className="relative h-full min-w-0 flex-[7] overflow-hidden border-r border-subtle-1">
        <div className="h-full w-full overflow-auto">
          <ProfileIssuesListLayout />
        </div>
      </div>
      <div className="relative h-full min-w-0 flex-[3] overflow-hidden">
        <CalendarWeekLayout embedded />
      </div>
    </div>
  );
});

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
        "rounded-md px-3 py-1 text-sm font-medium transition-colors",
        // bg-accent-primary + text-on-color is the canonical Plane "active
        // pill" combo (see workspace-notifications/sidebar menu items).
        // bg-accent-strong does NOT exist — only border-accent-strong does.
        active
          ? "bg-accent-primary text-on-color"
          : "text-tertiary hover:bg-layer-1-hover hover:text-primary"
      )}
    >
      {label}
    </button>
  );
}

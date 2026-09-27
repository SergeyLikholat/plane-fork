/**
 * Calendar-Week layout — hourly grid view with drag/resize and peek-open on click.
 * Render semantics (TickTick-style):
 *   block  — start_time + target_time both set → block [start; target]
 *   point  — only target_time set → short pill centered on target_time
 *   allday — no time, just target_date → pill in the top "all-day" row
 *
 * Cards render in a SINGLE overlay layer above the slot grid so their bottom
 * edges aren't clipped by slot borders, and pointer events are element-scoped.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Check } from "lucide-react";
import { type TIssue } from "@plane/types";
import { Spinner } from "@plane/ui";
import { capitalizeFirstLetter, isColorDark } from "@plane/utils";
import { useOutsideClickDetector } from "@plane/hooks";
import { useIssues } from "@/hooks/store/use-issues";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { CompleteCheckbox } from "../complete-checkbox";
import { AllDayCell } from "./all-day-cell";
import { computeDayLoads, DayLoadBadge } from "./day-load";
import { useAllDayCap } from "./use-allday-cap";
import { useIssueWeigher } from "./use-issue-weigher";

const CAL_LABEL_PREFIX = "cal:";
// Mirror the magic key the base-issues store uses for ungrouped responses.
const ALL_ISSUES_KEY = "All Issues";

/** Normalise a hex string to a solid 6-digit `#rrggbb`. */
function solidHex(hex: string): string {
  const h = (hex || "").startsWith("#") ? hex.slice(1) : hex || "";
  if (h.length === 3)
    return `#${h
      .split("")
      .map((c) => c + c)
      .join("")}`;
  return `#${(h || "3b82f6").slice(0, 6)}`;
}

/** Multiply a hex colour towards black — used for the hover state. */
function shade(hex: string, factor: number): string {
  const h = solidHex(hex).slice(1);
  const parts = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * factor));
  return `#${parts.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Card surface for a calendar-coloured issue.
 *
 * Google Calendar fills the whole chip with the calendar colour and puts white
 * (or near-black) text on top, which is what makes its grid readable at a
 * glance. This layout used to paint the same colour at 20% alpha over the page
 * background, so every event came out as a washed-out pastel regardless of the
 * calendar it belonged to.
 *
 * The text colour is chosen per card: Google's own palette mixes dark hues
 * (Tomato #f83a22) with very light ones (Banana #fbe983), and white on banana
 * is unreadable.
 */
function calSurface(hex: string): { bg: string; hoverBg: string; fg: string } {
  const bg = solidHex(hex);
  return {
    bg,
    hoverBg: shade(bg, 0.88),
    fg: isColorDark(bg) ? "#ffffff" : "#1f2328",
  };
}

type BlockCard = { kind: "block"; start: Date; end: Date; day: Date };
type PointCard = { kind: "point"; at: Date; day: Date };
type AllDayCard = { kind: "allday"; day: Date };
type MultiDayCard = {
  kind: "multiday";
  startDay: Date;
  endDay: Date;
  startTime: string | null;
  targetTime: string | null;
  // Sentinel day for grouping/keying — first visible day or startDay.
  day: Date;
};
type CardTime = BlockCard | PointCard | AllDayCard | MultiDayCard;

const RANGE_RE = /(?<![\d:])(?:[@⏰]\s*)?(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})(?![\d:])/;
const POINT_RE = /(?<![\d:])(?:[@⏰]\s*)?(\d{1,2}):(\d{2})(?![\d:])/;
const DEFAULT_DURATION_MIN = 60;
const POINT_PILL_HEIGHT = 22;
const SNAP_MIN = 15;
const DRAG_THRESHOLD_PX = 3;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_PX_MIN = 48;
const HEADER_PX = 28;
const ALLDAY_ROW_PX = 28;
const ALLDAY_MAX_VISIBLE = 2; // show this many before collapsing remainder into "+N"
const BLOCK_BOTTOM_GAP_PX = 2; // small visual gap so card bottom doesn't touch next grid line

function parseHMS(raw: string | null | undefined): { h: number; m: number } | null {
  if (!raw) return null;
  const parts = raw.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function baseDate(targetDate: string): Date | null {
  const d = new Date(targetDate + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function timeFromRegex(name: string | null | undefined, day: Date): { start: Date; end: Date } | null {
  if (!name) return null;
  let m = RANGE_RE.exec(name);
  if (m) {
    const start = new Date(day);
    start.setHours(Number(m[1]), Number(m[2]), 0, 0);
    const end = new Date(day);
    end.setHours(Number(m[3]), Number(m[4]), 0, 0);
    if (end > start) return { start, end };
  }
  m = POINT_RE.exec(name);
  if (m) {
    const start = new Date(day);
    start.setHours(Number(m[1]), Number(m[2]), 0, 0);
    const end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);
    return { start, end };
  }
  return null;
}

function parseIssueTimes(issue: TIssue): CardTime[] {
  if (!issue.target_date) return [];
  const targetDay = baseDate(issue.target_date);
  if (!targetDay) return [];
  const startDay = issue.start_date ? baseDate(issue.start_date) : null;

  const s = parseHMS(issue.start_time);
  const e = parseHMS(issue.target_time);

  // ─── Multi-day case: start_date < target_date ─────────────────────────
  // Always render as a single all-day strip across the day range, regardless
  // of times. Time annotation (start/end) is shown inside the strip.
  if (startDay && startDay.getTime() < targetDay.getTime()) {
    return [
      {
        kind: "multiday",
        startDay,
        endDay: targetDay,
        startTime: issue.start_time ?? null,
        targetTime: issue.target_time ?? null,
        day: startDay,
      },
    ];
  }

  // ─── Single-day case ─────────────────────────────────────────────────
  const day = targetDay;
  if (s && e) {
    const start = new Date(day);
    start.setHours(s.h, s.m, 0, 0);
    const end = new Date(day);
    end.setHours(e.h, e.m, 0, 0);
    if (end > start) return [{ kind: "block", start, end, day }];
  }
  if (!s && e) {
    const at = new Date(day);
    at.setHours(e.h, e.m, 0, 0);
    return [{ kind: "point", at, day }];
  }
  if (s && !e) {
    const at = new Date(day);
    at.setHours(s.h, s.m, 0, 0);
    return [{ kind: "point", at, day }];
  }
  const legacy = timeFromRegex(issue.name, day);
  if (legacy) return [{ kind: "block", start: legacy.start, end: legacy.end, day }];
  return [{ kind: "allday", day }];
}

export function stripTimeNotation(name: string): string {
  return name
    .replace(RANGE_RE, "")
    .replace(POINT_RE, "")
    .replace(/[@⏰]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function getWeekStart(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay() || 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - (dow - 1));
  return x;
}

function formatHM(d: Date): string {
  // Explicit ru-RU + hour12:false — an empty locale array falls back to the
  // browser's, which renders "11:00 AM" for anyone whose browser is English.
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function toPayloadDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function toPayloadTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}

function snap(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

function shiftDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

type DragKind = "move" | "resize-top" | "resize-bottom";

type SourceKind = "block" | "point" | "allday";

type DragInfo = {
  kind: DragKind;
  sourceKind: SourceKind;
  issueId: string;
  isPoint: boolean;
  pointerId: number;
  pointerStart: { x: number; y: number };
  origStart: Date;
  origEnd: Date;
  origDayIndex: number;
  current: { start: Date; end: Date; dayIndex: number; inTimeZone: boolean };
  moved: boolean;
  moveHandler: (ev: PointerEvent) => void;
  upHandler: (ev: PointerEvent) => void;
};

type CalendarWeekLayoutProps = {
  // When true the calendar runs in "embedded" mode for the Planner layout:
  //   • locked to "day" view (no Week/Month switcher, no Опции dropdown)
  //   • does NOT fetch issues itself — relies on the parent to populate
  //     the store; reads ungrouped IDs from groupedIssueIds, falling back
  //     to flattening grouped responses
  //   • no distribute-panel toggle, no top header
  //   • compact mini-header with just date + arrows
  embedded?: boolean;
};

export const CalendarWeekLayout = observer(function CalendarWeekLayout(props: CalendarWeekLayoutProps = {}) {
  const { embedded = false } = props;
  const storeType = useIssueStoreType();
  const { issues, issueMap } = useIssues(storeType);
  const { fetchIssues, updateIssue } = useIssuesActions(storeType);
  // useParams gives us projectId for project layouts, profileViewId for the
  // profile-issues layouts (assigned/created/subscribed tabs in "Ваша работа").
  // Profile mode has no projectId — distribute-panel and unscheduled fetch
  // are guarded against that below.
  const params = useParams();
  const workspaceSlug = (params as { workspaceSlug?: string }).workspaceSlug;
  const projectId = (params as { projectId?: string }).projectId;
  const profileViewId = (params as { profileViewId?: string }).profileViewId;
  const { handleRedirection } = useIssuePeekOverviewRedirection(false);
  const { isMobile } = usePlatformOS();
  const { labelMap } = useLabel();
  const { stateMap } = useProjectState();
  const member = useMember();
  const { getUserDetails } = member;
  const userIdParam = (params as { userId?: string }).userId;

  // Active work-item filter (rich filter expression). When the user has
  // any condition set — by state_group, label, target_date, etc. — the
  // calendar must respect it strictly: the "completed-tasks faded" UX
  // below is the *only* place we'd otherwise bypass it, and that
  // bypassing is exactly what the user flagged as broken.
  //
  // Filter entity id depends on the store type:
  //   • project layouts use projectId
  //   • profile layouts (Ваша работа) use userId
  //   • other layouts (cycle/module/view) — fall back to projectId or
  //     userIdParam, whichever happens to be defined.
  const workItemFiltersStore = useWorkItemFilters();
  const filterEntityId = projectId ?? userIdParam ?? null;
  const filterInstance = filterEntityId ? workItemFiltersStore.getFilter(storeType, filterEntityId) : undefined;
  const hasExplicitFilters = filterInstance?.canClearFilters ?? false;

  // Local-only toggles. Persisting via filter store proved fragile across
  // store types, so we keep these session-scoped here.
  const [showWeekends, setShowWeekends] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"week" | "month" | "day">(embedded ? "day" : "week");
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [dayAnchor, setDayAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const handleToggleShowWeekends = () => setShowWeekends((v) => !v);
  const handleSwitchToMonth = () => setViewMode("month");
  const handleSwitchToWeek = () => setViewMode("week");
  const handleSwitchToDay = () => setViewMode("day");

  // Distribute-tasks panel (TickTick-style): right sidebar with unscheduled
  // issues that the user can drag onto the time grid.
  // Distribute-panel persistence. Keep one JSON blob per (workspace, scope)
  // so opening the panel + setting filters survives:
  //   • tab switching inside Ваша работа,
  //   • navigation to other projects and back,
  //   • reloading the page.
  // Scope key = projectId for project layouts, userId for profile.
  const persistScope = projectId ?? userIdParam ?? "default";
  const persistKey = `calendar-week:distribute:${workspaceSlug ?? "_"}:${persistScope}`;
  type PanelPersistState = {
    show: boolean;
    labelFilter: string[];
    priorityFilter: string | null;
    stateFilter: string[];
    assigneeFilter: string | null;
  };
  const readPersisted = (): PanelPersistState | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(persistKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PanelPersistState>;
      return {
        show: Boolean(parsed.show),
        labelFilter: Array.isArray(parsed.labelFilter) ? parsed.labelFilter : [],
        priorityFilter: typeof parsed.priorityFilter === "string" ? parsed.priorityFilter : null,
        stateFilter: Array.isArray(parsed.stateFilter) ? parsed.stateFilter : [],
        assigneeFilter: typeof parsed.assigneeFilter === "string" ? parsed.assigneeFilter : null,
      };
    } catch {
      return null;
    }
  };
  const initial = readPersisted();
  const [showDistributePanel, setShowDistributePanel] = useState<boolean>(initial?.show ?? false);
  // Multi-select for label + status (TickTick parity); single for priority +
  // assignee. The arrays empty = "Все" (no filtering on that axis).
  const [panelLabelFilter, setPanelLabelFilter] = useState<string[]>(initial?.labelFilter ?? []);
  const [panelPriorityFilter, setPanelPriorityFilter] = useState<string | null>(initial?.priorityFilter ?? null);
  const [panelStateFilter, setPanelStateFilter] = useState<string[]>(initial?.stateFilter ?? []);
  const [panelAssigneeFilter, setPanelAssigneeFilter] = useState<string | null>(initial?.assigneeFilter ?? null);
  // Write back whenever any persisted field changes. Cheap: one write per
  // user action, no need to debounce.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const payload: PanelPersistState = {
        show: showDistributePanel,
        labelFilter: panelLabelFilter,
        priorityFilter: panelPriorityFilter,
        stateFilter: panelStateFilter,
        assigneeFilter: panelAssigneeFilter,
      };
      window.localStorage.setItem(persistKey, JSON.stringify(payload));
    } catch {
      /* quota or denied — fine, just lose persistence */
    }
  }, [persistKey, showDistributePanel, panelLabelFilter, panelPriorityFilter, panelStateFilter, panelAssigneeFilter]);
  // When the scope changes (switching projects, switching profile tabs),
  // re-read so we don't carry over the previous scope's panel state.
  // Skip the very first run — useState already initialised from storage,
  // re-setting would cause an unneeded re-render with fresh array refs.
  const firstScopeMountRef = useRef(true);
  useEffect(() => {
    if (firstScopeMountRef.current) {
      firstScopeMountRef.current = false;
      return;
    }
    const next = readPersisted();
    setShowDistributePanel(next?.show ?? false);
    setPanelLabelFilter(next?.labelFilter ?? []);
    setPanelPriorityFilter(next?.priorityFilter ?? null);
    setPanelStateFilter(next?.stateFilter ?? []);
    setPanelAssigneeFilter(next?.assigneeFilter ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 280;
    const saved = window.localStorage.getItem("calendar-week:distribute-panel-width");
    const n = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(n) && n >= 200 && n <= 600 ? n : 280;
  });
  const handlePanelWidthChange = (w: number) => {
    setPanelWidth(w);
    try {
      window.localStorage.setItem("calendar-week:distribute-panel-width", String(w));
    } catch {
      /* ignore */
    }
  };
  const handleToggleDistributePanel = () => setShowDistributePanel((v) => !v);

  // Drag-source state when dragging an unscheduled card from the panel onto
  // the time grid. Tracked separately from the on-grid drag (`drag` ref).
  const [panelDrag, setPanelDrag] = useState<{
    issue: TIssue;
    clientX: number;
    clientY: number;
    over: { dayIndex: number; minute: number } | null;
  } | null>(null);

  /** Begin a drag from the right-side panel onto the time grid.
   *
   * Click vs drag disambiguation: pointerdown alone is not a drag. We only
   * commit to a drop once the pointer has moved past DRAG_THRESHOLD_PX.
   * Without this, a plain click was being treated as a drag-and-drop —
   * pointerup happened over the panel (which sits to the right of the
   * grid), `xRel > 0` was true (clamped to last visible day = Sunday)
   * and the task got auto-scheduled to Sunday 00:00. Now: pointer never
   * passes the threshold → treat as a click → open peek overview.
   */
  const handlePanelDragStart = (issue: TIssue, ev: React.PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    const startX = ev.clientX;
    const startY = ev.clientY;
    let movedFar = false;
    // Don't show the floating ghost until we're actually dragging; otherwise
    // a quick click flashes the ghost for one frame.

    const onMove = (e: PointerEvent) => {
      if (!movedFar) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        movedFar = true;
        setPanelDrag({ issue, clientX: e.clientX, clientY: e.clientY, over: null });
      }
      const grid = gridRef.current;
      if (!grid) {
        setPanelDrag((d) => (d ? { ...d, clientX: e.clientX, clientY: e.clientY, over: null } : d));
        return;
      }
      const g = grid.getBoundingClientRect();
      const colW = (g.width - 60) / Math.max(1, days.length);
      const xRel = e.clientX - g.left - 60;
      const yRel = e.clientY - g.top - hourGridTop;
      // Strict bounds: must be INSIDE the grid horizontally too. The panel
      // sits to the right of the grid, so a pointer over the panel has
      // xRel > days.length * colW and previously got clamped to the last
      // column. Only consider it "over" when actually inside.
      const gridW = days.length * colW;
      let over: { dayIndex: number; minute: number } | null = null;
      if (xRel >= 0 && xRel < gridW && yRel >= 0 && yRel <= hourPx * 24) {
        const dayIndex = Math.max(0, Math.min(days.length - 1, Math.floor(xRel / colW)));
        const minute = Math.max(0, Math.min(23 * 60 + 45, Math.floor(yRel / pxPerMin / 15) * 15));
        over = { dayIndex, minute };
      }
      setPanelDrag({ issue, clientX: e.clientX, clientY: e.clientY, over });
    };

    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // No drag → treat as a click. Open the issue peek (matches every
      // other card in Plane).
      if (!movedFar) {
        setPanelDrag(null);
        if (workspaceSlug) handleRedirection(String(workspaceSlug), issue, isMobile);
        return;
      }
      // Drag ended — drop only if released INSIDE the grid.
      const grid = gridRef.current;
      if (!grid || !workspaceSlug || !issue.project_id) {
        setPanelDrag(null);
        return;
      }
      const g = grid.getBoundingClientRect();
      const colW = (g.width - 60) / Math.max(1, days.length);
      const xRel = e.clientX - g.left - 60;
      const yRel = e.clientY - g.top - hourGridTop;
      const gridW = days.length * colW;
      if (xRel < 0 || xRel >= gridW || yRel < 0 || yRel > hourPx * 24) {
        setPanelDrag(null);
        return;
      }
      const dayIndex = Math.max(0, Math.min(days.length - 1, Math.floor(xRel / colW)));
      const startMin = Math.max(0, Math.min(23 * 60, Math.floor(yRel / pxPerMin / 15) * 15));
      const endMin = Math.min(23 * 60 + 59, startMin + 60);
      const day = days[dayIndex];
      const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
      updateIssue(issue.project_id, issue.id, {
        target_date: toPayloadDate(day),
        start_date: toPayloadDate(day),
        start_time: fmt(startMin),
        target_time: fmt(endMin),
      } as Partial<TIssue>);
      // Optimistically remove from local panel list.
      setUnscheduledList((prev) => prev.filter((i) => i.id !== issue.id));
      setPanelDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /** Pick the cal:* label color for an issue, or null if none assigned. */
  const getCalColor = (it: TIssue): string | null => {
    const ids = it.label_ids ?? [];
    for (const id of ids) {
      const l = labelMap[id];
      if (l && (l.name ?? "").startsWith(CAL_LABEL_PREFIX) && l.color) return l.color;
    }
    return null;
  };

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const stickyWrapRef = useRef<HTMLDivElement | null>(null);
  const alldayProbeRef = useRef<HTMLDivElement | null>(null);
  const hourAnchorRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const justDraggedRef = useRef(false);
  const [, tick] = useState(0);
  const forceRender = () => tick((n) => n + 1);

  const [alldayHeight, setAlldayHeight] = useState(ALLDAY_ROW_PX);
  const [alldayTop, setAlldayTop] = useState(HEADER_PX);
  const [hourGridTop, setHourGridTop] = useState(HEADER_PX + ALLDAY_ROW_PX);
  const [hourPx, setHourPx] = useState(HOUR_PX_MIN);
  const [gridBottomPad, setGridBottomPad] = useState(0);
  const pxPerMin = hourPx / 60;
  // Cap on the all-day strip height so the hour grid always stays visible.
  const alldayCapPx = useAllDayCap(scrollRef, viewMode);
  const weighIssue = useIssueWeigher(workspaceSlug);
  const [expandedAllDayDays, setExpandedAllDayDays] = useState<Set<string>>(new Set());
  const toggleAllDayExpand = (key: string) =>
    setExpandedAllDayDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const [now, setNow] = useState<Date>(() => new Date());
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return e;
  }, [weekStart]);

  // Range to fetch — day, week, or full grid month. The month grid pads up
  // to 6×7 around the active month, so we fetch the entire 6-week padded
  // range. Day mode fetches a single day.
  const fetchRange = useMemo(() => {
    if (viewMode === "day") {
      const after = new Date(dayAnchor);
      after.setHours(0, 0, 0, 0);
      const before = new Date(dayAnchor);
      before.setHours(23, 59, 59, 999);
      return { after, before };
    }
    if (viewMode === "week") {
      return { after: weekStart, before: weekEnd };
    }
    const first = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    const startOff = (first.getDay() + 6) % 7; // Mon=0
    const after = new Date(first);
    after.setDate(after.getDate() - startOff);
    after.setHours(0, 0, 0, 0);
    const totalCells = 42; // 6 weeks
    const before = new Date(after);
    before.setDate(before.getDate() + (totalCells - 1));
    before.setHours(23, 59, 59, 999);
    return { after, before };
  }, [viewMode, weekStart, weekEnd, monthAnchor, dayAnchor]);

  useEffect(() => {
    // Embedded mode (Planner): the parent owns the fetch; calendar reads
    // whatever the store already has and filters by current day.
    if (embedded) return;
    // For profile views (Назначенные/Созданные/Отслеживаемые) the action
    // adapter expects the profile tab id as the third argument; for project
    // layouts that argument is ignored.
    fetchIssues(
      "init-loader",
      {
        canGroup: false,
        perPageCount: 200,
        after: fetchRange.after.toISOString().slice(0, 10),
        before: fetchRange.before.toISOString().slice(0, 10),
      },
      profileViewId
    );
  }, [fetchIssues, fetchRange, profileViewId, embedded]);

  // ── Completed-tasks side fetch (Variant A, F5-survivable) ──────────────
  // The active filter for any layout in profile/project defaults to
  // type=active+backlog, so the main fetch never returns completed issues.
  // The calendar UX wants completed tasks to STAY visible (faded + struck),
  // so we do a parallel side fetch every time the visible date range
  // changes, requesting only `state_group=completed` for that range. The
  // results are pushed into the global issueMap and into a session +
  // localStorage-backed Set of "ids we should render muted". This way:
  //   • new session reload still recovers completed-task placeholders
  //   • current-session toggles show up immediately because the main
  //     fetch already updates the state on the issue, and our `seenIdsRef`
  //     fallback covers the in-flight case
  const completedExtraIdsKey = useMemo(() => {
    const k = projectId ? `proj:${projectId}` : `prof:${profileViewId ?? "any"}`;
    return `cw:completed:${workspaceSlug ?? "_"}:${k}`;
  }, [workspaceSlug, projectId, profileViewId]);
  const [completedExtraIds, setCompletedExtraIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(completedExtraIdsKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  // Persist whenever it changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(completedExtraIdsKey, JSON.stringify(Array.from(completedExtraIds)));
    } catch {
      /* ignore */
    }
  }, [completedExtraIds, completedExtraIdsKey]);
  useEffect(() => {
    if (!workspaceSlug) return;
    // When the user has explicit rich filters set, respect them strictly:
    // do NOT pull in completed tasks that the active filter would hide.
    // Otherwise the "Все завершённые отображаются" bug surfaces: the user
    // filters by state_group ⊂ {backlog, unstarted, started}, but
    // completed tasks still leak in via this side fetch.
    if (hasExplicitFilters) {
      setCompletedExtraIds((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    const after = fetchRange.after.toISOString().slice(0, 10);
    const before = fetchRange.before.toISOString().slice(0, 10);
    let cancelled = false;
    (async () => {
      try {
        let results: TIssue[] = [];
        if (projectId) {
          const { IssueService } = await import("@/services/issue");
          const svc = new IssueService();
          const resp: { results?: TIssue[] | unknown } = await (
            svc as unknown as {
              getIssues: (
                ws: string,
                pid: string,
                params: Record<string, string | number | undefined>
              ) => Promise<{ results?: TIssue[] | unknown }>;
            }
          ).getIssues(workspaceSlug.toString(), projectId.toString(), {
            target_date: `${after};after,${before};before`,
            state_group: "completed",
            per_page: 200,
          });
          if (Array.isArray(resp?.results)) results = resp.results as TIssue[];
        } else if (profileViewId) {
          const { UserService } = await import("@/services/user.service");
          const svc = new UserService();
          const userId = (params as { userId?: string }).userId;
          if (!userId) return;
          const params_: Record<string, string | number | undefined> = {
            target_date: `${after};after,${before};before`,
            state_group: "completed",
            per_page: 200,
          };
          if (profileViewId === "assigned") params_.assignees = userId;
          else if (profileViewId === "created") params_.created_by = userId;
          else if (profileViewId === "subscribed") params_.subscriber = userId;
          const resp = await (
            svc as unknown as {
              getUserProfileIssues: (
                ws: string,
                uid: string,
                params: Record<string, string | number | undefined>
              ) => Promise<{ results?: TIssue[] | unknown }>;
            }
          ).getUserProfileIssues(workspaceSlug.toString(), userId, params_);
          if (Array.isArray(resp?.results)) results = resp.results as TIssue[];
        } else {
          return;
        }
        if (cancelled) return;
        if (results.length > 0) {
          // Push into global issueMap so getIssueById / store actions work.
          const root = (issues as { rootIssueStore?: { issues?: { addIssue?: (i: TIssue[]) => void } } })
            .rootIssueStore;
          root?.issues?.addIssue?.(results);
        }
        const newIds = new Set(results.map((i) => i.id));
        setCompletedExtraIds((prev) => {
          // Replace with the freshly fetched set (issues that are no longer
          // completed should disappear from this set immediately).
          if (prev.size === newIds.size && Array.from(newIds).every((id) => prev.has(id))) return prev;
          return newIds;
        });
      } catch {
        /* swallow — completed-tasks fade is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId, profileViewId, fetchRange, params, issues, hasExplicitFilters]);

  // ── Unscheduled tasks fetch (for distribute panel) ─────────────────────
  const [unscheduledList, setUnscheduledList] = useState<TIssue[]>([]);
  const fetchUnscheduled = useCallback(async () => {
    if (!workspaceSlug) return;
    try {
      const flatten = (raw: unknown): TIssue[] => {
        if (Array.isArray(raw)) return raw as TIssue[];
        if (raw && typeof raw === "object") {
          let out: TIssue[] = [];
          for (const v of Object.values(raw as Record<string, unknown>)) {
            const grouped = (v as { results?: TIssue[] | object } | undefined)?.results;
            if (Array.isArray(grouped)) out = out.concat(grouped as TIssue[]);
          }
          return out;
        }
        return [];
      };
      let all: TIssue[] = [];
      if (projectId) {
        const { IssueService } = await import("@/services/issue");
        const service = new IssueService();
        // Pull a single page of issues for the project; filter target_date IS NULL on FE.
        // Backend list endpoint paginates by ~100 — that's enough for a panel.
        const resp = await (service as any).getIssues(workspaceSlug.toString(), projectId.toString(), {
          per_page: 200,
        });
        all = flatten(resp?.results);
      } else if (profileViewId && userIdParam) {
        // Profile mode (Ваша работа → calendar): no project scope. Use the
        // workspace-level user-profile endpoint with the same role filter
        // the rest of the page uses (assigned/created/subscribed).
        const { UserService } = await import("@/services/user.service");
        const svc = new UserService();
        const params_: Record<string, string | number | undefined> = { per_page: 200 };
        if (profileViewId === "assigned") params_.assignees = userIdParam;
        else if (profileViewId === "created") params_.created_by = userIdParam;
        else if (profileViewId === "subscribed") params_.subscriber = userIdParam;
        const resp = await (
          svc as unknown as {
            getUserProfileIssues: (
              ws: string,
              uid: string,
              params: Record<string, string | number | undefined>
            ) => Promise<{ results?: unknown }>;
          }
        ).getUserProfileIssues(workspaceSlug.toString(), userIdParam, params_);
        all = flatten(resp?.results);
      } else {
        return;
      }
      const items = all.filter((it) => !it.target_date && !it.archived_at);
      setUnscheduledList(items);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("calendar-week: fetch unscheduled failed", err);
    }
  }, [workspaceSlug, projectId, profileViewId, userIdParam]);
  useEffect(() => {
    if (!showDistributePanel) return;
    fetchUnscheduled();
  }, [showDistributePanel, fetchUnscheduled]);

  // Live refresh: poll every 15s while the tab is visible, and immediately
  // on focus/visibility-change. Picks up changes from plane-gcal-sync (e.g.
  // when the user moves an event in Google Calendar) without requiring a
  // page reload. Calls the store directly with "mutation" loader and
  // existing pagination so the visible card list updates in place without
  // the issuesMap being cleared.
  // Project mode keys on (workspaceSlug, projectId); profile mode keys on
  // (workspaceSlug, userId).
  const userId = (params as { userId?: string }).userId;
  const liveRefreshEntity = projectId ?? userId;
  const issuesStore = issues as {
    fetchIssuesWithExistingPagination?: (ws: string, pid: string, loader: string) => Promise<unknown>;
  };
  useEffect(() => {
    // Live-refresh poll. In embedded (Planner) mode the calendar pane is
    // the only periodic-refresh source for the shared store — the list
    // pane on the left renders from the same `groupedIssueIds`, so when
    // the poll mutates them the list updates as well. Both panes use a
    // `lastGoodIdsRef`/cached groupedIssueIds to prevent the brief blank
    // window during the refetch (clear() sets `groupedIssueIds=undefined`
    // for ~200 ms).
    if (!workspaceSlug || !liveRefreshEntity) return;
    const refresh = () => {
      if (document.hidden) return;
      // fetchIssuesWithExistingPagination keeps the pagination context and
      // re-uses existing options instead of wiping the store.
      issuesStore.fetchIssuesWithExistingPagination?.(
        workspaceSlug.toString(),
        liveRefreshEntity.toString(),
        "mutation"
      );
    };
    const interval = window.setInterval(refresh, 15_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [issuesStore, workspaceSlug, liveRefreshEntity]);

  // Recompute every render — MobX mutates observable issue props in place.
  // Use the store's filtered ID list (populated by fetchIssues with applied
  // filters) instead of reading every issue from the global issueMap. This
  // makes the calendar react to filter changes the same way list/kanban do.
  //
  // base-issues.store.getIssueIds() returns undefined for calendar layouts
  // (its `groupBy` is hard-coded to "target_date" for any calendar variant
  // and the function bails out without a groupId argument). The filtered IDs
  // are still available under groupedIssueIds[ALL_ISSUES] when we fetched
  // ungrouped (canGroup: false), so read from there directly. While the
  // store is still loading the very first response groupedIssueIds is
  // undefined — render an empty list rather than falling back to the
  // global issueMap, which would show every issue across stores regardless
  // of the active filters.
  const groupedIssueIds = (issues as { groupedIssueIds?: Record<string, string[] | unknown> | undefined })
    .groupedIssueIds;
  // 15-second live refresh resets `groupedIssueIds` to `undefined` while a
  // mutation refetch is in flight (base-issues.store.clear() does this even
  // for "mutation" loaders). That blanks the calendar for ~200 ms causing a
  // visible flicker every poll cycle. Keep the previous IDs in a ref and
  // reuse them whenever the store is mid-fetch — only an actual *response*
  // ever leaves the store with a defined groupedIssueIds object (possibly
  // empty), so this preserves the "loaded empty" state correctly.
  const lastGoodIdsRef = useRef<string[]>([]);
  let allIssuesIds: string[] | undefined;
  if (groupedIssueIds !== undefined) {
    const direct = groupedIssueIds[ALL_ISSUES_KEY] as string[] | undefined;
    if (Array.isArray(direct) && direct.length > 0) {
      allIssuesIds = direct;
    } else if (embedded) {
      // Planner shares the store with the list view, which may have grouped
      // the response (group_by=state, project, etc.). Flatten across groups
      // so the day calendar still sees every issue.
      const flat: string[] = [];
      for (const v of Object.values(groupedIssueIds)) {
        if (Array.isArray(v)) flat.push(...(v as string[]));
      }
      allIssuesIds = flat;
    } else {
      allIssuesIds = direct ?? [];
    }
    lastGoodIdsRef.current = allIssuesIds;
  } else {
    // mid-fetch — keep showing whatever we last had so the UI doesn't blank
    allIssuesIds = lastGoodIdsRef.current.length > 0 ? lastGoodIdsRef.current : undefined;
  }
  // Calendar UX rule (TickTick / Google Calendar style):
  //   • completed tasks STAY visible on the grid even if the active filter
  //     would normally hide them (so the user keeps a visual record of what
  //     they've done today). They are rendered "muted" (faded + line-through).
  //   • cancelled tasks are HIDDEN entirely.
  //
  // The list pane and any other layout still respect the filter as-is — only
  // the calendar component bends the rule, locally.
  //
  // Implementation: accumulate every IssueId we've ever seen in the live
  // response into a session-scoped Set. When the live response no longer
  // contains a previously-seen id but the issue is still cached in issueMap
  // and its state belongs to the `completed` group, we re-add it to issueList
  // and flag it as muted. Cancelled issues are filtered out everywhere.
  const seenIdsRef = useRef<Set<string>>(new Set());
  if (allIssuesIds) {
    for (const id of allIssuesIds) seenIdsRef.current.add(id);
  }
  const stateGroupOf = (it: TIssue): string | undefined => {
    const sId = (it as { state_id?: string | null }).state_id ?? null;
    if (!sId) return undefined;
    return stateMap[sId]?.group;
  };
  const liveSet = new Set(allIssuesIds ?? []);
  const issueList: TIssue[] = [];
  if (allIssuesIds) {
    for (const id of allIssuesIds) {
      const it = issueMap?.[id];
      if (!it) continue;
      if (stateGroupOf(it) === "cancelled") continue;
      issueList.push(it);
    }
  }
  // Completed extras: stick to the grid even when the active filter dropped
  // them server-side. Rendered with reduced opacity + line-through.
  // Sources combined:
  //   1. seenIdsRef — completed tasks ticked during this session (covers
  //      the brief window after a click before a refetch is acked).
  //   2. completedExtraIds — IDs returned by the dedicated date-range
  //      "completed" fetch above; persisted to localStorage so an F5 still
  //      shows them.
  //
  // SKIP this entire merge when the user has explicit rich filters set —
  // they want the filter respected strictly. The side fetch above already
  // bails for the same reason, but seenIdsRef holds session memory from
  // *before* the filter was added, so it must be gated here too.
  const mutedCandidates = new Set<string>();
  if (!hasExplicitFilters) {
    for (const id of seenIdsRef.current) mutedCandidates.add(id);
    for (const id of completedExtraIds) mutedCandidates.add(id);
  }
  const alreadyInList = new Set(issueList.map((i) => i.id));
  for (const id of mutedCandidates) {
    if (alreadyInList.has(id)) continue;
    const it = issueMap?.[id];
    if (!it) continue;
    if (stateGroupOf(it) !== "completed") continue;
    issueList.push(it);
  }
  // Set of issue ids that should render with the muted "done" treatment.
  const completedIds = new Set<string>();
  for (const it of issueList) {
    if (stateGroupOf(it) === "completed") completedIds.add(it.id);
  }

  const days: Date[] = useMemo(() => {
    if (viewMode === "day") {
      const d = new Date(dayAnchor);
      d.setHours(0, 0, 0, 0);
      return [d];
    }
    const all = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
    return showWeekends ? all : all.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  }, [viewMode, weekStart, showWeekends, dayAnchor]);

  // Grid template columns: fixed time gutter + N day columns.
  const gridTemplateColumns = `60px repeat(${days.length}, minmax(0, 1fr))`;

  const parsed = issueList.flatMap((it) => parseIssueTimes(it).map((t) => ({ it, t })));
  const dayLoads = computeDayLoads(issueList, days, weighIssue, completedIds);

  const dayLabel = (d: Date) => d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
  const weekLabel = `${weekStart.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${weekEnd.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`;
  const monthLabel = monthAnchor.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const dayHeaderLabel = dayAnchor.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // CSS `capitalize` upper-cases every word, which turns the Russian
  // "понедельник, 24 августа 2026 г." into "Понедельник, 24 Августа 2026 Г.".
  // Russian capitalises the first letter of the phrase only.
  const headerTitle = capitalizeFirstLetter(
    viewMode === "week" ? weekLabel : viewMode === "month" ? monthLabel : dayHeaderLabel
  );

  const goPrev = () => {
    if (viewMode === "day") setDayAnchor(shiftDays(dayAnchor, -1));
    else if (viewMode === "week") setWeekStart(shiftDays(weekStart, -7));
    else setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1));
  };
  const goNext = () => {
    if (viewMode === "day") setDayAnchor(shiftDays(dayAnchor, 1));
    else if (viewMode === "week") setWeekStart(shiftDays(weekStart, 7));
    else setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1));
  };
  const goToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (viewMode === "day") setDayAnchor(today);
    else if (viewMode === "week") setWeekStart(getWeekStart(new Date()));
    else setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const isLoading = (issues as { loader?: string }).loader === "init-loader";

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!scrollRef.current) return;
      const nowHour = new Date().getHours();
      const target = Math.max(0, (nowHour - 2) * hourPx);
      scrollRef.current.scrollTop = target;
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Measure actual all-day row height + top offset (relative to sticky wrapper)
  // so multi-day strips line up exactly with the first per-day pill below.
  useLayoutEffect(() => {
    const el = alldayProbeRef.current;
    const wrap = stickyWrapRef.current;
    if (!el || !wrap) return;
    const update = () => {
      setAlldayHeight(Math.max(ALLDAY_ROW_PX, el.offsetHeight));
      const elBox = el.getBoundingClientRect();
      const wrapBox = wrap.getBoundingClientRect();
      setAlldayTop(elBox.top - wrapBox.top);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [viewMode]);

  // Measure actual pixel offset of the first hour row relative to grid top.
  // Avoids 1-2px drift from border rendering / box-model quirks.
  useLayoutEffect(() => {
    const anchor = hourAnchorRef.current;
    const grid = gridRef.current;
    if (!anchor || !grid) return;
    const update = () => {
      const a = anchor.getBoundingClientRect();
      const g = grid.getBoundingClientRect();
      setHourGridTop(a.top - g.top);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [alldayHeight, viewMode]);

  // Wheel-snap: each wheel tick scrolls by exactly 2 hours, aligned to a
  // 2-hour grid line. Native wheel scroll uses pixel deltas (~100-120px)
  // that don't match HOUR_PX (60px), causing visual drift between the
  // all-day row and time grid.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel < 80) return;
      lastWheel = now;
      const dir = Math.sign(e.deltaY);
      const STEP = 2 * hourPx;
      const max = sc.scrollHeight - sc.clientHeight;
      if (max <= 0) return; // grid fits in viewport, nothing to scroll
      const aligned = Math.round(sc.scrollTop / STEP) * STEP;
      const target = Math.max(0, Math.min(max, aligned + dir * STEP));
      sc.scrollTo({ top: target, behavior: "smooth" });
    };
    sc.addEventListener("wheel", onWheel, { passive: false });
    return () => sc.removeEventListener("wheel", onWheel);
  }, [hourPx]);

  // Adapt hour height to viewport. Two constraints we must satisfy
  // SIMULTANEOUSLY for both intermediate and max-scroll positions to align
  // the all-day row with the 2-hour grid lines:
  //   (1) hourPx × devicePixelRatio must be an integer (no per-row
  //       rendering drift at non-100% browser zoom).
  //   (2) max-scroll must be a multiple of 2 × hourPx (so the LAST scroll
  //       step also lands on a 2-hour line, not just intermediate ones).
  //
  // We pick the largest n (= 2-hour rows visible at once) such that hourPx
  // stays ≥ HOUR_PX_MIN, then dpr-snap hourPx down to the nearest device
  // pixel, then compute the small leftover pad needed to make max-scroll a
  // clean multiple of 2 × hourPx. The pad becomes empty space below the
  // 24:00 closing line (typically 0–20 px).
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const update = () => {
      const visible = sc.clientHeight - hourGridTop;
      if (visible < 2 * HOUR_PX_MIN) {
        setHourPx(HOUR_PX_MIN);
        setGridBottomPad(0);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const n = Math.min(12, Math.floor(visible / (2 * HOUR_PX_MIN)));
      const rawCss = visible / (2 * n);
      const m = Math.floor(rawCss * dpr);
      const hourPx = m / dpr;
      setHourPx(hourPx);
      const STEP = 2 * hourPx;
      const pad = ((visible % STEP) + STEP) % STEP;
      setGridBottomPad(pad);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(sc);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [hourGridTop, viewMode]);

  // Clean up active drag listeners if component unmounts mid-drag
  useEffect(
    () => () => {
      const d = dragRef.current;
      if (d) {
        window.removeEventListener("pointermove", d.moveHandler);
        window.removeEventListener("pointerup", d.upHandler);
        window.removeEventListener("pointercancel", d.upHandler);
        dragRef.current = null;
      }
      document.getElementById("calendar-week-drag-cursor")?.remove();
    },
    []
  );

  const isThisWeek = now >= weekStart && now <= weekEnd;
  const nowOffsetPx = isThisWeek ? now.getHours() * hourPx + (now.getMinutes() / 60) * hourPx : null;
  const nowDayIndex = isThisWeek ? days.findIndex((d) => d.toDateString() === now.toDateString()) : -1;

  // ── Drag / resize (element-scoped pointer events) ─────────────────────────

  const getColumnWidth = useCallback((): number => {
    const w = gridRef.current?.offsetWidth ?? 900;
    const N = Math.max(1, days.length);
    return (w - 60) / N;
  }, [days.length]);

  const clampTime = (d: Date): Date => {
    const x = new Date(d);
    const mins = x.getHours() * 60 + x.getMinutes();
    const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
    x.setHours(Math.floor(clamped / 60), clamped % 60, 0, 0);
    return x;
  };

  const commitDrag = async (d: DragInfo) => {
    const issue = issueList.find((i) => i.id === d.issueId);
    if (!issue || !issue.project_id) return;

    const newDay = days[d.current.dayIndex];
    const payload: Partial<TIssue> = {};

    if (d.sourceKind === "allday") {
      // From all-day row → either converting to timed, or moved to another day (still all-day).
      if (d.current.inTimeZone) {
        payload.target_date = toPayloadDate(newDay);
        payload.start_date = toPayloadDate(newDay);
        payload.start_time = toPayloadTime(d.current.start);
        payload.target_time = toPayloadTime(d.current.end);
      } else if (d.current.dayIndex !== d.origDayIndex) {
        payload.target_date = toPayloadDate(newDay);
      } else {
        return;
      }
    } else {
      const changed =
        d.current.start.getTime() !== d.origStart.getTime() ||
        d.current.end.getTime() !== d.origEnd.getTime() ||
        d.current.dayIndex !== d.origDayIndex;
      if (!changed) return;

      if (d.isPoint && d.kind === "move") {
        // Moving a duration-less task only relocates its deadline.
        payload.target_date = toPayloadDate(newDay);
        payload.target_time = toPayloadTime(d.current.end);
      } else {
        payload.target_date = toPayloadDate(newDay);
        payload.start_date = toPayloadDate(newDay);
        payload.start_time = toPayloadTime(d.current.start);
        payload.target_time = toPayloadTime(d.current.end);
      }
    }
    try {
      await updateIssue?.(issue.project_id, issue.id, payload);
    } catch (err) {
      console.error("[calendar-week] updateIssue failed", err);
    }
  };

  const handlePointerDown = (kind: DragKind, issue: TIssue, t: CardTime, ev: React.PointerEvent<HTMLElement>) => {
    // Point pills CAN be resized: dragging their edge is how a task with no
    // duration gets one, exactly like stretching a 0-length event in Google
    // Calendar. All-day rows stay move-only — they have no hour geometry to
    // resize against.
    if (kind !== "move" && t.kind === "allday") return;
    if (ev.button !== 0) return;
    // Defensive: clear any stale drag state (e.g. if an earlier pointerup was missed).
    if (dragRef.current) {
      const stale = dragRef.current;
      try {
        window.removeEventListener("pointermove", stale.moveHandler);
        window.removeEventListener("pointerup", stale.upHandler);
        window.removeEventListener("pointercancel", stale.upHandler);
      } catch {
        /* ignore */
      }
      dragRef.current = null;
    }

    let start: Date;
    let end: Date;
    if (t.kind === "block") {
      start = t.start;
      end = t.end;
    } else if (t.kind === "point") {
      start = t.at;
      end = t.at;
    } else {
      // allday: synthetic 9:00-10:00 so drag math has something to work with
      start = new Date(t.day);
      start.setHours(9, 0, 0, 0);
      end = new Date(t.day);
      end.setHours(10, 0, 0, 0);
    }
    const dayIdx = days.findIndex((d) => d.toDateString() === t.day.toDateString());
    if (dayIdx < 0) return;
    const sourceKind: SourceKind = t.kind;

    ev.preventDefault();
    ev.stopPropagation();

    // Build per-drag handlers (stable refs via closure)
    const pointerStart = { x: ev.clientX, y: ev.clientY };
    const startDate = start;
    const endDate = end;
    const origDayIndex = dayIdx;
    const isPoint = t.kind === "point";
    const draggedId = issue.id;
    const dragKind = kind;

    const moveHandler = (mEv: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.issueId !== draggedId || d.pointerId !== mEv.pointerId) return;
      const dx = mEv.clientX - pointerStart.x;
      const dy = mEv.clientY - pointerStart.y;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (!d.moved) {
        // Force the drag cursor everywhere — body.style.cursor alone is
        // overridden by per-element cursor classes (cursor-pointer on the card).
        // Resizing keeps the ns-resize cursor, as Google Calendar does; only a
        // move shows the move cursor.
        const dragCursor = kind === "move" ? "move" : "ns-resize";
        let styleEl = document.getElementById("calendar-week-drag-cursor") as HTMLStyleElement | null;
        if (!styleEl) {
          styleEl = document.createElement("style");
          styleEl.id = "calendar-week-drag-cursor";
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = `*, *::before, *::after { cursor: ${dragCursor} !important; }`;
      }
      d.moved = true;

      const colW = getColumnWidth();

      if (sourceKind === "allday") {
        // All-day source: position from absolute pointer coords inside gridRef.
        // gridRef.getBoundingClientRect() already accounts for scroll position
        // (rect.top moves up as the user scrolls down), so DO NOT add scrollTop —
        // doing so double-counts the scroll and the ghost block jumps far below
        // the cursor.
        const grid = gridRef.current;
        if (grid) {
          const g = grid.getBoundingClientRect();
          const curX = mEv.clientX - g.left;
          const curY = mEv.clientY - g.top;
          let newDayIdx = Math.floor((curX - 60) / colW);
          const maxIdx = Math.max(0, days.length - 1);
          if (newDayIdx < 0) newDayIdx = 0;
          if (newDayIdx > maxIdx) newDayIdx = maxIdx;
          const targetDay = days[newDayIdx];

          if (curY < hourGridTop) {
            // still in all-day zone
            const sd = new Date(targetDay);
            sd.setHours(9, 0, 0, 0);
            const ed = new Date(targetDay);
            ed.setHours(10, 0, 0, 0);
            d.current = { start: sd, end: ed, dayIndex: newDayIdx, inTimeZone: false };
          } else {
            // dropped into hour grid — compute time from Y
            const minsFromTop = (curY - hourGridTop) / pxPerMin;
            let snapMin = snap(minsFromTop);
            if (snapMin < 0) snapMin = 0;
            const maxStart = 24 * 60 - DEFAULT_DURATION_MIN;
            if (snapMin > maxStart) snapMin = maxStart;
            const sd = new Date(targetDay);
            sd.setHours(Math.floor(snapMin / 60), snapMin % 60, 0, 0);
            const ed = new Date(sd.getTime() + DEFAULT_DURATION_MIN * 60_000);
            d.current = { start: sd, end: ed, dayIndex: newDayIdx, inTimeZone: true };
          }
        }
        forceRender();
        return;
      }

      const deltaMin = snap(dy / pxPerMin);
      const deltaDays = Math.round(dx / colW);

      if (dragKind === "move") {
        const newDayIdx = Math.max(0, Math.min(6, origDayIndex + deltaDays));
        const dayShift = newDayIdx - origDayIndex;
        const rawStart = shiftDays(addMinutes(startDate, deltaMin), dayShift);
        const rawEnd = shiftDays(addMinutes(endDate, deltaMin), dayShift);
        let sd = clampTime(rawStart);
        const durMs = rawEnd.getTime() - rawStart.getTime();
        const endMax = new Date(sd);
        endMax.setHours(23, 59, 0, 0);
        if (sd.getTime() + durMs > endMax.getTime()) {
          sd = new Date(endMax.getTime() - durMs);
        }
        const ed = new Date(sd.getTime() + durMs);
        d.current = { start: sd, end: ed, dayIndex: newDayIdx, inTimeZone: true };
      } else if (dragKind === "resize-top") {
        let ns = clampTime(addMinutes(startDate, deltaMin));
        if (ns.getTime() >= endDate.getTime()) {
          ns = new Date(endDate.getTime() - SNAP_MIN * 60_000);
        }
        d.current = { start: ns, end: endDate, dayIndex: origDayIndex, inTimeZone: true };
      } else if (dragKind === "resize-bottom") {
        let ne = clampTime(addMinutes(endDate, deltaMin));
        if (ne.getTime() <= startDate.getTime()) {
          ne = new Date(startDate.getTime() + SNAP_MIN * 60_000);
        }
        d.current = { start: startDate, end: ne, dayIndex: origDayIndex, inTimeZone: true };
      }
      forceRender();
    };

    const upHandler = (uEv: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.issueId !== draggedId) return;
      window.removeEventListener("pointermove", moveHandler);
      window.removeEventListener("pointerup", upHandler);
      window.removeEventListener("pointercancel", upHandler);
      document.body.style.cursor = "";
      document.getElementById("calendar-week-drag-cursor")?.remove();
      dragRef.current = null;
      if (d.moved) {
        justDraggedRef.current = true;
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 250);
        void commitDrag(d);
      }
      forceRender();
    };

    dragRef.current = {
      kind,
      sourceKind,
      issueId: issue.id,
      isPoint,
      pointerId: ev.pointerId,
      pointerStart,
      origStart: start,
      origEnd: end,
      origDayIndex: dayIdx,
      current: { start, end, dayIndex: dayIdx, inTimeZone: sourceKind !== "allday" },
      moved: false,
      moveHandler,
      upHandler,
    };
    window.addEventListener("pointermove", moveHandler);
    window.addEventListener("pointerup", upHandler);
    window.addEventListener("pointercancel", upHandler);
    forceRender();
  };

  const handleCardClick = (issue: TIssue) => {
    if (justDraggedRef.current) return;
    if (workspaceSlug) handleRedirection(String(workspaceSlug), issue, isMobile);
  };

  const drag = dragRef.current;

  // ── Card geometry helpers ────────────────────────────────────────────────

  type Layout = { col: number; numCols: number; span: number };
  const DEFAULT_LAYOUT: Layout = { col: 0, numCols: 1, span: 1 };

  // Google-Calendar-style overlap layout: events that share time get split
  // into N columns; each event spans as many adjacent right-side columns as
  // are free of overlapping events. Computed per day, keyed by issue id.
  const dayLayouts: Record<string, Map<string, Layout>> = {};
  for (const day of days) {
    const dayKey = day.toDateString();
    const items = parsed
      .filter(({ t }) => (t.kind === "block" || t.kind === "point") && t.day.toDateString() === dayKey)
      .map(({ it, t }) => {
        if (t.kind === "block") {
          return { id: it.id, start: t.start.getTime(), end: t.end.getTime() };
        }
        // point — give it a 30-min footprint for overlap math
        const m = (t as { at: Date }).at.getTime();
        return { id: it.id, start: m - 15 * 60_000, end: m + 15 * 60_000 };
      })
      .sort((a, b) => a.start - b.start || b.end - a.end);
    if (!items.length) continue;

    // Cluster by transitive overlap
    const clusters: (typeof items)[] = [];
    let current: typeof items = [items[0]];
    let clusterEnd = items[0].end;
    for (let i = 1; i < items.length; i++) {
      if (items[i].start >= clusterEnd) {
        clusters.push(current);
        current = [items[i]];
        clusterEnd = items[i].end;
      } else {
        current.push(items[i]);
        clusterEnd = Math.max(clusterEnd, items[i].end);
      }
    }
    clusters.push(current);

    const map = new Map<string, Layout>();
    for (const cl of clusters) {
      // Greedy column packing
      const cols: { lastEnd: number; events: typeof cl }[] = [];
      const colOf = new Map<string, number>();
      for (const ev of cl) {
        let placed = false;
        for (let c = 0; c < cols.length; c++) {
          if (cols[c].lastEnd <= ev.start) {
            cols[c].lastEnd = ev.end;
            cols[c].events.push(ev);
            colOf.set(ev.id, c);
            placed = true;
            break;
          }
        }
        if (!placed) {
          colOf.set(ev.id, cols.length);
          cols.push({ lastEnd: ev.end, events: [ev] });
        }
      }
      const numCols = cols.length;
      for (const ev of cl) {
        const col = colOf.get(ev.id)!;
        // Span: extend right while no overlap
        let span = 1;
        for (let c = col + 1; c < numCols; c++) {
          const blocks = cols[c].events.some((o) => o.start < ev.end && ev.start < o.end);
          if (blocks) break;
          span++;
        }
        map.set(ev.id, { col, numCols, span });
      }
    }
    dayLayouts[dayKey] = map;
  }

  // ── Multi-day strips (rendered in all-day row, span days) ───────────────
  // Strip pills share height with single-day all-day pills so the row stays
  // visually uniform.
  const STRIP_HEIGHT = 16;
  const STRIP_GAP = 2;
  // True week boundaries (Sun..Sat) for visibility checks — independent of
  // whether the user toggled weekends off.
  const weekStartMs = weekStart.getTime();
  const weekEndOfWeek = new Date(weekStart);
  weekEndOfWeek.setDate(weekEndOfWeek.getDate() + 6);
  const weekEndMs = weekEndOfWeek.getTime();
  type StripData = {
    it: TIssue;
    m: MultiDayCard;
    startIdx: number;
    endIdx: number;
    continuesLeft: boolean;
    continuesRight: boolean;
    lane: number;
  };
  const multiDayStripsRaw = parsed
    .filter(({ t }) => t.kind === "multiday")
    .map(({ it, t }) => {
      const m = t as MultiDayCard;
      if (m.endDay.getTime() < weekStartMs || m.startDay.getTime() > weekEndMs) return null;
      // Map to indices inside the (possibly weekend-filtered) `days` array.
      let startIdx = -1;
      let endIdx = -1;
      for (let i = 0; i < days.length; i++) {
        const t0 = days[i].getTime();
        if (t0 >= m.startDay.getTime() && t0 <= m.endDay.getTime()) {
          if (startIdx === -1) startIdx = i;
          endIdx = i;
        }
      }
      if (startIdx === -1 || endIdx === -1) return null;
      const continuesLeft =
        m.startDay.getTime() < weekStartMs || (days.length > 0 && m.startDay.getTime() < days[0].getTime());
      const continuesRight =
        m.endDay.getTime() > weekEndMs || (days.length > 0 && m.endDay.getTime() > days[days.length - 1].getTime());
      return { it, m, startIdx, endIdx, continuesLeft, continuesRight };
    })
    .filter(
      (
        x
      ): x is {
        it: TIssue;
        m: MultiDayCard;
        startIdx: number;
        endIdx: number;
        continuesLeft: boolean;
        continuesRight: boolean;
      } => !!x
    )
    .sort((a, b) => a.startIdx - b.startIdx || b.endIdx - a.endIdx);

  // Lane assignment — strips that overlap horizontally get stacked vertically
  const laneEnds: number[] = [];
  const multiDayStrips: StripData[] = [];
  for (const s of multiDayStripsRaw) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= s.startIdx) lane++;
    laneEnds[lane] = s.endIdx;
    multiDayStrips.push({ ...s, lane });
  }
  const stripsAreaHeight = multiDayStrips.length > 0 ? laneEnds.length * (STRIP_HEIGHT + STRIP_GAP) : 0;

  // Per-day padding: only days that have strip-lanes above need padding.
  // Days without strips above keep their pills at the top of the all-day cell.
  const stripPadForDay = (dayIdx: number): number => {
    if (multiDayStrips.length === 0) return 0;
    let maxLane = -1;
    for (const s of multiDayStrips) {
      if (s.startIdx <= dayIdx && dayIdx <= s.endIdx) {
        if (s.lane > maxLane) maxLane = s.lane;
      }
    }
    return maxLane >= 0 ? (maxLane + 1) * (STRIP_HEIGHT + STRIP_GAP) : 0;
  };

  const dayColumnStyle = (dayIdx: number, layout: Layout = DEFAULT_LAYOUT) => {
    const { col, numCols, span } = layout;
    const N = days.length;
    return {
      left: `calc(60px + (100% - 60px) / ${N} * ${dayIdx} + (100% - 60px) / ${N} * ${col} / ${numCols} + 1px)`,
      width: `calc((100% - 60px) / ${N} * ${span} / ${numCols} - 2px)`,
    };
  };

  const gridTopOffset = hourGridTop;

  const blockStyle = (start: Date, end: Date, dayIdx: number, layout: Layout = DEFAULT_LAYOUT): React.CSSProperties => {
    const startMin = start.getHours() * 60 + start.getMinutes();
    const topPx = gridTopOffset + startMin * pxPerMin;
    const durationMin = Math.max(SNAP_MIN, (end.getTime() - start.getTime()) / 60_000);
    const heightPx = Math.max(22, durationMin * pxPerMin - BLOCK_BOTTOM_GAP_PX);
    return { top: topPx, height: heightPx, touchAction: "none", ...dayColumnStyle(dayIdx, layout) };
  };

  const pointStyle = (at: Date, dayIdx: number, layout: Layout = DEFAULT_LAYOUT): React.CSSProperties => {
    // Forward semantics (TickTick-style): the time anchors the TOP of the
    // pill, not its center. The pill represents "starts at T (no duration)".
    const atMin = at.getHours() * 60 + at.getMinutes();
    const topPx = gridTopOffset + atMin * pxPerMin;
    return { top: topPx, height: POINT_PILL_HEIGHT, touchAction: "none", ...dayColumnStyle(dayIdx, layout) };
  };

  // ── UI ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      {embedded ? (
        // Planner mini-header: just date + arrows, no Опции, no task counter.
        <div className="text-xs flex items-center justify-between border-b border-subtle-1 px-3 py-1.5">
          <div className="flex gap-1">
            <button onClick={goPrev} className="rounded px-1.5 py-0.5 hover:bg-layer-transparent-hover">
              ‹
            </button>
            <button onClick={goToday} className="rounded px-1.5 py-0.5 hover:bg-layer-transparent-hover">
              Сегодня
            </button>
            <button onClick={goNext} className="rounded px-1.5 py-0.5 hover:bg-layer-transparent-hover">
              ›
            </button>
          </div>
          <div className="truncate font-medium">{headerTitle}</div>
        </div>
      ) : (
        <div className="text-sm flex items-center justify-between border-b border-subtle-1 px-4 py-2">
          <div className="flex gap-2">
            <button onClick={goPrev} className="rounded px-2 py-1 hover:bg-layer-transparent-hover">
              ‹
            </button>
            <button onClick={goToday} className="rounded px-2 py-1 hover:bg-layer-transparent-hover">
              Сегодня
            </button>
            <button onClick={goNext} className="rounded px-2 py-1 hover:bg-layer-transparent-hover">
              ›
            </button>
          </div>
          <div className="font-medium">{headerTitle}</div>
          <CalendarWeekOptions
            viewMode={viewMode}
            onSwitchToWeek={handleSwitchToWeek}
            onSwitchToMonth={handleSwitchToMonth}
            onSwitchToDay={handleSwitchToDay}
            showWeekends={showWeekends}
            onToggleWeekends={handleToggleShowWeekends}
            showDistributePanel={showDistributePanel}
            onToggleDistributePanel={handleToggleDistributePanel}
            // Distribute panel works in two modes: single-project (fetches
            // unscheduled via IssueService) and profile / Ваша работа (fetches
            // via UserService with the active role filter). Inside the panel
            // the assignee chooser hides when there's no project scope —
            // profile views already constrain by user.
            enableDistributePanel={Boolean(projectId) || Boolean(profileViewId && userIdParam)}
            taskCount={issueList.length}
          />
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col" style={{ display: viewMode === "month" ? "flex" : "none" }}>
            <MonthGrid
              monthAnchor={monthAnchor}
              showWeekends={showWeekends}
              issueList={issueList}
              getCalColor={getCalColor}
              onCardClick={(it) => handleCardClick(it)}
              updateIssue={updateIssue}
              completedIds={completedIds}
            />
          </div>

          <div
            ref={scrollRef}
            className="relative min-h-0 flex-1 overflow-auto pr-3"
            // Day mode reuses the same hour-grid as week mode (one column instead
            // of seven). Only month renders a different component.
            style={{ display: viewMode === "month" ? "none" : "block" }}
          >
            <div
              ref={gridRef}
              // Day view uses a tighter min-width so a single column fills the
              // viewport without horizontal scroll on narrow screens.
              className={`relative ${viewMode === "day" ? "min-w-[300px]" : "min-w-[900px]"}`}
              style={{ paddingBottom: `${gridBottomPad}px` }}
            >
              {/* Sticky wrapper — header + all-day rows stay pinned as a single block */}
              <div ref={stickyWrapRef} className="relative sticky top-0 z-20 w-full bg-surface-1">
                <div className="grid w-full" style={{ gridTemplateColumns: gridTemplateColumns }}>
                  {/* Day-header row */}
                  <div className="bg-surface-1" style={{ minHeight: HEADER_PX }} />
                  {days.map((d) => {
                    const isToday = d.toDateString() === now.toDateString();
                    return (
                      <div
                        key={d.toISOString()}
                        className={`text-xs border-b border-l border-subtle-1 bg-surface-1 px-2 py-1 text-center font-medium ${
                          isToday
                            ? "relative font-semibold text-accent-primary before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-accent-primary/10"
                            : ""
                        }`}
                        style={{ minHeight: HEADER_PX }}
                      >
                        {dayLabel(d)}
                        <DayLoadBadge total={dayLoads.get(d.toDateString()) ?? 0} />
                      </div>
                    );
                  })}
                  {/* All-day row */}
                  <div
                    ref={alldayProbeRef}
                    className="border-b border-subtle-1 bg-surface-1 px-1 py-0.5 text-right text-[10px] text-tertiary"
                    style={{ minHeight: ALLDAY_ROW_PX }}
                  >
                    весь день
                  </div>
                  {days.map((d, dayIdx) => {
                    const dayKey = d.toDateString();
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const dayPad = stripPadForDay(dayIdx);
                    const alldays = parsed.filter(({ t }) => t.kind === "allday" && t.day.toDateString() === dayKey);
                    // Multi-day strips that pass over this day occupy slots too —
                    // they count toward the ALLDAY_MAX_VISIBLE budget.
                    const stripsOnDay = multiDayStrips.filter((s) => s.startIdx <= dayIdx && s.endIdx >= dayIdx).length;
                    const effectiveCap = Math.max(0, ALLDAY_MAX_VISIBLE - stripsOnDay);
                    return (
                      <AllDayCell
                        key={`allday-${d.toISOString()}`}
                        entries={alldays}
                        weigh={weighIssue}
                        completedIds={completedIds}
                        collapsedCap={effectiveCap}
                        expanded={expandedAllDayDays.has(dayKey)}
                        onToggleExpand={() => toggleAllDayExpand(dayKey)}
                        minHeightPx={ALLDAY_ROW_PX}
                        maxHeightPx={alldayCapPx}
                        paddingTopPx={dayPad}
                        rowHeightPx={STRIP_HEIGHT}
                        isWeekend={isWeekend}
                        renderCard={({ it, t }) => {
                          const isDraggingThis = drag?.issueId === it.id && drag.moved;
                          const calColor = getCalColor(it);
                          const useCalColor = calColor !== null;
                          const surface = useCalColor ? calSurface(calColor!) : null;
                          const muted = completedIds.has(it.id);
                          return (
                            <div
                              key={`${it.id}-${dayKey}`}
                              data-cw-issue-id={it.id}
                              draggable={false}
                              onDragStart={(e) => e.preventDefault()}
                              className={`group flex w-full items-center gap-1 rounded px-1 text-[10px] ${
                                useCalColor ? "" : "text-secondary"
                              } ${isDraggingThis ? "opacity-40" : ""} ${muted ? "opacity-50 grayscale" : ""} ${
                                useCalColor
                                  ? ""
                                  : isDraggingThis
                                    ? "bg-accent-primary/30"
                                    : "bg-accent-primary/20 hover:bg-accent-primary/30"
                              }`}
                              style={{
                                touchAction: "none",
                                height: STRIP_HEIGHT,
                                lineHeight: `${STRIP_HEIGHT}px`,
                                backgroundColor: surface?.bg,
                                color: surface?.fg,
                              }}
                              onMouseEnter={(e) => {
                                if (surface && !isDraggingThis)
                                  (e.currentTarget as HTMLElement).style.backgroundColor = surface.hoverBg;
                              }}
                              onMouseLeave={(e) => {
                                if (surface && !isDraggingThis)
                                  (e.currentTarget as HTMLElement).style.backgroundColor = surface.bg;
                              }}
                              title={it.name ?? ""}
                              onPointerDown={(ev) => handlePointerDown("move", it, t, ev)}
                              onClick={() => handleCardClick(it)}
                            >
                              <CompleteCheckbox issue={it} updateIssue={updateIssue} size="xs" />
                              <span
                                className={`min-w-0 flex-1 cursor-pointer truncate select-none ${muted ? "line-through" : ""}`}
                              >
                                {stripTimeNotation(it.name ?? "")}
                              </span>
                            </div>
                          );
                        }}
                      />
                    );
                  })}
                </div>
                {/* Multi-day strips overlay — span across day columns inside the
                all-day row. Each strip is one continuous bar from start day
                to end day, with optional time annotation. */}
                {multiDayStrips.length > 0 && (
                  <div
                    className="pointer-events-none absolute inset-x-0"
                    style={{ top: alldayTop + 2, height: stripsAreaHeight }}
                  >
                    {multiDayStrips.map(({ it, m, startIdx, endIdx, lane, continuesLeft, continuesRight }) => {
                      // No outer side-gap when the strip continues into next/prev
                      // week — arrow tip should reach the column edge cleanly.
                      const leftOff = continuesLeft ? 0 : 1;
                      const widthSub = (continuesLeft ? 0 : 1) + (continuesRight ? 0 : 1);
                      const left = `calc(60px + (100% - 60px) / ${days.length} * ${startIdx} + ${leftOff}px)`;
                      const width = `calc((100% - 60px) / ${days.length} * ${endIdx - startIdx + 1} - ${widthSub}px)`;
                      const top = lane * (STRIP_HEIGHT + STRIP_GAP);
                      const tt = m.targetTime ? m.targetTime.slice(0, 5) : null;
                      const st = m.startTime ? m.startTime.slice(0, 5) : null;
                      let suffix = "";
                      if (st && tt) suffix = ` · ${st}–${tt}`;
                      else if (tt) suffix = ` · до ${tt}`;
                      else if (st) suffix = ` · с ${st}`;

                      // Google-Calendar-style arrow ends on week-boundary crossings.
                      const ARROW = 6;
                      let clipPath: string | undefined;
                      let borderRadius: string | undefined = "3px";
                      if (continuesLeft && continuesRight) {
                        clipPath = `polygon(${ARROW}px 0, calc(100% - ${ARROW}px) 0, 100% 50%, calc(100% - ${ARROW}px) 100%, ${ARROW}px 100%, 0 50%)`;
                        borderRadius = undefined;
                      } else if (continuesRight) {
                        clipPath = `polygon(0 0, calc(100% - ${ARROW}px) 0, 100% 50%, calc(100% - ${ARROW}px) 100%, 0 100%)`;
                        borderRadius = "3px 0 0 3px";
                      } else if (continuesLeft) {
                        clipPath = `polygon(${ARROW}px 0, 100% 0, 100% 100%, ${ARROW}px 100%, 0 50%)`;
                        borderRadius = "0 3px 3px 0";
                      }
                      const padLeft = continuesLeft ? ARROW + 4 : 4;
                      const padRight = continuesRight ? ARROW + 4 : 4;
                      const calColor = getCalColor(it);
                      const muted = completedIds.has(it.id);
                      return (
                        <div
                          key={it.id}
                          data-cw-issue-id={it.id}
                          className={`group pointer-events-auto absolute cursor-pointer overflow-hidden bg-surface-1 ${muted ? "opacity-50 grayscale" : ""}`}
                          style={{ left, width, top, height: STRIP_HEIGHT, clipPath, borderRadius }}
                          title={it.name ?? ""}
                          onClick={() => handleCardClick(it)}
                        >
                          {/* Solid fill — hides grid lines under the strip. */}
                          {calColor ? (
                            <>
                              <div className="absolute inset-0" style={{ backgroundColor: calSurface(calColor).bg }} />
                              <div
                                className="absolute inset-0 opacity-0 group-hover:opacity-100"
                                style={{ backgroundColor: calSurface(calColor).hoverBg }}
                              />
                            </>
                          ) : (
                            <div className="absolute inset-0 bg-accent-primary/20 group-hover:bg-accent-primary/30" />
                          )}
                          <div
                            className={`relative truncate text-[11px] ${calColor ? "" : "text-secondary"} ${muted ? "line-through" : ""}`}
                            style={{
                              paddingLeft: padLeft,
                              paddingRight: padRight,
                              lineHeight: `${STRIP_HEIGHT}px`,
                              color: calColor ? calSurface(calColor).fg : undefined,
                            }}
                          >
                            {stripTimeNotation(it.name ?? "")}
                            {suffix}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Hour rows grid — below the sticky wrapper.
              Use explicit gridTemplateRows so all 24 rows are sized in a single
              layout pass — avoids per-cell rounding drift from fractional
              hourPx that caused intermittent ~1-2 px misalignment between the
              all-day row and the time-grid lines. */}
              <div
                className="grid w-full"
                style={{
                  gridTemplateColumns: gridTemplateColumns,
                  gridTemplateRows: `repeat(24, ${hourPx}px)`,
                }}
              >
                {HOURS.map((h) => {
                  const isLast = h === 23;
                  return (
                    <div key={`row-${h}`} className="contents">
                      <div
                        ref={h === 0 ? hourAnchorRef : undefined}
                        className={`border-t ${isLast ? "border-b" : ""} border-subtle-1 px-1 py-0.5 text-right text-[10px] text-tertiary`}
                      >
                        {String(h).padStart(2, "0")}:00
                      </div>
                      {days.map((d) => {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <div
                            key={`${d.toISOString()}-${h}`}
                            className={`border-t border-l ${isLast ? "border-b" : ""} border-subtle-1 ${isWeekend ? "bg-surface-2" : ""}`}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Cards overlay — absolute within grid, above slot borders */}
              {parsed.map(({ it, t }) => {
                if (t.kind === "allday" || t.kind === "multiday") return null;
                const dayIdx = days.findIndex((d) => d.toDateString() === t.day.toDateString());
                if (dayIdx < 0) return null;
                const isDragging = drag?.issueId === it.id && drag.moved;
                const layout = dayLayouts[t.day.toDateString()]?.get(it.id) ?? DEFAULT_LAYOUT;

                if (t.kind === "block") {
                  const start = isDragging ? drag!.current.start : t.start;
                  const end = isDragging ? drag!.current.end : t.end;
                  const dayIdxEff = isDragging ? drag!.current.dayIndex : dayIdx;
                  const isMultiDay = !!t.multiDay;
                  // Under ~30 minutes the block is barely taller than one line,
                  // so there is no room for a top inset — centre instead.
                  const isShortBlock = (end.getTime() - start.getTime()) / 60_000 < 30;
                  const calColor = getCalColor(it);
                  const muted = completedIds.has(it.id);
                  return (
                    <div
                      key={`${it.id}-${t.day.toDateString()}`}
                      data-cw-issue-id={it.id}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      className={`group absolute z-10 overflow-hidden rounded bg-surface-1 text-[10px] ${calColor ? "" : "text-secondary"} ${isDragging ? "z-30 opacity-80 shadow-raised-200" : ""} ${muted ? "opacity-50 grayscale" : ""}`}
                      style={{
                        ...blockStyle(start, end, dayIdxEff, layout),
                        color: calColor ? calSurface(calColor).fg : undefined,
                      }}
                      title={it.name ?? ""}
                    >
                      {/* Solid tint overlay above the opaque base — hides grid lines.
                      During drag, lock the tint to the hover color so the card
                      doesn't flicker each time a snap moves the edge under the
                      pointer (briefly leaving the card → losing group-hover). */}
                      {calColor ? (
                        <>
                          <div
                            className="absolute inset-0"
                            style={{
                              backgroundColor: isDragging ? calSurface(calColor).hoverBg : calSurface(calColor).bg,
                            }}
                          />
                          {!isDragging && (
                            <div
                              className="absolute inset-0 opacity-0 group-hover:opacity-100"
                              style={{ backgroundColor: calSurface(calColor).hoverBg }}
                            />
                          )}
                        </>
                      ) : (
                        <div
                          className={`absolute inset-0 ${
                            isDragging
                              ? "bg-accent-primary/30"
                              : "bg-accent-primary/20 group-hover:bg-accent-primary/30"
                          }`}
                        />
                      )}
                      {!isMultiDay && (
                        <>
                          <div
                            className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize"
                            style={{ touchAction: "none" }}
                            onPointerDown={(ev) => handlePointerDown("resize-top", it, t, ev)}
                          />
                          <div
                            className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-ns-resize"
                            style={{ touchAction: "none" }}
                            onPointerDown={(ev) => handlePointerDown("resize-bottom", it, t, ev)}
                          />
                        </>
                      )}
                      <div
                        className={`relative flex h-full cursor-pointer flex-col px-1 leading-tight select-none ${
                          // Tall blocks read top-aligned like Google Calendar,
                          // but with breathing room instead of the text sitting
                          // on the border. Short ones have no room for that, so
                          // the single line is centred in whatever height there is.
                          isShortBlock ? "justify-center py-0" : "justify-start pt-[3px] pb-0.5"
                        }`}
                        style={{ touchAction: "none" }}
                        onPointerDown={(ev) => !isMultiDay && handlePointerDown("move", it, t, ev)}
                        onClick={() => handleCardClick(it)}
                      >
                        {(() => {
                          // Layout (Google-Calendar-style):
                          //   [checkbox] [name] ........ [time on right]
                          // For tall blocks the time is the full HH:MM–HH:MM range;
                          // for short ones (< 45 min) just the start time fits.
                          const durationMin = (end.getTime() - start.getTime()) / 60_000;
                          const timeText = durationMin < 45 ? formatHM(start) : `${formatHM(start)}–${formatHM(end)}`;
                          return (
                            <div className="flex w-full items-center gap-1 text-[10px]">
                              <CompleteCheckbox issue={it} updateIssue={updateIssue} size="xs" />
                              <span className={`min-w-0 flex-1 truncate font-medium ${muted ? "line-through" : ""}`}>
                                {stripTimeNotation(it.name ?? "")}
                              </span>
                              <span className="flex-shrink-0 text-[9px] text-tertiary">{timeText}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                }
                // point
                const at = isDragging ? drag!.current.end : t.at;
                const dayIdxEff = isDragging ? drag!.current.dayIndex : dayIdx;
                const calColor = getCalColor(it);
                const muted = completedIds.has(it.id);
                // While an edge is being dragged the pill has to grow like a real
                // block — otherwise the user pulls downwards and nothing appears
                // to happen, because a point pill has a fixed 22px height.
                const isResizingThis = isDragging && drag!.kind !== "move";
                const pillStyle = isResizingThis
                  ? blockStyle(drag!.current.start, drag!.current.end, dayIdxEff, layout)
                  : pointStyle(at, dayIdxEff, layout);
                return (
                  <div
                    key={`${it.id}-${t.day.toDateString()}`}
                    data-cw-issue-id={it.id}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    className={`group absolute z-10 flex cursor-pointer items-center gap-1 overflow-hidden rounded bg-surface-1 px-1 text-[10px] select-none ${calColor ? "" : "text-secondary"} ${isDragging ? "z-30 opacity-80 shadow-raised-200" : ""} ${muted ? "opacity-50 grayscale" : ""}`}
                    style={{
                      ...pillStyle,
                      color: calColor ? calSurface(calColor).fg : undefined,
                    }}
                    title={it.name ?? ""}
                    onPointerDown={(ev) => handlePointerDown("move", it, t, ev)}
                    onClick={() => handleCardClick(it)}
                  >
                    {calColor ? (
                      <>
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundColor: isDragging ? calSurface(calColor).hoverBg : calSurface(calColor).bg,
                          }}
                        />
                        {!isDragging && (
                          <div
                            className="absolute inset-0 opacity-0 group-hover:opacity-100"
                            style={{ backgroundColor: calSurface(calColor).hoverBg }}
                          />
                        )}
                      </>
                    ) : (
                      <div
                        className={`absolute inset-0 ${
                          isDragging ? "bg-accent-primary/30" : "bg-accent-primary/20 group-hover:bg-accent-primary/30"
                        }`}
                      />
                    )}
                    {/* Resize grips, same as on timed blocks: dragging an edge is
                        how a duration-less task gets a duration. Pulling the
                        bottom edge keeps the time as the start and extends
                        downwards; pulling the top edge keeps it as the deadline
                        and extends backwards. z-20 puts them above the tint
                        overlays so the ns-resize cursor actually shows. */}
                    <div
                      className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-ns-resize"
                      style={{ touchAction: "none" }}
                      onPointerDown={(ev) => handlePointerDown("resize-top", it, t, ev)}
                    />
                    <div
                      className="absolute inset-x-0 bottom-0 z-20 h-1.5 cursor-ns-resize"
                      style={{ touchAction: "none" }}
                      onPointerDown={(ev) => handlePointerDown("resize-bottom", it, t, ev)}
                    />
                    <span className="relative">
                      <CompleteCheckbox issue={it} updateIssue={updateIssue} size="xs" />
                    </span>
                    <span className={`relative min-w-0 flex-1 truncate font-medium ${muted ? "line-through" : ""}`}>
                      {stripTimeNotation(it.name ?? "")}
                    </span>
                    <span className="relative flex-shrink-0 text-[10px] text-tertiary">
                      {isResizingThis
                        ? `${formatHM(drag!.current.start)}–${formatHM(drag!.current.end)}`
                        : formatHM(at)}
                    </span>
                  </div>
                );
              })}

              {/* Ghost preview block when dragging an all-day task over the hour grid */}
              {drag && drag.sourceKind === "allday" && drag.moved && drag.current.inTimeZone && (
                <div
                  className="ring-accent-primary pointer-events-none absolute z-40 rounded bg-accent-primary/30 px-1 text-[11px] text-primary ring-2"
                  style={blockStyle(drag.current.start, drag.current.end, drag.current.dayIndex)}
                >
                  <div className="truncate font-medium">
                    {stripTimeNotation(issueList.find((i) => i.id === drag.issueId)?.name ?? "")}
                  </div>
                  <div className="text-[10px] text-tertiary">
                    {formatHM(drag.current.start)}–{formatHM(drag.current.end)}
                  </div>
                </div>
              )}

              {/* "Now" line */}
              {nowOffsetPx !== null && nowDayIndex >= 0 && (
                <div
                  className="pointer-events-none absolute z-[15]"
                  style={{
                    top: `${gridTopOffset + nowOffsetPx}px`,
                    left: `calc(60px + (100% - 60px) * ${nowDayIndex} / ${days.length})`,
                    width: `calc((100% - 60px) / ${days.length})`,
                    height: 2,
                  }}
                >
                  <div className="flex h-full items-center">
                    <span className="-ml-1 block h-2 w-2 rounded-full bg-danger-primary" />
                    <span className="h-0.5 flex-1 bg-danger-primary" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Right sidebar: distribute tasks. Works in single-project mode AND
          in profile mode (Ваша работа). The panel itself degrades the
          assignee filter gracefully when no project context is provided.
          NEVER rendered in embedded mode: the Planner layout already has
          a dedicated list pane on the left, the calendar is the side
          column, and there's no Опции dropdown to toggle the panel — so
          a leaked-in panel from localStorage looks like a stuck overlay. */}
        {showDistributePanel && !embedded && (projectId || (profileViewId && userIdParam)) && (
          <DistributePanel
            projectId={projectId ? String(projectId) : null}
            issues={unscheduledList}
            labelMap={labelMap}
            stateMap={stateMap}
            memberStore={member}
            getUserDetails={getUserDetails}
            getCalColor={getCalColor}
            updateIssue={updateIssue}
            labelFilter={panelLabelFilter}
            priorityFilter={panelPriorityFilter}
            stateFilter={panelStateFilter}
            assigneeFilter={panelAssigneeFilter}
            onLabelFilterChange={setPanelLabelFilter}
            onPriorityFilterChange={setPanelPriorityFilter}
            onStateFilterChange={setPanelStateFilter}
            onAssigneeFilterChange={setPanelAssigneeFilter}
            width={panelWidth}
            onWidthChange={handlePanelWidthChange}
            onClose={() => setShowDistributePanel(false)}
            onCardPointerDown={(issue, ev) => handlePanelDragStart(issue, ev)}
            onRefresh={fetchUnscheduled}
          />
        )}
      </div>
      {/* Ghost preview while dragging from panel.
          When over the grid: render a full-sized block at the snapped slot
          (top-left = snapped slot position, full column width, 1-hour height)
          so the user sees exactly where the card will land.
          When off the grid: small floating ghost at cursor (top-left = cursor). */}
      {panelDrag &&
        (() => {
          const grid = gridRef.current;
          if (panelDrag.over && grid) {
            const g = grid.getBoundingClientRect();
            const colW = (g.width - 60) / Math.max(1, days.length);
            const top = g.top + hourGridTop + panelDrag.over.minute * pxPerMin;
            const left = g.left + 60 + colW * panelDrag.over.dayIndex;
            const height = 60 * pxPerMin;
            return (
              <div
                className="border-accent-primary pointer-events-none fixed z-[100] overflow-hidden rounded border bg-accent-primary/30 px-1 py-0.5 text-[11px] leading-tight text-primary shadow-raised-200"
                style={{ left, top, width: colW - 2, height }}
              >
                <div className="line-clamp-2 font-medium">{panelDrag.issue.name ?? ""}</div>
              </div>
            );
          }
          return (
            <div
              className="pointer-events-none fixed z-[100] rounded bg-accent-primary/40 px-2 py-1 text-[11px] text-primary shadow-raised-200"
              style={{ left: panelDrag.clientX, top: panelDrag.clientY, maxWidth: 240 }}
            >
              {panelDrag.issue.name ?? ""}
            </div>
          );
        })()}
    </div>
  );
});

export default CalendarWeekLayout;

// ── Options dropdown ────────────────────────────────────────────────────────
function CalendarWeekOptions(props: {
  viewMode: "week" | "month" | "day";
  onSwitchToWeek: () => void;
  onSwitchToMonth: () => void;
  onSwitchToDay: () => void;
  showWeekends: boolean;
  onToggleWeekends: () => void;
  showDistributePanel: boolean;
  onToggleDistributePanel: () => void;
  enableDistributePanel: boolean;
  taskCount: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useOutsideClickDetector(wrapRef, () => setOpen(false));

  return (
    <div ref={wrapRef} className="relative flex items-center gap-3">
      <span className="text-xs text-tertiary">{props.taskCount} задач</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs flex items-center gap-1 rounded-sm border border-subtle-1 px-2 py-1 hover:bg-layer-transparent-hover"
      >
        Опции
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div
          data-prevent-outside-click
          className="absolute top-full right-0 z-50 mt-1 min-w-[12rem] overflow-hidden rounded-md border border-strong bg-surface-1 p-1 shadow-raised-200"
        >
          <button
            type="button"
            onClick={() => {
              props.onSwitchToMonth();
              setOpen(false);
            }}
            className="text-xs flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-secondary hover:bg-accent-primary/15 hover:text-primary"
          >
            <span className={props.viewMode === "month" ? "font-medium text-primary" : ""}>Месяц</span>
            {props.viewMode === "month" && <Check className="h-3 w-3 text-accent-primary" />}
          </button>
          <button
            type="button"
            onClick={() => {
              props.onSwitchToWeek();
              setOpen(false);
            }}
            className="text-xs flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-secondary hover:bg-accent-primary/15 hover:text-primary"
          >
            <span className={props.viewMode === "week" ? "font-medium text-primary" : ""}>Неделя</span>
            {props.viewMode === "week" && <Check className="h-3 w-3 text-accent-primary" />}
          </button>
          <button
            type="button"
            onClick={() => {
              props.onSwitchToDay();
              setOpen(false);
            }}
            className="text-xs flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-secondary hover:bg-accent-primary/15 hover:text-primary"
          >
            <span className={props.viewMode === "day" ? "font-medium text-primary" : ""}>День</span>
            {props.viewMode === "day" && <Check className="h-3 w-3 text-accent-primary" />}
          </button>
          <div className="my-1 border-t border-subtle-1" />
          <button
            type="button"
            onClick={props.onToggleWeekends}
            className="text-xs flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-secondary hover:bg-accent-primary/15 hover:text-primary"
          >
            <span>Показывать выходные</span>
            <span
              aria-hidden="true"
              className={`relative inline-block h-4 w-7 flex-shrink-0 rounded-full transition-colors ${
                props.showWeekends ? "bg-accent-primary" : "bg-layer-3"
              }`}
            >
              <span
                className={`shadow-sm absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
                  props.showWeekends ? "left-3.5" : "left-0.5"
                }`}
              />
            </span>
          </button>
          {props.enableDistributePanel && (
            <button
              type="button"
              onClick={props.onToggleDistributePanel}
              className="text-xs flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-secondary hover:bg-accent-primary/15 hover:text-primary"
            >
              <span>Распределить задачи</span>
              <span
                aria-hidden="true"
                className={`relative inline-block h-4 w-7 flex-shrink-0 rounded-full transition-colors ${
                  props.showDistributePanel ? "bg-accent-primary" : "bg-layer-3"
                }`}
              >
                <span
                  className={`shadow-sm absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
                    props.showDistributePanel ? "left-3.5" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Distribute-tasks panel (right sidebar) ──────────────────────────────────
type DistributePanelProps = {
  projectId: string | null;
  issues: TIssue[];
  labelMap: Record<string, { id: string; name: string; color: string; project_id: string } | undefined>;
  stateMap: Record<
    string,
    { id: string; name: string; color: string; group?: string; project_id?: string } | undefined
  >;
  memberStore: {
    project: {
      getProjectMemberIds: (projectId: string, includeGuestUsers: boolean) => string[] | null;
    };
  };
  getUserDetails: (
    userId: string
  ) => { id?: string; display_name?: string; first_name?: string; email?: string } | undefined;
  getCalColor: (it: TIssue) => string | null;
  updateIssue?: (
    projectId: string | null | undefined,
    issueId: string,
    data: Partial<TIssue>
  ) => Promise<void> | void | undefined;
  labelFilter: string[];
  priorityFilter: string | null;
  stateFilter: string[];
  assigneeFilter: string | null;
  onLabelFilterChange: (ids: string[]) => void;
  onPriorityFilterChange: (p: string | null) => void;
  onStateFilterChange: (ids: string[]) => void;
  onAssigneeFilterChange: (a: string | null) => void;
  width: number;
  onWidthChange: (w: number) => void;
  onClose: () => void;
  onCardPointerDown: (issue: TIssue, ev: React.PointerEvent) => void;
  onRefresh: () => void;
};

const DistributePanel = observer(function DistributePanel(props: DistributePanelProps) {
  const {
    projectId,
    issues,
    labelMap,
    stateMap,
    memberStore,
    getUserDetails,
    getCalColor,
    updateIssue,
    labelFilter,
    priorityFilter,
    stateFilter,
    assigneeFilter,
    onLabelFilterChange,
    onPriorityFilterChange,
    onStateFilterChange,
    onAssigneeFilterChange,
    width,
    onWidthChange,
    onClose,
    onCardPointerDown,
    onRefresh,
  } = props;

  // Resize handle: drag the left edge to widen/narrow the panel.
  const handleResizeStart = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    const startX = ev.clientX;
    const startW = width;
    const onMove = (e: PointerEvent) => {
      // Dragging left grows the panel (panel sits on the right edge).
      const delta = startX - e.clientX;
      const next = Math.min(600, Math.max(220, startW + delta));
      onWidthChange(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ALL labels for the active project (not just those present on unscheduled).
  const labelOptions = useMemo(() => {
    const list: { id: string; name: string; color: string }[] = [];
    for (const l of Object.values(labelMap)) {
      if (!l) continue;
      if (projectId && l.project_id !== projectId) continue;
      list.push({ id: l.id, name: l.name, color: l.color });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [labelMap, projectId]);

  // States for the filter. Single-project mode lists every state of that
  // project. Profile mode (Ваша работа) aggregates states across all
  // projects, so collapse by canonical name — otherwise "Бэклог" /
  // "В процессе" / etc. appear once per project where they're defined.
  // The id we keep is just a representative for selection bookkeeping;
  // the filter logic below expands a chosen representative to "any state
  // sharing this name" so tasks from all projects are matched correctly.
  const stateOptions = useMemo(() => {
    const list: { id: string; name: string; color: string }[] = [];
    const seenNames = new Set<string>();
    for (const s of Object.values(stateMap)) {
      if (!s) continue;
      if (projectId && s.project_id && s.project_id !== projectId) continue;
      if (!projectId) {
        const k = (s.name ?? "").trim().toLocaleLowerCase("ru");
        if (!k || seenNames.has(k)) continue;
        seenNames.add(k);
      }
      list.push({ id: s.id, name: s.name, color: s.color });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [stateMap, projectId]);

  // In profile mode the selected stateFilter holds representative ids;
  // expand to the full set of ids whose state name matches any selected
  // representative. Memoised so filter loop below stays O(N).
  const expandedStateIds = useMemo(() => {
    if (projectId) return null; // not used in project mode
    if (stateFilter.length === 0) return null;
    const selectedNames = new Set(
      stateFilter.map((id) => stateMap[id]?.name?.trim().toLocaleLowerCase("ru")).filter(Boolean) as string[]
    );
    if (selectedNames.size === 0) return new Set<string>();
    const out = new Set<string>();
    for (const s of Object.values(stateMap)) {
      if (!s) continue;
      const k = (s.name ?? "").trim().toLocaleLowerCase("ru");
      if (selectedNames.has(k)) out.add(s.id);
    }
    return out;
  }, [stateMap, projectId, stateFilter]);

  // ALL project members (so the user can pick themselves even if they have no
  // unscheduled tasks yet).
  const assigneeOptions = useMemo(() => {
    if (!projectId) return [];
    const ids = memberStore.project.getProjectMemberIds(projectId, false) ?? [];
    return ids
      .map((uid) => {
        const u = getUserDetails(uid);
        const name = u?.display_name || u?.first_name || u?.email || uid.slice(0, 6);
        return { id: uid, name };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [projectId, memberStore, getUserDetails]);

  const filtered = useMemo(() => {
    return issues.filter((it) => {
      // Label / status filters are multi-select: empty array means "no
      // filter on this axis"; otherwise the task must match at least one
      // selected value.
      if (labelFilter.length > 0) {
        const ids = it.label_ids ?? [];
        if (!ids.some((id) => labelFilter.includes(id))) return false;
      }
      if (priorityFilter && it.priority !== priorityFilter) return false;
      if (stateFilter.length > 0) {
        const sid = (it as { state_id?: string }).state_id;
        if (!sid) return false;
        // Profile mode dedups by name → expandedStateIds covers all
        // sibling-named states; project mode uses raw ids.
        const allowed = expandedStateIds ?? new Set(stateFilter);
        if (!allowed.has(sid)) return false;
      }
      if (assigneeFilter && !((it as { assignee_ids?: string[] }).assignee_ids ?? []).includes(assigneeFilter))
        return false;
      return true;
    });
  }, [issues, labelFilter, priorityFilter, stateFilter, assigneeFilter, expandedStateIds]);

  const PRIORITIES: { key: string; title: string; color: string }[] = [
    { key: "urgent", title: "Срочно", color: "#dc2626" },
    { key: "high", title: "Высокий", color: "#f97316" },
    { key: "medium", title: "Средний", color: "#eab308" },
    { key: "low", title: "Низкий", color: "#3b82f6" },
    { key: "none", title: "Без приоритета", color: "#9ca3af" },
  ];

  // Chip-style filter row: mirrors the top WorkItemFiltersRow chips
  // (`h-7 rounded-sm border border-subtle-1 bg-surface-1`) so the whole
  // filter UX reads as one design system. Each chip is a horizontal pill
  // with a label segment on the left and a value control on the right.
  //
  // No `overflow-hidden` here — the multi-select popover lives inside the
  // chip and is `position: absolute top-full`; clipping the wrapper would
  // make the dropdown invisible (the exact bug that hit the live build).
  // The inner sections have no separate background, so the rounded
  // corners stay clean without explicit clipping.
  const chipWrap = "flex h-7 items-stretch rounded-sm border border-subtle-1 bg-surface-1";
  const chipLabelCls =
    "flex flex-shrink-0 items-center whitespace-nowrap border-r border-subtle-1 px-2 text-11 text-tertiary";
  // Both native <select> (priority / assignee) and the chip-mode trigger
  // for MultiSelectDropdown share this for typographic parity.
  const chipValueCls =
    "flex h-full w-full min-w-0 cursor-pointer appearance-none items-center bg-transparent px-2 text-11 text-secondary outline-none hover:bg-layer-transparent-hover";

  return (
    <div className="relative flex flex-shrink-0 flex-col border-l border-subtle-1 bg-surface-1" style={{ width }}>
      {/* Resize handle on the LEFT edge */}
      <div
        onPointerDown={handleResizeStart}
        className="absolute top-0 left-0 z-10 h-full w-1 -translate-x-1/2 cursor-col-resize hover:bg-accent-primary/40"
        title="Изменить ширину"
      />
      <div className="flex items-center justify-between border-b border-subtle-1 px-3 py-2">
        <div className="text-sm font-medium">Распределить задачи</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs rounded px-1.5 py-0.5 hover:bg-layer-transparent-hover"
            title="Обновить"
          >
            ⟳
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs rounded px-1.5 py-0.5 hover:bg-layer-transparent-hover"
            title="Закрыть"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-2 border-b border-subtle-1 px-2 py-2">
        <div className={chipWrap}>
          <div className={chipLabelCls}>Метка</div>
          <MultiSelectDropdown
            value={labelFilter}
            options={labelOptions.map((l) => ({ id: l.id, label: l.name, color: l.color }))}
            onChange={onLabelFilterChange}
            placeholder="Все"
            triggerClassName={`${chipValueCls} justify-between gap-1`}
          />
        </div>
        <div className={chipWrap}>
          <div className={chipLabelCls}>Приоритет</div>
          <div className="relative flex min-w-0 flex-1">
            <select
              value={priorityFilter ?? ""}
              onChange={(e) => onPriorityFilterChange(e.target.value || null)}
              className={`${chipValueCls} pr-6`}
            >
              <option value="">Все</option>
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.title}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-11 text-tertiary">
              ▾
            </span>
          </div>
        </div>
        <div className={chipWrap}>
          <div className={chipLabelCls}>Статус</div>
          <MultiSelectDropdown
            value={stateFilter}
            options={stateOptions.map((s) => ({ id: s.id, label: s.name, color: s.color }))}
            onChange={onStateFilterChange}
            placeholder="Все"
            triggerClassName={`${chipValueCls} justify-between gap-1`}
          />
        </div>
        {/* "Назначен" filter only makes sense in single-project mode. In
            profile mode (Ваша работа) the workspace endpoint already
            scopes by user via assignees=/created_by=/subscriber= params,
            so there are no other assignees to choose between. */}
        {projectId && (
          <div className={chipWrap}>
            <div className={chipLabelCls}>Назначен</div>
            <div className="relative flex min-w-0 flex-1">
              <select
                value={assigneeFilter ?? ""}
                onChange={(e) => onAssigneeFilterChange(e.target.value || null)}
                className={`${chipValueCls} pr-6`}
              >
                <option value="">Все</option>
                {assigneeOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-11 text-tertiary">
                ▾
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filtered.length === 0 && (
          <div className="text-xs px-2 py-4 text-center text-tertiary">Нет задач без срока</div>
        )}
        <div className="flex flex-col gap-1.5">
          {filtered.map((it) => {
            const cal = getCalColor(it);
            return (
              <div
                key={it.id}
                onPointerDown={(ev) => onCardPointerDown(it, ev)}
                // Match the list-view row look: text-13 for the title (same
                // as `apps/web/core/components/issues/issue-layouts/list/block.tsx`),
                // tighter vertical rhythm. The cursor stays grab so the
                // drag-to-schedule affordance still reads.
                className="cursor-grab rounded border border-subtle-1 bg-surface-1 px-2 py-2 text-13 leading-snug select-none hover:bg-accent-primary/5 active:cursor-grabbing"
                style={{
                  borderLeft: cal ? `3px solid ${cal}` : undefined,
                  paddingLeft: cal ? 7 : 8,
                }}
              >
                <div className="flex items-start gap-1.5">
                  <CompleteCheckbox issue={it} updateIssue={updateIssue} size="sm" className="mt-0.5" />
                  <div className="line-clamp-2 flex-1 font-medium text-secondary">{it.name ?? ""}</div>
                </div>
                {(it.label_ids?.length ?? 0) > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(it.label_ids ?? []).slice(0, 3).map((lid) => {
                      const l = labelMap[lid];
                      if (!l) return null;
                      return (
                        // Chip styling mirrors the standard label property
                        // chip from `properties/labels.tsx`:
                        //   border-[0.5px] border-strong rounded-sm h-5 px-2.5
                        //   text-caption-sm-regular text-secondary
                        //   + 8px colored dot
                        <span
                          key={lid}
                          className="inline-flex h-5 flex-shrink-0 items-center gap-1.5 rounded-sm border-[0.5px] border-strong px-2.5 text-caption-sm-regular text-secondary"
                        >
                          <span
                            className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: l.color || "#9ca3af" }}
                          />
                          {l.name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// ── Multi-select dropdown ───────────────────────────────────────────────────
// Tiny click-out-to-close popover with checkbox rows. Used in the
// DistributePanel filters so the user can narrow by multiple labels or
// statuses at once (TickTick parity). No-deps: just outside-click + state.
type MultiSelectOption = { id: string; label: string; color?: string };
function MultiSelectDropdown(props: {
  value: string[];
  options: MultiSelectOption[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /**
   * Override classes for the trigger button. When provided, the default
   * standalone-pill styling (h-7, border, bg-surface-1) is dropped — pass
   * something that fits your container. Used by the DistributePanel
   * filters that wrap the trigger inside a chip-style row.
   */
  triggerClassName?: string;
}) {
  const { value, options, onChange, placeholder = "Все", triggerClassName } = props;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useOutsideClickDetector(wrapRef, () => setOpen(false));

  const selectedSet = new Set(value);
  const summary = (() => {
    if (value.length === 0) return placeholder;
    if (value.length === 1) {
      const opt = options.find((o) => o.id === value[0]);
      return opt?.label ?? "1 выбран";
    }
    return `${value.length} выбрано`;
  })();

  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const triggerCls =
    triggerClassName ??
    "flex h-7 w-full items-center justify-between gap-1 rounded-sm border border-subtle-1 bg-surface-1 px-2 text-xs text-secondary hover:bg-layer-transparent-hover";

  return (
    <div ref={wrapRef} className="relative flex min-w-0 flex-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className={triggerCls}>
        <span className={`truncate ${value.length === 0 ? "text-tertiary" : ""}`}>{summary}</span>
        <span className={`flex-shrink-0 text-tertiary transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        // Width: at least the trigger's width (so the panel never looks
        // narrower than the chip it dropped from), but grows up to a sane
        // cap so a long status / label name reads in full without
        // wrapping or truncating. The native priority <select> popup
        // does the same — its width follows option text, not the
        // trigger.
        <div
          data-prevent-outside-click
          className="absolute top-full left-0 z-30 mt-1 max-h-60 w-max max-w-[280px] min-w-full overflow-y-auto rounded-md border border-strong bg-surface-1 p-1 shadow-raised-200"
        >
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-1 block w-full rounded-sm px-2 py-1 text-left text-11 text-tertiary hover:bg-layer-transparent-hover"
            >
              Сбросить
            </button>
          )}
          {options.length === 0 && <div className="px-2 py-1 text-11 text-tertiary">Нет вариантов</div>}
          {options.map((opt) => {
            const checked = selectedSet.has(opt.id);
            return (
              <label
                key={opt.id}
                className="flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-11 text-secondary hover:bg-layer-transparent-hover"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt.id)}
                  className="accent-accent-primary h-3 w-3 flex-shrink-0 cursor-pointer"
                />
                {opt.color && (
                  <span
                    className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: opt.color }}
                  />
                )}
                <span className="flex-1 whitespace-nowrap">{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Month grid ──────────────────────────────────────────────────────────────
function MonthGrid(props: {
  monthAnchor: Date;
  showWeekends: boolean;
  issueList: TIssue[];
  getCalColor: (it: TIssue) => string | null;
  onCardClick: (it: TIssue) => void;
  updateIssue?: (
    projectId: string | null | undefined,
    issueId: string,
    data: Partial<TIssue>
  ) => Promise<void> | void | undefined;
  completedIds: Set<string>;
}) {
  const { monthAnchor, showWeekends, issueList, getCalColor, onCardClick, updateIssue, completedIds } = props;

  const grid: Date[] = useMemo(() => {
    const first = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    const startOff = (first.getDay() + 6) % 7; // Mon=0
    const start = new Date(first);
    start.setDate(first.getDate() - startOff);
    start.setHours(0, 0, 0, 0);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    return out;
  }, [monthAnchor]);

  const visibleDays = showWeekends ? grid : grid.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  const cols = showWeekends ? 7 : 5;

  // Bucket issues by ISO date (target_date or start_date as fallback).
  const byDay = useMemo(() => {
    const m = new Map<string, TIssue[]>();
    for (const it of issueList) {
      const td = it.target_date || (it as any).start_date;
      if (!td) continue;
      const arr = m.get(td) ?? [];
      arr.push(it);
      m.set(td, arr);
    }
    return m;
  }, [issueList]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthN = monthAnchor.getMonth();

  const dowLabels = showWeekends ? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] : ["Пн", "Вт", "Ср", "Чт", "Пт"];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="grid border-b border-subtle-1 bg-surface-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {dowLabels.map((d) => (
          <div key={d} className="text-xs px-2 py-1 text-center font-medium text-tertiary">
            {d}
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className="grid h-full"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            // 6 rows of equal height that fill the available vertical space.
            // minmax(90px, 1fr) keeps a sensible minimum on tiny viewports
            // and lets each week stretch evenly when there's room.
            gridTemplateRows: "repeat(6, minmax(90px, 1fr))",
          }}
        >
          {visibleDays.map((d) => {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const dayIssues = byDay.get(key) ?? [];
            const isOutside = d.getMonth() !== monthN;
            const isToday = d.getTime() === today.getTime();
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const visibleN = 6;
            return (
              <div
                key={key}
                className={`flex min-h-0 flex-col gap-0.5 overflow-hidden border-t border-l border-subtle-1 p-1 ${
                  isWeekend ? "bg-surface-2" : "bg-surface-1"
                } ${isOutside ? "opacity-40" : ""}`}
              >
                <div
                  className={`text-xs text-right ${isToday ? "font-semibold text-accent-primary" : "text-tertiary"}`}
                >
                  {d.getDate()}
                </div>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {dayIssues.slice(0, visibleN).map((it) => {
                    const color = getCalColor(it);
                    const targetTime = (it as { target_time?: string }).target_time;
                    // Mirror week-view rendering: cal:* tagged tasks get
                    // their cal-color tint, the rest fall back to the same
                    // accent-primary tint that week view uses.
                    const bgClass = color ? "" : "bg-accent-primary/20 hover:bg-accent-primary/30";
                    const muted = completedIds.has(it.id);
                    return (
                      <div
                        key={it.id}
                        title={it.name ?? ""}
                        className={`flex w-full items-center gap-1 rounded px-1 text-[11px] ${color ? "" : "text-secondary"} hover:opacity-80 ${bgClass} ${muted ? "opacity-50 grayscale" : ""}`}
                        style={{
                          backgroundColor: color ? calSurface(color).bg : undefined,
                          color: color ? calSurface(color).fg : undefined,
                        }}
                      >
                        <CompleteCheckbox issue={it} updateIssue={updateIssue} size="xs" />
                        <button
                          type="button"
                          onClick={() => onCardClick(it)}
                          className={`min-w-0 flex-1 truncate text-left ${muted ? "line-through" : ""}`}
                        >
                          {it.name}
                        </button>
                        {targetTime && (
                          <span className="flex-shrink-0 text-[10px] text-tertiary">
                            {String(targetTime).slice(0, 5)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {dayIssues.length > visibleN && (
                    <div className="px-1 text-[10px] text-tertiary">+{dayIssues.length - visibleN} ещё</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

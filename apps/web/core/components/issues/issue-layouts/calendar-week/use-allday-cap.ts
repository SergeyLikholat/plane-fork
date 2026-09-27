/**
 * Calendar-week — height cap for the «весь день» strip.
 *
 * The strip is pinned above the hour grid, so every pixel it grows is a
 * pixel of hours the user can't see. Cap it at a share of the calendar's
 * viewport (never more than ALLDAY_MAX_PX, never less than ALLDAY_MIN_CAP_PX
 * so a short pane still shows a few rows); the rest scrolls inside the strip.
 */
import { useLayoutEffect, useState } from "react";

export const ALLDAY_MAX_VIEWPORT_SHARE = 0.3;
export const ALLDAY_MAX_PX = 180;
export const ALLDAY_MIN_CAP_PX = 60;

export const computeAllDayCap = (viewportPx: number): number =>
  Math.max(ALLDAY_MIN_CAP_PX, Math.min(ALLDAY_MAX_PX, Math.floor(viewportPx * ALLDAY_MAX_VIEWPORT_SHARE)));

/** Cap in px for the all-day strip, tracking the scroll container's height. */
export const useAllDayCap = (scrollRef: React.RefObject<HTMLDivElement | null>, remeasureKey: unknown): number => {
  const [cap, setCap] = useState(ALLDAY_MAX_PX);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      // Hidden (month view) → clientHeight 0; keep the last real value.
      if (el.clientHeight > 0) setCap(computeAllDayCap(el.clientHeight));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, remeasureKey]);
  return cap;
};

/**
 * Shared helpers for the date+time+duration UI used in peek-overview and
 * issue-detail sidebar. Times are stored as `HH:MM:SS` strings; durations as
 * minutes; dates as ISO `YYYY-MM-DD`.
 */

export const TIME_OPTIONS: string[] = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

export const DURATION_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: "Без длительности", minutes: null },
  { label: "15 мин", minutes: 15 },
  { label: "30 мин", minutes: 30 },
  { label: "45 мин", minutes: 45 },
  { label: "1 ч", minutes: 60 },
  { label: "1.5 ч", minutes: 90 },
  { label: "2 ч", minutes: 120 },
  { label: "3 ч", minutes: 180 },
  { label: "4 ч", minutes: 240 },
  { label: "6 ч", minutes: 360 },
  { label: "8 ч", minutes: 480 },
];

export function parseHM(s: string | null | undefined): number | null {
  if (!s) return null;
  const [hh, mm] = s.split(":");
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function fmtHMS(totalMin: number): string {
  const t = Math.max(0, Math.min(23 * 60 + 59, totalMin));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export function addMinutesToTimeStr(time: string | null, minutes: number): string | null {
  const tm = parseHM(time);
  return tm === null ? null : fmtHMS(tm + minutes);
}

export function diffMinutes(start: string | null, end: string | null): number | null {
  const s = parseHM(start);
  const e = parseHM(end);
  if (s === null || e === null) return null;
  return e - s;
}

export function toPayloadDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function fromPayloadDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function formatTimeShort(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}

export type DateTimeFields = {
  target_date: string | null;
  target_time: string | null;
  start_date: string | null;
  start_time: string | null;
};

/**
 * Compose a single line summary for the trigger button. Always anchored to
 * target_date (срок выполнения / due date) — that's the field users
 * primarily care about. Multi-day events get a "до" prefix.
 */
export function formatTriggerLabel(v: DateTimeFields): string | null {
  if (!v.target_date) return null;
  const td = fromPayloadDate(v.target_date);
  if (!td) return null;
  const tdLabel = formatShortDate(td);

  const sd = fromPayloadDate(v.start_date);
  const isMultiDay = !!(sd && v.start_date !== v.target_date);

  const tt = formatTimeShort(v.target_time);
  const st = formatTimeShort(v.start_time);

  // No time at all
  if (!tt && !st) {
    if (isMultiDay) return `до ${tdLabel}`;
    return `${tdLabel} (весь день)`;
  }

  // Has time. Multi-day → focus on target only.
  if (isMultiDay) {
    return tt ? `до ${tdLabel}, ${tt}` : `до ${tdLabel}`;
  }

  // Same-day range
  if (st && tt && st !== tt) return `${tdLabel}, ${st}–${tt}`;
  if (tt) return `${tdLabel}, ${tt}`;
  if (st) return `${tdLabel}, ${st}`;
  return tdLabel;
}

/**
 * Short trigger label for a kanban card: «29 сент.» plus « 10:00» when the
 * work item has a time (the deadline, or the start when only it is set).
 * No «(весь день)», no range, no «до» — the popup shows the details.
 */
export function formatShortTriggerLabel(v: DateTimeFields, isRelative = false): string | null {
  const td = fromPayloadDate(v.target_date);
  if (!td) return null;
  const day = isRelative ? (formatRelativeDay(td) ?? formatShortDate(td)) : formatShortDate(td);
  const time = formatTimeShort(v.target_time) || formatTimeShort(v.start_time);
  return time ? `${day} ${time}` : day;
}

const RELATIVE_DAYS: Record<number, string> = { [-1]: "Вчера", 0: "Сегодня", 1: "Завтра" };
const DAY_MS = 24 * 60 * 60 * 1000;

/** «Вчера» / «Сегодня» / «Завтра» for the nearest days, otherwise null. */
export function formatRelativeDay(d: Date, now: Date = new Date()): string | null {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(now)) / DAY_MS);
  return RELATIVE_DAYS[diff] ?? null;
}

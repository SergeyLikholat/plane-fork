/**
 * Right side of a list section header: one number that matters for the
 * section. «📌 В процессе (WIP ≤ 3)» → «WIP 2 из 3» with a meter (over the
 * limit turns red); «На контроле» → how many touches are due today
 * (overdue included).
 */
import { cn, getDate } from "@plane/utils";

const WIP_PATTERN = /\(\s*WIP\s*[≤<=]+\s*(\d+)\s*\)/i;

/** WIP limit written in the state name, or null. */
export const getWipLimit = (stateName: string): number | null => {
  const match = WIP_PATTERN.exec(stateName);
  return match ? Number(match[1]) : null;
};

/** The section title without the «(WIP ≤ 3)» part, which moves to the summary. */
export const stripWipLimit = (stateName: string): string => stateName.replace(WIP_PATTERN, "").trim();

/** Items whose date is today or already past. */
export const countDueByToday = (targetDates: (string | null | undefined)[], now: Date = new Date()): number => {
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return targetDates.filter((value) => {
    const date = getDate(value ?? undefined);
    return !!date && date.getTime() < endOfToday;
  }).length;
};

const SUMMARY_TEXT = "text-caption-md-medium whitespace-nowrap text-[#8A7C63] tabular-nums";

export function WipSummary({ count, limit }: { count: number; limit: number }) {
  const isOver = count > limit;
  const fill = Math.min(100, Math.round((count / Math.max(limit, 1)) * 100));
  return (
    <span className={cn("flex items-center gap-2", SUMMARY_TEXT, isOver && "text-danger-primary")}>
      WIP {count} из {limit}
      <span aria-hidden className="h-[5px] w-20 overflow-hidden rounded-full bg-[#DED4C2] max-md:w-10">
        <span
          className={cn("block h-full rounded-full", isOver ? "bg-danger-primary" : "bg-[#B08A4A]")}
          style={{ width: `${fill}%` }}
        />
      </span>
    </span>
  );
}

export function DueTodaySummary({ count }: { count: number }) {
  if (count === 0) return null;
  return <span className={SUMMARY_TEXT}>на сегодня {count}</span>;
}

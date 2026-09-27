/**
 * Week board — weight badge: load bars + number. «~» marks a label guess,
 * a dashed outline marks an automatic weight nobody has confirmed yet.
 */
import { cn } from "@plane/utils";
import { WeightIcon } from "@/components/estimates/weight-icon";
import { HEAVY_THRESHOLD } from "./weights";

type Props = {
  weight: number;
  isImplicit: boolean;
  /** Estimate set automatically and not confirmed by a person. */
  isUnconfirmed?: boolean;
  title?: string;
  className?: string;
};

export function WeightChip(props: Props) {
  const { weight, isImplicit, isUnconfirmed = false, title, className } = props;
  const isHeavy = weight >= HEAVY_THRESHOLD;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm border px-1 text-11 font-semibold tabular-nums",
        isHeavy ? "bg-warning-subtle text-warning-primary" : "bg-layer-2 text-primary",
        isUnconfirmed ? "border-dashed border-strong" : "border-transparent",
        className
      )}
    >
      <WeightIcon weight={weight} className="mr-0.5 size-3" />
      {isImplicit && <span className="font-normal text-tertiary">~</span>}
      {weight}
    </span>
  );
}

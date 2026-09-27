/**
 * Load icon for the «Вес» estimate: five ascending bars, like a signal
 * meter. More filled bars — heavier task. Neutral for everyday weights,
 * amber for «8 · тяжёлая», red for «13 · разбить» (must be split).
 */
import { EstimatePropertyIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";

const BAR_COUNT = 5;
/** Fibonacci weight → filled bars. */
const LEVEL_BY_WEIGHT: Record<number, number> = { 1: 1, 2: 2, 3: 3, 5: 4, 8: 5, 13: 5 };
const HEAVY_WEIGHT = 8;
const SPLIT_WEIGHT = 13;

/** Leading integer of an estimate value ("3 · средняя" → 3) when it is a known weight. */
export const parseWeightValue = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const match = /^\s*(\d+)/.exec(String(value));
  if (!match) return null;
  const weight = Number.parseInt(match[1], 10);
  return LEVEL_BY_WEIGHT[weight] ? weight : null;
};

const toneClass = (weight: number): string => {
  if (weight >= SPLIT_WEIGHT) return "text-icon-danger-primary";
  if (weight >= HEAVY_WEIGHT) return "text-icon-warning-primary";
  if (weight >= 5) return "text-icon-primary";
  return "text-icon-secondary";
};

type WeightIconProps = { weight: number; className?: string };

export function WeightIcon({ weight, className }: WeightIconProps) {
  const level = LEVEL_BY_WEIGHT[weight] ?? 0;
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cn("flex-shrink-0", toneClass(weight), className)}
      fill="currentColor"
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const height = 4 + i * 2.5;
        return (
          <rect
            key={i}
            x={1 + i * 3}
            y={15 - height}
            width={2}
            height={height}
            rx={0.6}
            opacity={i < level ? 1 : 0.22}
          />
        );
      })}
    </svg>
  );
}

type EstimateValueIconProps = { value: string | number | null | undefined; className?: string };

/** Weight bars when the value is a «Вес» point, otherwise the stock estimate icon. */
export function EstimateValueIcon({ value, className }: EstimateValueIconProps) {
  const weight = parseWeightValue(value);
  if (weight === null) return <EstimatePropertyIcon className={cn("flex-shrink-0", className)} />;
  return <WeightIcon weight={weight} className={className} />;
}

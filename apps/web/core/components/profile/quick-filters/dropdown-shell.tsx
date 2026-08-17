/**
 * Shared visual shell for the «Ваша работа» quick-filter dropdowns — the
 * trigger button (with its active state and summary) plus the panel.
 */
import { ChevronDown, Check } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import { cn } from "@plane/utils";

type TQuickFilterDropdownProps = {
  label: string;
  /** Name of the only picked entry, when exactly one is picked. */
  activeSummary?: string;
  activeCount: number;
  children: React.ReactNode;
};

export function QuickFilterDropdown(props: TQuickFilterDropdownProps) {
  const { label, activeSummary, activeCount, children } = props;
  const isActive = activeCount > 0;

  return (
    <Popover>
      <Popover.Button
        className={cn(
          "flex items-center gap-1 rounded-md border px-2 py-1 text-11 font-medium tracking-wide uppercase transition-colors outline-none",
          isActive
            ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
            : "border-subtle-1 text-tertiary hover:border-strong hover:text-secondary"
        )}
      >
        <span>{label}</span>
        {/* One active entry reads better as its own name than as "1". */}
        {activeCount === 1 && activeSummary && <span className="max-w-32 truncate normal-case">· {activeSummary}</span>}
        {activeCount > 1 && (
          <span className="rounded-full bg-accent-primary px-1.5 text-10 text-on-color">{activeCount}</span>
        )}
        <ChevronDown className="size-3 flex-shrink-0" />
      </Popover.Button>
      <Popover.Panel
        side="bottom"
        align="start"
        // The z-index has to sit on the POSITIONER, not on the popup — the
        // popup is nested inside the positioner, so its own z-index only
        // orders it against its siblings there. Without this the sticky list
        // group header (z-[2]) paints over the open panel.
        positionerClassName="z-30"
        className="shadow-lg max-h-80 w-72 overflow-y-auto rounded-md border border-subtle-1 bg-surface-1 p-1"
      >
        {children}
      </Popover.Panel>
    </Popover>
  );
}

type TQuickFilterOptionProps = {
  name: string;
  color?: string;
  isSelected: boolean;
  onClick: () => void;
  /** Trailing content — a count, a chevron for a drill-in row, etc. */
  trailing?: React.ReactNode;
};

export function QuickFilterOption(props: TQuickFilterOptionProps) {
  const { name, color, isSelected, onClick, trailing } = props;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-13 transition-colors hover:bg-layer-1-hover",
        isSelected ? "text-primary" : "text-secondary"
      )}
    >
      {color && <span className="size-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
      <span className="flex-1 truncate">{name}</span>
      {isSelected && !trailing && <Check className="size-3.5 flex-shrink-0 text-accent-primary" />}
      {trailing}
    </button>
  );
}

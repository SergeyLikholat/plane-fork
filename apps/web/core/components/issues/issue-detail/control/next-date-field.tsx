/**
 * «Следующее касание / Дата приёмки / Первое касание» row of the touch dialogs.
 * Shows the automatic proposal; picking a date makes it manual (sent to the
 * server as `next_date`), «↺ авто» returns to the proposal.
 */
import { cn } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";

type Props = {
  label: string;
  proposal: Date | null;
  manual: Date | null;
  onChange: (value: Date | null) => void;
};

export function NextDateField({ label, proposal, manual, onChange }: Props) {
  // Closing outcomes have no next action — nothing to schedule.
  if (proposal === null && manual === null) return null;
  const value = manual ?? proposal;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-caption-md-medium tracking-wide text-tertiary uppercase">{label}</span>
      <DateDropdown
        value={value}
        onChange={(next) => onChange(next)}
        minDate={new Date()}
        buttonVariant="border-with-text"
        placeholder="Выберите дату"
        isClearable={false}
        buttonClassName={cn(!manual && "text-secondary")}
      />
      {manual ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-caption-md-regular text-tertiary underline-offset-2 hover:text-primary hover:underline"
        >
          ↺ авто
        </button>
      ) : (
        <span className="text-caption-md-regular text-placeholder">предложено по частоте и сроку — можно поменять</span>
      )}
    </div>
  );
}

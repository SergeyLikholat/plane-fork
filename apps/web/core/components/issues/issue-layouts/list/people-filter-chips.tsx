/**
 * «На контроле» section header: the people (labels under «ЛЮДИ») that occur in
 * the section, with their task counts. A click narrows THIS section to that
 * person; a second click shows everyone again. Page-wide filters are untouched.
 * Same-named labels of different projects count as one person.
 */
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Users, X } from "lucide-react";

export type TPersonCount = { name: string; count: number };

const PEOPLE_PARENT = "люди";

type TLabelLike = { name: string; parent?: string | null };

/** People of the given issues (by label name), most loaded first. */
export const countPeople = (
  issueLabelIds: (string[] | undefined)[],
  labelMap: Record<string, TLabelLike | undefined>
): TPersonCount[] => {
  const counts = new Map<string, number>();
  for (const labelIds of issueLabelIds) {
    const names = new Set<string>();
    for (const id of labelIds ?? []) {
      const label = labelMap[id];
      const parent = label?.parent ? labelMap[label.parent] : undefined;
      if (label && parent && parent.name.trim().toLowerCase() === PEOPLE_PARENT) names.add(label.name.trim());
    }
    names.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
};

/** Whether an issue carries the person's label (any project's copy of it). */
export const hasPerson = (
  labelIds: string[] | undefined,
  person: string,
  labelMap: Record<string, TLabelLike | undefined>
): boolean => (labelIds ?? []).some((id) => labelMap[id]?.name.trim() === person);

type Props = {
  people: TPersonCount[];
  selected: string | null;
  onToggle: (name: string) => void;
};

function DesktopChips({ people, selected, onToggle }: Props) {
  if (people.length === 0) return null;
  const stop = (event: MouseEvent) => event.stopPropagation();
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- only stops the header's collapse toggle
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 max-md:hidden" onClick={stop}>
      {people.map(({ name, count }) => {
        const isActive = selected === name;
        return (
          <button
            key={name}
            type="button"
            aria-pressed={isActive}
            title={isActive ? "Показать всех" : `Только ${name}`}
            onClick={() => onToggle(name)}
            className={[
              "inline-flex h-6 items-center gap-1.5 rounded-md border pr-1 pl-2 text-caption-md-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#9AA5B1]",
              // Selected = calm graphite, not a pale-blue fill.
              isActive
                ? "border-[#2F3640] bg-[#2F3640] text-white"
                : "border-subtle-1 bg-surface-1 text-primary hover:border-strong-1",
            ].join(" ")}
          >
            {name}
            <span
              className={[
                "inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[11px] leading-none font-semibold tabular-nums",
                isActive ? "bg-white/20 text-white" : "bg-[#EEF1F4] text-[#4A5561]",
              ].join(" ")}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const COUNT_BADGE =
  "inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[11px] leading-none font-semibold tabular-nums";

/**
 * Phones: one compact button instead of a wall of chips — «Исполнители · N»,
 * or the selected person in graphite with a reset cross. Opens a bottom sheet
 * with everyone and their counts.
 */
function MobilePicker({ people, selected, onToggle }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const stop = (event: MouseEvent) => event.stopPropagation();
  const active = people.find((p) => p.name === selected);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setIsOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const pick = (name: string | null) => {
    if (name === null) {
      if (selected) onToggle(selected);
    } else if (name !== selected) {
      onToggle(name);
    }
    setIsOpen(false);
  };

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- only stops the header's collapse toggle
    <div className="flex min-w-0 items-center gap-1 md:hidden" onClick={stop}>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Исполнители"
        title="Исполнители на контроле"
        className={[
          "inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-caption-md-medium whitespace-nowrap outline-none",
          active ? "border-[#2F3640] bg-[#2F3640] text-white" : "border-subtle-1 bg-surface-1 text-primary",
        ].join(" ")}
      >
        {active ? (
          <>
            <span className="truncate">{active.name}</span>
            <span className={`${COUNT_BADGE} bg-white/20 text-white`}>{active.count}</span>
          </>
        ) : (
          <>
            <Users className="size-3.5 shrink-0 text-icon-secondary" />
            {/* «Люди» — same name as the label group in the filters; short, so
                the section title is not truncated on a phone. */}
            Люди
            <span className={`${COUNT_BADGE} bg-[#EEF1F4] text-[#4A5561]`}>{people.length}</span>
            <ChevronDown className="size-3.5 shrink-0 text-icon-tertiary" />
          </>
        )}
      </button>
      {active && (
        <button
          type="button"
          aria-label="Показать всех"
          onClick={() => onToggle(active.name)}
          className="grid size-7 shrink-0 place-items-center rounded-md border border-subtle-1 bg-surface-1 text-icon-secondary"
        >
          <X className="size-3.5" />
        </button>
      )}
      {isOpen &&
        createPortal(
          <div data-prevent-outside-click className="fixed inset-0 z-40 flex flex-col justify-end">
            <button
              type="button"
              aria-label="Закрыть"
              className="absolute inset-0 bg-[rgb(20_24_31/0.35)]"
              onClick={() => setIsOpen(false)}
            />
            <div
              role="dialog"
              aria-label="Исполнители"
              className="relative max-h-[70vh] overflow-y-auto rounded-t-xl bg-surface-1 px-3 pt-3 pb-5 shadow-overlay-200"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-layer-3" />
              <div className="mb-2 px-1 text-caption-md-medium tracking-wide text-tertiary uppercase">
                Исполнители на контроле
              </div>
              <PersonRow label="Все исполнители" isActive={!active} onClick={() => pick(null)} />
              {people.map(({ name, count }) => (
                <PersonRow
                  key={name}
                  label={name}
                  count={count}
                  isActive={active?.name === name}
                  onClick={() => pick(name)}
                />
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function PersonRow(props: { label: string; count?: number; isActive: boolean; onClick: () => void }) {
  const { label, count, isActive, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-body-sm-medium",
        isActive ? "bg-[#2F3640] text-white" : "text-primary active:bg-layer-1-hover",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className={`${COUNT_BADGE} ${isActive ? "bg-white/20 text-white" : "bg-[#EEF1F4] text-[#4A5561]"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export function PeopleFilterChips(props: Props) {
  if (props.people.length === 0) return null;
  return (
    <>
      <DesktopChips {...props} />
      <MobilePicker {...props} />
    </>
  );
}

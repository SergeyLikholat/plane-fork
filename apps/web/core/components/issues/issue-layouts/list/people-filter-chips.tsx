/**
 * «На контроле» section header: a «Люди» button listing the people (labels
 * under «ЛЮДИ») that occur in the section, with their task counts. A pick
 * narrows THIS section to that person; «Все исполнители» or ✕ shows everyone. Page-wide filters are untouched.
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
  /** Sits on the graphite section bar: translucent idle, white when picked. */
  onDark?: boolean;
};

const COUNT_BADGE =
  "inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[11px] leading-none font-semibold tabular-nums";

const LIGHT_BADGE = "bg-[#EEF1F4] text-[#4A5561]";

const DESKTOP_QUERY = "(min-width: 768px)";
const DROPDOWN_WIDTH = 264;

/**
 * One compact button instead of a wall of chips — «Люди · N», or the selected
 * person in graphite with a reset cross. Phones get a bottom sheet with
 * everyone and their counts; wider screens get a dropdown under the button.
 */
function PeoplePicker({ people, selected, onToggle, onDark = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  // Anchor of the desktop dropdown; null on phones (bottom sheet).
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const stop = (event: MouseEvent) => event.stopPropagation();
  const active = people.find((p) => p.name === selected);

  // On graphite the picked person turns white (graphite-on-graphite would vanish).
  let buttonTone: string;
  if (onDark) {
    buttonTone = active
      ? "border-white bg-white text-[#2F3640]"
      : "border-white/20 bg-white/10 text-white hover:bg-white/20";
  } else {
    buttonTone = active
      ? "border-[#2F3640] bg-[#2F3640] text-white"
      : "border-subtle-1 bg-surface-1 text-primary hover:border-strong-1";
  }

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

  const rows = (isCompact: boolean) => (
    <>
      <div className="mb-1.5 px-2 pt-1 text-caption-md-medium tracking-wide text-tertiary uppercase">
        Исполнители на контроле
      </div>
      <PersonRow label="Все исполнители" isCompact={isCompact} isActive={!active} onClick={() => pick(null)} />
      {people.map(({ name, count }) => (
        <PersonRow
          key={name}
          label={name}
          count={count}
          isCompact={isCompact}
          isActive={active?.name === name}
          onClick={() => pick(name)}
        />
      ))}
    </>
  );

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- only stops the header's collapse toggle
    <div className="flex min-w-0 items-center gap-1" onClick={stop}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={(event) => {
          const isDesktop = window.matchMedia(DESKTOP_QUERY).matches;
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor(
            isDesktop
              ? { top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - DROPDOWN_WIDTH - 8) }
              : null
          );
          setIsOpen(true);
        }}
        aria-label="Исполнители"
        title="Исполнители на контроле"
        className={[
          "inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-caption-md-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#9AA5B1] md:h-6",
          buttonTone,
        ].join(" ")}
      >
        {active ? (
          <>
            <span className="truncate">{active.name}</span>
            <span className={`${COUNT_BADGE} ${onDark ? LIGHT_BADGE : "bg-white/20 text-white"}`}>{active.count}</span>
          </>
        ) : (
          <>
            <Users className={`size-3.5 shrink-0 ${onDark ? "text-white/70" : "text-icon-secondary"}`} />
            {/* «Люди» — same name as the label group in the filters; short, so
                the section title is not truncated on a phone. */}
            Люди
            <span className={`${COUNT_BADGE} ${onDark ? "bg-white/20 text-white" : LIGHT_BADGE}`}>{people.length}</span>
            <ChevronDown className={`size-3.5 shrink-0 ${onDark ? "text-white/60" : "text-icon-tertiary"}`} />
          </>
        )}
      </button>
      {active && (
        <button
          type="button"
          aria-label="Показать всех"
          onClick={() => onToggle(active.name)}
          className={[
            "grid size-7 shrink-0 place-items-center rounded-md border md:size-6",
            onDark
              ? "border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
              : "border-subtle-1 bg-surface-1 text-icon-secondary hover:border-strong-1 hover:text-primary",
          ].join(" ")}
        >
          <X className="size-3.5" />
        </button>
      )}
      {isOpen &&
        createPortal(
          anchor ? (
            <div data-prevent-outside-click className="fixed inset-0 z-40">
              <button
                type="button"
                aria-label="Закрыть"
                className="absolute inset-0 cursor-default"
                onClick={() => setIsOpen(false)}
              />
              <div
                role="dialog"
                aria-label="Исполнители"
                style={{ top: anchor.top, left: anchor.left, width: DROPDOWN_WIDTH }}
                className="absolute max-h-[60vh] overflow-y-auto rounded-lg border border-subtle-1 bg-surface-1 p-1.5 shadow-overlay-200"
              >
                {rows(true)}
              </div>
            </div>
          ) : (
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
                {rows(false)}
              </div>
            </div>
          ),
          document.body
        )}
    </div>
  );
}

function PersonRow(props: {
  label: string;
  count?: number;
  isCompact: boolean;
  isActive: boolean;
  onClick: () => void;
}) {
  const { label, count, isCompact, isActive, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center justify-between gap-2 rounded-md text-left text-body-sm-medium",
        isCompact ? "px-2 py-1.5" : "px-3 py-2.5",
        isActive ? "bg-[#2F3640] text-white" : "text-primary hover:bg-layer-1-hover active:bg-layer-1-hover",
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
  return <PeoplePicker {...props} />;
}

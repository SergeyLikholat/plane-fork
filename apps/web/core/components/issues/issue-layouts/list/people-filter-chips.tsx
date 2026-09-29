/**
 * «На контроле» section header: the people (labels under «ЛЮДИ») that occur in
 * the section, with their task counts. A click narrows THIS section to that
 * person; a second click shows everyone again. Page-wide filters are untouched.
 * Same-named labels of different projects count as one person.
 */
import type { MouseEvent } from "react";
import { cn } from "@plane/utils";

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

export function PeopleFilterChips({ people, selected, onToggle }: Props) {
  if (people.length === 0) return null;
  const stop = (event: MouseEvent) => event.stopPropagation();
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- only stops the header's collapse toggle
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" onClick={stop}>
      {people.map(({ name, count }) => {
        const isActive = selected === name;
        return (
          <button
            key={name}
            type="button"
            aria-pressed={isActive}
            title={isActive ? "Показать всех" : `Только ${name}`}
            onClick={() => onToggle(name)}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-caption-md-medium whitespace-nowrap transition-colors outline-none focus-visible:border-accent-strong",
              isActive
                ? "border-accent-strong bg-accent-subtle text-accent-primary"
                : "border-subtle bg-surface-1 text-secondary hover:border-strong hover:text-primary"
            )}
          >
            {name}
            <span className={cn("tabular-nums", isActive ? "text-accent-primary" : "text-tertiary")}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

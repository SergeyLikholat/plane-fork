/**
 * Lead of a list row's meaning line: who does the work (labels under «ЛЮДИ»)
 * and the control phase («Постановка» / «Проверка» / «Приёмка»), shown first
 * and without outlines. The remaining labels stay in the usual labels control.
 */
import type { IIssueLabel } from "@plane/types";
import { cn } from "@plane/utils";
import { PHASE_NAMES, PHASE_PALETTE } from "@/components/issues/issue-detail/control/phase-palette";
import type { TControlPhase } from "@/services/issue/issue-control.service";

const PEOPLE_PARENT = "люди";

const PHASE_BY_WORD: [string, TControlPhase][] = [
  ["постановка", "setup"],
  ["проверка", "check"],
  ["приёмка", "acceptance"],
  ["приемка", "acceptance"],
];

/** Phase of a phase label («👁 Проверка» → "check"), or null for any other label. */
export const getPhaseOfLabelName = (name: string): TControlPhase | null => {
  const normalized = name
    .toLowerCase()
    .replace(/[^\p{L} ]/gu, "")
    .trim();
  return PHASE_BY_WORD.find(([word]) => normalized === word)?.[1] ?? null;
};

export type TListLead = {
  people: IIssueLabel[];
  phase: TControlPhase | null;
  /** Ids shown by the lead; the labels control must not list them again. */
  leadIds: string[];
};

export const splitListLead = (
  labelIds: string[] | undefined,
  labelMap: Record<string, IIssueLabel | undefined>
): TListLead => {
  const people: IIssueLabel[] = [];
  const leadIds: string[] = [];
  let phase: TControlPhase | null = null;
  for (const id of labelIds ?? []) {
    const label = labelMap[id];
    if (!label) continue;
    const parent = label.parent ? labelMap[label.parent] : undefined;
    if (parent && parent.name.trim().toLowerCase() === PEOPLE_PARENT) {
      people.push(label);
      leadIds.push(id);
      continue;
    }
    const labelPhase = getPhaseOfLabelName(label.name);
    if (labelPhase && !phase) {
      phase = labelPhase;
      leadIds.push(id);
    }
  }
  return { people, phase, leadIds };
};

/** «Кисилёв И.» → «КИ»; one word → its first two letters. */
const initialsOf = (name: string): string => {
  const words = name
    .replace(/[^\p{L} ]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

function PersonTag({ label }: { label: IIssueLabel }) {
  return (
    <span className="inline-flex h-5 max-w-44 min-w-0 items-center gap-1.5 text-caption-md-medium text-primary">
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-full text-[9px] leading-none font-bold text-white"
        style={{ backgroundColor: label.color || "#6F8A94" }}
      >
        {initialsOf(label.name)}
      </span>
      <span className="truncate">{label.name}</span>
    </span>
  );
}

function PhaseTag({ phase }: { phase: TControlPhase }) {
  const tone = PHASE_PALETTE[phase];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-[5px] px-1.5 text-caption-sm-medium",
        // Fill and text of the phase tone; no outline in the list.
        tone.chipClassName,
        "border-0"
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone.dotClassName)} />
      {PHASE_NAMES[phase]}
    </span>
  );
}

export function ListLead({ lead }: { lead: TListLead }) {
  if (lead.people.length === 0 && !lead.phase) return null;
  return (
    <>
      {lead.people.map((label) => (
        <PersonTag key={label.id} label={label} />
      ))}
      {lead.phase && <PhaseTag phase={lead.phase} />}
    </>
  );
}

/**
 * Week board — weight rules (pure, no store access).
 *
 * "Weight" is the Fibonacci story point the owner assigns via the project
 * estimate («1 · пустяк», «3 · средняя», «8 · тяжёлая», «13 · разбить»).
 * When a work item has no estimate, a default is derived from its `cal:*`
 * label. Supervised work («на контроле») is priced separately: checks of one
 * person on one day collapse into a single capped cost, acceptances cost more.
 */

export const DAY_LIMIT = 13;
export const HEAVY_THRESHOLD = 8;
export const GROUP_COST_CAP = 3;
export const CHECK_DEFAULT_WEIGHT = 1;
export const ACCEPTANCE_DEFAULT_WEIGHT = 3;
export const FALLBACK_WEIGHT = 1;
export const NO_PERSON = "Без исполнителя";

/** Defaults by `cal:*` label, keys pre-normalised with `normalizeLabelName`. */
const CAL_LABEL_DEFAULTS: Record<string, number> = {
  "cal:работа над проектом": 5,
  "cal:встречи": 2,
  "cal:встречи/звонки": 2,
  "cal:текучка": 2,
  "cal:планирование/подведение итогов": 2,
  "cal:платежный календарь": 0,
  "cal:личное/непродуктивное время": 0,
};

const CHECK_LABEL = "проверка";
const ACCEPTANCE_LABEL = "приемка";
const PEOPLE_PARENT_LABEL = "люди";
const SUPERVISED_GROUP = "supervised";
const PERSON_NAME_RE = /^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.?/;

export type TWorkKind = "own" | "check" | "acceptance";

export type TWeightLabel = {
  name: string;
  /** Name of the parent label, if the label is nested. */
  parentName?: string | null;
};

export type TWeightInput = {
  /** Raw estimate point value, e.g. "3 · средняя". */
  estimateValue?: string | null;
  labels: TWeightLabel[];
  stateGroup?: string | null;
  /** True when the state name reads as supervised («На контроле»). */
  isControlState?: boolean;
};

export type TWeightInfo = {
  weight: number;
  /** True when the weight is a default, not taken from the estimate. */
  isImplicit: boolean;
  kind: TWorkKind;
  /** Person a check belongs to; only set for `kind === "check"`. */
  person: string | null;
};

export type TWeighed<T> = { item: T; info: TWeightInfo };

export type TPersonGroup<T> = {
  person: string;
  items: TWeighed<T>[];
  rawSum: number;
  cost: number;
};

export type TDaySummary<T> = {
  /** Own tasks and acceptances, heaviest first. */
  singles: TWeighed<T>[];
  /** Checks grouped by person. */
  groups: TPersonGroup<T>[];
  total: number;
  heavyCount: number;
  /** Own tasks whose weight is a label-based guess. */
  unweightedCount: number;
};

/** Lowercase, `ё`→`е`, drop emoji/punctuation, tighten spaces around `/`. */
export const normalizeLabelName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}:/ ]/gu, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();

/** Leading integer of an estimate value ("8 · тяжёлая" → 8), or null. */
export const parseEstimateWeight = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = /^\s*(\d+)/.exec(value);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
};

/** Default weight derived from `cal:*` labels; FALLBACK_WEIGHT when none match. */
export const defaultWeightByLabels = (labels: TWeightLabel[]): number => {
  for (const label of labels) {
    const value = CAL_LABEL_DEFAULTS[normalizeLabelName(label.name)];
    if (value !== undefined) return value;
  }
  return FALLBACK_WEIGHT;
};

/** Control phase of a work item, or null for own work. */
export const detectControlKind = (input: TWeightInput): Exclude<TWorkKind, "own"> | null => {
  const names = new Set(input.labels.map((l) => normalizeLabelName(l.name)));
  if (names.has(ACCEPTANCE_LABEL)) return "acceptance";
  const isControl = input.stateGroup === SUPERVISED_GROUP || Boolean(input.isControlState) || names.has(CHECK_LABEL);
  return isControl ? "check" : null;
};

/** Person label: child of «ЛЮДИ», else a «Фамилия И.»-looking label, else NO_PERSON. */
export const resolvePerson = (labels: TWeightLabel[]): string => {
  const byParent = labels.find((l) => l.parentName && normalizeLabelName(l.parentName) === PEOPLE_PARENT_LABEL);
  if (byParent) return byParent.name.trim();
  const byPattern = labels.find((l) => PERSON_NAME_RE.test(l.name.trim()));
  if (byPattern) return byPattern.name.trim();
  return NO_PERSON;
};

export const computeWeight = (input: TWeightInput): TWeightInfo => {
  const explicit = parseEstimateWeight(input.estimateValue);
  const kind = detectControlKind(input) ?? "own";
  if (kind === "acceptance") {
    return { weight: explicit ?? ACCEPTANCE_DEFAULT_WEIGHT, isImplicit: explicit === null, kind, person: null };
  }
  if (kind === "check") {
    return {
      weight: explicit ?? CHECK_DEFAULT_WEIGHT,
      isImplicit: explicit === null,
      kind,
      person: resolvePerson(input.labels),
    };
  }
  return {
    weight: explicit ?? defaultWeightByLabels(input.labels),
    isImplicit: explicit === null,
    kind,
    person: null,
  };
};

/** Split a day's items into singles and per-person check groups and total the load. */
export const summarizeDay = <T>(entries: TWeighed<T>[]): TDaySummary<T> => {
  const singles: TWeighed<T>[] = [];
  const groupMap = new Map<string, TWeighed<T>[]>();
  for (const entry of entries) {
    if (entry.info.kind === "check") {
      const key = entry.info.person ?? NO_PERSON;
      groupMap.set(key, [...(groupMap.get(key) ?? []), entry]);
    } else {
      singles.push(entry);
    }
  }
  // Copy-then-sort (not toSorted): the web tsconfig lib is ES2022.
  const groups: TPersonGroup<T>[] = [...groupMap.entries()]
    .map(([person, items]) => {
      const rawSum = items.reduce((acc, e) => acc + e.info.weight, 0);
      return { person, items, rawSum, cost: Math.min(GROUP_COST_CAP, rawSum) };
    })
    .sort((a, b) => b.cost - a.cost || a.person.localeCompare(b.person, "ru"));
  const sortedSingles = [...singles].sort((a, b) => b.info.weight - a.info.weight);
  const total = sortedSingles.reduce((acc, e) => acc + e.info.weight, 0) + groups.reduce((acc, g) => acc + g.cost, 0);
  const heavyCount = entries.filter((e) => e.info.weight >= HEAVY_THRESHOLD).length;
  const unweightedCount = entries.filter((e) => e.info.kind === "own" && e.info.isImplicit).length;
  return { singles: sortedSingles, groups, total, heavyCount, unweightedCount };
};

export type TLoadLevel = "empty" | "ok" | "over";

export const getLoadLevel = (total: number): TLoadLevel => {
  if (total <= 0) return "empty";
  return total > DAY_LIMIT ? "over" : "ok";
};

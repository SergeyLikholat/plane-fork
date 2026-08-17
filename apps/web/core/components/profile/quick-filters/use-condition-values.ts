/**
 * Shared read/write helper for the «Ваша работа» quick-filter dropdowns.
 *
 * Every quick filter drives ONE multi-value rich-filter condition (label_id,
 * module_id, …) and needs the same three things: the currently selected ids,
 * a way to replace that selection, and a toggle for a group of ids that must
 * move together (a label name spanning several projects, a whole module list).
 */
import { useMemo } from "react";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import type { TWorkItemFilterProperty } from "@plane/types";
import { COLLECTION_OPERATOR, EQUALITY_OPERATOR, LOGICAL_OPERATOR } from "@plane/types";

export type TConditionValues = {
  selectedIds: Set<string>;
  /** Replace the whole selection; an empty list removes the condition. */
  setSelection: (nextIds: string[]) => void;
  /** Add the ids if none of them are selected, drop them all otherwise. */
  toggleIds: (ids: string[]) => void;
};

export const useConditionValues = (
  filter: IWorkItemFilterInstance,
  property: TWorkItemFilterProperty
): TConditionValues => {
  // Read through the `allConditionsForDisplay` COMPUTED, never through
  // `findFirstConditionByPropertyAndOperator` — that one is declared as a MobX
  // `action`, and reads inside an action are untracked, so a component would
  // never re-render on expression changes and would keep seeing "no condition
  // yet", adding a duplicate condition on every click.
  //
  // The multi-select config downgrades a single-value `in` to `exact`, so both
  // operators count as the live condition.
  const activeCondition = filter.allConditionsForDisplay.find(
    (condition) =>
      condition.property === property &&
      (condition.operator === COLLECTION_OPERATOR.IN || condition.operator === EQUALITY_OPERATOR.EXACT)
  );

  const selectedIds = useMemo(() => {
    const value = activeCondition?.value;
    if (value === undefined || value === null) return new Set<string>();
    return new Set((Array.isArray(value) ? value : [value]).map(String));
  }, [activeCondition?.value]);

  const setSelection = (nextIds: string[]) => {
    if (!activeCondition) {
      if (nextIds.length === 0) return;
      filter.addCondition(LOGICAL_OPERATOR.AND, { property, operator: COLLECTION_OPERATOR.IN, value: nextIds }, false);
      return;
    }
    if (nextIds.length === 0) {
      filter.removeCondition(activeCondition.id);
      return;
    }
    filter.updateConditionValue(activeCondition.id, nextIds);
  };

  const toggleIds = (ids: string[]) => {
    const isActive = ids.some((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    ids.forEach((id) => (isActive ? next.delete(id) : next.add(id)));
    setSelection(Array.from(next));
  };

  return { selectedIds, setSelection, toggleIds };
};

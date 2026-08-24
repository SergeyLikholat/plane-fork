/**
 * The «Ваша работа» quick-filter row: one dropdown per label category plus the
 * two-level module picker, with a single reset for everything they control.
 *
 * Semantics: labels drive one `label_id in [...]` condition and modules one
 * `module_id in [...]`. Within a property the values are ORed — including
 * across label categories, because the API models labels as a many-to-many
 * `in` lookup and an AND across categories cannot be expressed without a
 * schema-level change. The two properties AND with each other, so
 * a person label + a module does narrow down as expected.
 */
import { observer } from "mobx-react";
import { X } from "lucide-react";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
// local imports
import { LabelCategoryDropdowns } from "./label-dropdowns";
import { ModuleQuickFilter } from "./module-dropdown";
import { useConditionValues } from "./use-condition-values";

type TQuickFiltersRowProps = {
  filter: IWorkItemFilterInstance;
};

export const QuickFiltersRow = observer(function QuickFiltersRow(props: TQuickFiltersRowProps) {
  const { filter } = props;
  const labelValues = useConditionValues(filter, "label_id");
  const moduleValues = useConditionValues(filter, "module_id");

  const hasSelection = labelValues.selectedIds.size > 0 || moduleValues.selectedIds.size > 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-subtle-1 px-4 py-1.5">
      {/* Modules first: they scope the whole board («каким проектом я сейчас
          занят»), labels refine within that scope. */}
      <ModuleQuickFilter filter={filter} />
      <LabelCategoryDropdowns filter={filter} />
      {hasSelection && (
        <button
          type="button"
          onClick={() => {
            labelValues.setSelection([]);
            moduleValues.setSelection([]);
          }}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-13 text-tertiary transition-colors hover:text-secondary"
        >
          <X className="size-3" />
          Сбросить
        </button>
      )}
    </div>
  );
});

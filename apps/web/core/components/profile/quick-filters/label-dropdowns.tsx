/**
 * One dropdown per label category for «Ваша работа».
 *
 * The workspace labels are organised as a two-level tree — root labels act as
 * categories (ЛЮДИ, КАЛЕНДАРЬ, СФЕРА, ПРОЕКТЫ, ФУНКЦИЯ) and their children are
 * the actual tags. The generic filter panel exposes those children as one flat
 * list of 118 entries, with the SAME person repeated once per project, which
 * makes "show me everything tagged with one person" a multi-step chore.
 *
 * Here same-named labels across projects collapse into a single entry, and
 * picking one toggles every underlying label id at once.
 */
import { useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { X } from "lucide-react";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import type { IIssueLabel } from "@plane/types";
// hooks
import { useLabel } from "@/hooks/store/use-label";
// local imports
import { QuickFilterDropdown, QuickFilterOption } from "./dropdown-shell";
import { useConditionValues } from "./use-condition-values";

/**
 * Category order for the dropdown row. Anything not listed keeps its natural
 * label sort order and lands after these.
 */
const CATEGORY_ORDER = ["ЛЮДИ", "КАЛЕНДАРЬ", "СФЕРА", "ПРОЕКТЫ", "ФУНКЦИЯ"];

/** One option: a display name plus every label id that carries it. */
type TLabelOption = {
  name: string;
  color: string;
  labelIds: string[];
};

type TLabelCategory = {
  name: string;
  options: TLabelOption[];
};

/** Category name → options, deduplicated by label name across projects. */
const buildLabelCategories = (labels: IIssueLabel[]): TLabelCategory[] => {
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const optionsByCategory = new Map<string, Map<string, TLabelOption>>();

  labels.forEach((label) => {
    // Root labels are the categories themselves — they are not options.
    if (!label.parent) return;
    const category = labelById.get(label.parent);
    if (!category) return;

    const options = optionsByCategory.get(category.name) ?? new Map<string, TLabelOption>();
    const key = label.name.trim().toLowerCase();
    const existing = options.get(key);
    options.set(
      key,
      existing
        ? { ...existing, labelIds: [...existing.labelIds, label.id] }
        : { name: label.name, color: label.color, labelIds: [label.id] }
    );
    optionsByCategory.set(category.name, options);
  });

  return Array.from(optionsByCategory.entries())
    .map(([name, options]) => ({
      name,
      // Fresh array from Array.from — nothing outside is mutated. toSorted needs es2023.
      // eslint-disable-next-line unicorn/no-array-sort
      options: Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    // eslint-disable-next-line unicorn/no-array-sort -- same: fresh array.
    .sort((a, b) => {
      const aRank = CATEGORY_ORDER.indexOf(a.name);
      const bRank = CATEGORY_ORDER.indexOf(b.name);
      if (aRank === -1 && bRank === -1) return a.name.localeCompare(b.name);
      if (aRank === -1) return 1;
      if (bRank === -1) return -1;
      return aRank - bRank;
    });
};

type TLabelCategoryDropdownsProps = {
  filter: IWorkItemFilterInstance;
};

export const LabelCategoryDropdowns = observer(function LabelCategoryDropdowns(props: TLabelCategoryDropdownsProps) {
  const { filter } = props;
  const { workspaceSlug } = useParams();
  const { getWorkspaceLabels } = useLabel();
  const { selectedIds, setSelection, toggleIds } = useConditionValues(filter, "label_id");

  const labels = getWorkspaceLabels(workspaceSlug?.toString() ?? "");
  const categories = useMemo(() => (labels ? buildLabelCategories(labels) : []), [labels]);

  const clearCategory = (category: TLabelCategory) => {
    const next = new Set(selectedIds);
    category.options.forEach((option) => option.labelIds.forEach((labelId) => next.delete(labelId)));
    setSelection(Array.from(next));
  };

  return (
    <>
      {categories.map((category) => {
        const activeOptions = category.options.filter((option) =>
          option.labelIds.some((labelId) => selectedIds.has(labelId))
        );

        return (
          <QuickFilterDropdown
            key={category.name}
            label={category.name}
            activeCount={activeOptions.length}
            activeSummary={activeOptions[0]?.name}
          >
            {activeOptions.length > 0 && (
              <button
                type="button"
                onClick={() => clearCategory(category)}
                className="mb-1 flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-11 text-tertiary transition-colors hover:bg-layer-1-hover hover:text-secondary"
              >
                <X className="size-3" />
                Снять выбор
              </button>
            )}
            {category.options.map((option) => (
              <QuickFilterOption
                key={option.name}
                name={option.name}
                color={option.color}
                isSelected={option.labelIds.some((labelId) => selectedIds.has(labelId))}
                onClick={() => toggleIds(option.labelIds)}
              />
            ))}
          </QuickFilterDropdown>
        );
      })}
    </>
  );
});

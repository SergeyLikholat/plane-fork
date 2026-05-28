/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Hierarchical label utilities — fork-only.
 *
 * Plane's `Label` model has a self-FK `parent`. We use it as a
 * two-level category hierarchy: any label that's referenced as `parent`
 * by ≥1 other label is treated as a CATEGORY, and categories are NOT
 * selectable as task labels (they only serve as chip filters in the
 * picker). Regular labels (no children) are selectable. Children of a
 * category appear under that category's chip.
 *
 * Used by every place that picks labels for an issue:
 *   - peek/sidebar (issue-detail/label/select/label-select.tsx)
 *   - inline kanban/list (issue-layouts/properties/label-dropdown.tsx)
 *   - issue create modal (issue-modal/components/default-properties.tsx)
 *   - inbox modal (inbox/modals/create-modal/issue-properties.tsx)
 */
import { useMemo } from "react";
import type { IIssueLabel } from "@plane/types";

// "all" → no chip filter (all selectable labels)
// "orphan" → root labels with NO children (only when at least one category exists)
// any other string → category UUID; show only that category's children
export type LabelChipFilter = "all" | "orphan" | string;

export type HierarchicalLabelStructure = {
  categories: IIssueLabel[];
  orphans: IIssueLabel[];
  selectableById: Map<string, IIssueLabel>;
  hasCategories: boolean;
};

export function useHierarchicalLabelStructure(
  labels: IIssueLabel[] | null | undefined
): HierarchicalLabelStructure {
  return useMemo(() => {
    const all = labels ?? [];
    const childrenByParent = new Map<string, IIssueLabel[]>();
    for (const l of all) {
      if (l.parent) {
        const arr = childrenByParent.get(l.parent) ?? [];
        arr.push(l);
        childrenByParent.set(l.parent, arr);
      }
    }
    // Categories: top-level labels (parent == null) that have ≥1 child.
    const categories = all.filter((l) => l.parent == null && childrenByParent.has(l.id));
    const categorySet = new Set(categories.map((c) => c.id));
    // Orphans: top-level labels with NO children (regular ungrouped labels).
    const orphans = all.filter((l) => l.parent == null && !childrenByParent.has(l.id));
    // Selectable: every label that isn't a category.
    const selectableById = new Map<string, IIssueLabel>();
    for (const l of all) if (!categorySet.has(l.id)) selectableById.set(l.id, l);
    return {
      categories,
      orphans,
      selectableById,
      hasCategories: categories.length > 0,
    };
  }, [labels]);
}

/**
 * Apply chip + search filter to the project's label list. Returns only
 * selectable labels (categories are always excluded).
 */
export function filterLabelsByChip(
  labels: IIssueLabel[],
  structure: HierarchicalLabelStructure,
  activeChip: LabelChipFilter,
  query: string
): IIssueLabel[] {
  let pool = labels.filter((l) => structure.selectableById.has(l.id));
  if (structure.hasCategories) {
    if (activeChip === "orphan") {
      pool = pool.filter((l) => l.parent == null);
    } else if (activeChip !== "all") {
      pool = pool.filter((l) => l.parent === activeChip);
    }
  }
  const q = query.trim().toLowerCase();
  if (q !== "") pool = pool.filter((l) => l.name.toLowerCase().includes(q));
  return pool;
}

type ChipsProps = {
  categories: IIssueLabel[];
  orphans: IIssueLabel[];
  activeChip: LabelChipFilter;
  onChange: (next: LabelChipFilter) => void;
  className?: string;
};

/**
 * Horizontal chip row rendered above the labels list. Hidden when there
 * are no categories — falls back to a plain flat list in that case.
 */
export function LabelCategoryChips({
  categories,
  orphans,
  activeChip,
  onChange,
  className = "",
}: ChipsProps) {
  if (categories.length === 0) return null;
  const chipCls = (active: boolean): string =>
    `inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-11 leading-none transition-colors ${
      active
        ? "bg-accent-primary text-on-color"
        : "border border-subtle-1 bg-surface-2 text-secondary hover:bg-layer-1"
    }`;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      <button type="button" onClick={() => onChange("all")} className={chipCls(activeChip === "all")}>
        Все
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onChange(cat.id)}
          className={chipCls(activeChip === cat.id)}
        >
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ backgroundColor: cat.color }}
          />
          {cat.name}
        </button>
      ))}
      {orphans.length > 0 && (
        <button
          type="button"
          onClick={() => onChange("orphan")}
          className={chipCls(activeChip === "orphan")}
        >
          Без категории
        </button>
      )}
    </div>
  );
}

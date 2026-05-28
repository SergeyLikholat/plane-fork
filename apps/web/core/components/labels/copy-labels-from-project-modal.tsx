/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Dialog, Transition } from "@headlessui/react";
import { ChevronDownIcon, ChevronRightIcon, Loader, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IIssueLabel } from "@plane/types";
// hooks
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
// services
import { IssueLabelService } from "@/services/issue/issue_label.service";

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  targetProjectId: string;
  onClose: () => void;
};

type ConflictPolicy = "skip" | "rename";

const labelService = new IssueLabelService();

export const CopyLabelsFromProjectModal = observer(function CopyLabelsFromProjectModal(props: Props) {
  const { isOpen, workspaceSlug, targetProjectId, onClose } = props;

  // stores
  const { copyLabelsFromProject, fetchProjectLabels } = useLabel();
  const { joinedProjectIds, getProjectById } = useProject();

  // state
  const [sourceProjectId, setSourceProjectId] = useState<string>("");
  const [sourceLabels, setSourceLabels] = useState<IIssueLabel[] | null>(null);
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [conflict, setConflict] = useState<ConflictPolicy>("skip");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset everything when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSourceProjectId("");
    setSourceLabels(null);
    setSelected(new Set());
    setExpanded(new Set());
    setConflict("skip");
  }, [isOpen]);

  // Fetch source project labels when source changes
  useEffect(() => {
    if (!sourceProjectId) return;
    setIsLoadingLabels(true);
    setSourceLabels(null);
    setSelected(new Set());
    setExpanded(new Set());
    labelService
      .getProjectLabels(workspaceSlug, sourceProjectId)
      .then((labels) => {
        setSourceLabels(labels);
        // Auto-expand all categories so the user sees the tree.
        const categoryIds = new Set<string>();
        for (const l of labels) {
          if (l.parent) categoryIds.add(l.parent);
        }
        setExpanded(categoryIds);
      })
      .catch(() => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Ошибка",
          message: "Не удалось загрузить метки проекта-источника",
        });
        setSourceLabels([]);
      })
      .finally(() => setIsLoadingLabels(false));
  }, [sourceProjectId, workspaceSlug]);

  // Source projects: every joined project except the target.
  const sourceProjectOptions = useMemo(
    () =>
      joinedProjectIds
        .filter((id) => id !== targetProjectId)
        .map((id) => ({ id, name: getProjectById(id)?.name ?? id })),
    [joinedProjectIds, targetProjectId, getProjectById]
  );

  // Group source labels into { categoryId → children[] } and orphans.
  // A label is a category iff it has children in the same project.
  const { categories, orphans, childrenByCategory } = useMemo(() => {
    const labels = sourceLabels ?? [];
    const byParent = new Map<string, IIssueLabel[]>();
    for (const l of labels) {
      if (l.parent) {
        const arr = byParent.get(l.parent) ?? [];
        arr.push(l);
        byParent.set(l.parent, arr);
      }
    }
    const cats = labels.filter((l) => l.parent == null && byParent.has(l.id));
    const orphs = labels.filter((l) => l.parent == null && !byParent.has(l.id));
    return { categories: cats, orphans: orphs, childrenByCategory: byParent };
  }, [sourceLabels]);

  const allChildIdsForCategory = (catId: string) =>
    (childrenByCategory.get(catId) ?? []).map((c) => c.id);

  const toggleLabel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (cat: IIssueLabel) => {
    const childIds = allChildIdsForCategory(cat.id);
    const allChildrenChecked = childIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChildrenChecked) {
        // Uncheck category + all children
        next.delete(cat.id);
        for (const id of childIds) next.delete(id);
      } else {
        // Check category + all children
        next.add(cat.id);
        for (const id of childIds) next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    const all = new Set<string>();
    for (const l of sourceLabels ?? []) all.add(l.id);
    setSelected(all);
  };

  const clearAll = () => setSelected(new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async () => {
    if (selected.size === 0 || !sourceProjectId) return;
    setIsSubmitting(true);
    try {
      const result = await copyLabelsFromProject(workspaceSlug, targetProjectId, {
        source_project_id: sourceProjectId,
        label_ids: Array.from(selected),
        on_conflict: conflict,
      });
      // Re-fetch target labels to pick up parent relationships for reused categories.
      await fetchProjectLabels(workspaceSlug, targetProjectId);
      const parts: string[] = [];
      if (result.created.length) parts.push(`создано: ${result.created.length}`);
      if (result.renamed.length) parts.push(`переименовано: ${result.renamed.length}`);
      if (result.reused.length) parts.push(`переиспользовано: ${result.reused.length}`);
      if (result.skipped.length) parts.push(`пропущено: ${result.skipped.length}`);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Метки скопированы",
        message: parts.join(", ") || "Готово",
      });
      onClose();
    } catch (e) {
      const message =
        typeof e === "object" && e !== null && "error" in e
          ? String((e as { error: unknown }).error)
          : "Не удалось скопировать метки";
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalSelectable = (sourceLabels ?? []).length;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-xl rounded-md bg-surface-1 shadow-raised-200">
                <div className="flex items-center justify-between border-b border-subtle px-5 py-3">
                  <Dialog.Title className="text-14 font-medium text-primary">
                    Скопировать метки из другого проекта
                  </Dialog.Title>
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-tertiary hover:text-primary"
                    aria-label="Закрыть"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="space-y-4 px-5 py-4">
                  {/* Source project select */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-13 text-secondary">Проект-источник</label>
                    <div className="relative">
                      <select
                        value={sourceProjectId}
                        onChange={(e) => setSourceProjectId(e.target.value)}
                        className="h-9 w-full appearance-none rounded-md border-[0.5px] border-subtle-1 bg-layer-2 px-3 pr-8 text-13 text-secondary focus:outline-none focus:ring-1 focus:ring-accent-strong"
                      >
                        <option value="">— выберите проект —</option>
                        {sourceProjectOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-tertiary" />
                    </div>
                  </div>

                  {/* Labels tree */}
                  {sourceProjectId && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-13 text-secondary">
                          Метки {totalSelectable > 0 ? `(${selected.size} / ${totalSelectable})` : ""}
                        </span>
                        {sourceLabels && sourceLabels.length > 0 && (
                          <div className="flex gap-2 text-11">
                            <button
                              type="button"
                              onClick={selectAll}
                              className="text-secondary hover:text-primary"
                            >
                              Выделить всё
                            </button>
                            <button
                              type="button"
                              onClick={clearAll}
                              className="text-secondary hover:text-primary"
                            >
                              Очистить
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="max-h-64 overflow-y-auto rounded-md border-[0.5px] border-subtle-1 bg-layer-2 p-2">
                        {isLoadingLabels ? (
                          <div className="flex items-center gap-2 py-4 text-13 text-tertiary">
                            <Loader className="size-3.5 animate-spin" /> Загрузка…
                          </div>
                        ) : sourceLabels && sourceLabels.length === 0 ? (
                          <div className="py-4 text-13 text-tertiary">В этом проекте нет меток.</div>
                        ) : (
                          <>
                            {categories.map((cat) => {
                              const children = childrenByCategory.get(cat.id) ?? [];
                              const isExpanded = expanded.has(cat.id);
                              const checkedChildren = children.filter((c) => selected.has(c.id)).length;
                              const allChecked = checkedChildren === children.length && children.length > 0;
                              const someChecked =
                                checkedChildren > 0 && checkedChildren < children.length;
                              return (
                                <div key={cat.id}>
                                  <div className="flex items-center gap-1.5 rounded-sm px-1 py-1 hover:bg-surface-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleExpand(cat.id)}
                                      className="flex size-4 items-center justify-center text-tertiary"
                                      aria-label={isExpanded ? "Свернуть" : "Развернуть"}
                                    >
                                      {isExpanded ? (
                                        <ChevronDownIcon className="size-3.5" />
                                      ) : (
                                        <ChevronRightIcon className="size-3.5" />
                                      )}
                                    </button>
                                    <input
                                      type="checkbox"
                                      checked={allChecked}
                                      ref={(el) => {
                                        if (el) el.indeterminate = someChecked;
                                      }}
                                      onChange={() => toggleCategory(cat)}
                                      className="size-3.5 cursor-pointer rounded-sm border-subtle accent-accent-primary"
                                    />
                                    <span
                                      className="size-2.5 flex-shrink-0 rounded-full"
                                      style={{ backgroundColor: cat.color }}
                                    />
                                    <span className="text-13 text-primary">{cat.name}</span>
                                    <span className="ml-1 text-11 text-tertiary">
                                      ({children.length})
                                    </span>
                                  </div>
                                  {isExpanded && (
                                    <div className="ml-5">
                                      {children.map((ch) => (
                                        <label
                                          key={ch.id}
                                          className="flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 hover:bg-surface-2"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selected.has(ch.id)}
                                            onChange={() => toggleLabel(ch.id)}
                                            className="size-3.5 cursor-pointer rounded-sm border-subtle accent-accent-primary"
                                          />
                                          <span
                                            className="size-2.5 flex-shrink-0 rounded-full"
                                            style={{ backgroundColor: ch.color }}
                                          />
                                          <span className="text-13 text-secondary">{ch.name}</span>
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {orphans.length > 0 && (
                              <>
                                {categories.length > 0 && (
                                  <div className="mt-2 mb-1 border-t border-subtle pt-2 text-11 text-tertiary">
                                    Без категории
                                  </div>
                                )}
                                {orphans.map((l) => (
                                  <label
                                    key={l.id}
                                    className="flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 hover:bg-surface-2"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selected.has(l.id)}
                                      onChange={() => toggleLabel(l.id)}
                                      className="size-3.5 cursor-pointer rounded-sm border-subtle accent-accent-primary"
                                    />
                                    <span
                                      className="size-2.5 flex-shrink-0 rounded-full"
                                      style={{ backgroundColor: l.color }}
                                    />
                                    <span className="text-13 text-secondary">{l.name}</span>
                                  </label>
                                ))}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Conflict policy */}
                  {sourceProjectId && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-13 text-secondary">
                        Если метка с таким именем уже есть в этом проекте
                      </span>
                      <div className="flex flex-col gap-1">
                        <label className="flex cursor-pointer items-center gap-2 text-13 text-secondary">
                          <input
                            type="radio"
                            name="conflict"
                            value="skip"
                            checked={conflict === "skip"}
                            onChange={() => setConflict("skip")}
                            className="accent-accent-primary"
                          />
                          Пропустить (рекомендуется)
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-13 text-secondary">
                          <input
                            type="radio"
                            name="conflict"
                            value="rename"
                            checked={conflict === "rename"}
                            onChange={() => setConflict("rename")}
                            className="accent-accent-primary"
                          />
                          Создать с пометкой «(копия)»
                        </label>
                      </div>
                      <p className="text-11 text-tertiary">
                        Категории всегда переиспользуются по имени — новых дубликатов не появится.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
                  <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
                    Отмена
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleCopy}
                    loading={isSubmitting}
                    disabled={selected.size === 0 || isSubmitting || !sourceProjectId}
                  >
                    Скопировать {selected.size > 0 ? `(${selected.size})` : ""}
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
});

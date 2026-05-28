/**
 * UI for the project-scoped «Передача задач» automation.
 *
 * Layout: a stacked, drag-reorderable list of rules with toggle/edit/delete
 * controls; a "+ Создать правило" button on the right. Editing/creating opens
 * a modal that uses Plane's standard EmojiPicker (emoji + lucide + material
 * icons) for the rule's logo.
 *
 * Reordering uses native HTML5 drag-and-drop — the rule list is short and the
 * heavyweight pragmatic-dnd machinery used elsewhere in Plane would be
 * overkill here.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ArrowRight, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
// plane imports
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueTransferRule, TLogoProps, TTransferRuleActions } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Loader, ModalCore, ToggleSwitch } from "@plane/ui";
// hooks
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useProjectState } from "@/hooks/store/use-project-state";
// store
import { transferRuleStore } from "@/store/transfer-rule.store";

type Props = {
  projectId: string;
  workspaceSlug: string;
};

const isEmptyLogo = (lp: TLogoProps | Record<string, never> | undefined): boolean =>
  !lp || !("in_use" in lp) || !lp.in_use;

const RuleLogo = ({ rule, size = 16 }: { rule: TIssueTransferRule; size?: number }) => {
  if (!isEmptyLogo(rule.logo_props)) {
    return <Logo logo={rule.logo_props as TLogoProps} size={size} />;
  }
  // legacy fallback to short emoji string
  return <span style={{ fontSize: size, lineHeight: 1 }}>{rule.icon || "↗"}</span>;
};

export const TransferRulesRoot = observer(function TransferRulesRoot(props: Props) {
  const { projectId, workspaceSlug } = props;

  const { getProjectStates } = useProjectState();
  const states = getProjectStates(projectId) ?? [];
  const stateById = useMemo(() => Object.fromEntries(states.map((s) => [s.id, s])), [states]);

  const [editingRule, setEditingRule] = useState<TIssueTransferRule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    transferRuleStore.fetchRules(workspaceSlug, projectId).catch(() => {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Не удалось загрузить правила" });
    });
  }, [workspaceSlug, projectId]);

  const rules = transferRuleStore.rulesByProject[projectId] ?? [];
  const isLoading = transferRuleStore.isLoadingFor(workspaceSlug, projectId);

  const handleToggle = async (rule: TIssueTransferRule) => {
    try {
      await transferRuleStore.updateRule(workspaceSlug, projectId, rule.id, {
        is_active: !rule.is_active,
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Не удалось переключить правило" });
    }
  };

  const handleDelete = async (rule: TIssueTransferRule) => {
    if (!confirm(`Удалить правило «${rule.name}»?`)) return;
    try {
      await transferRuleStore.deleteRule(workspaceSlug, projectId, rule.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Удалено", message: "Правило удалено" });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Не удалось удалить правило" });
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const ids = rules.map((r) => r.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, draggedId);
    setDraggedId(null);
    setDragOverId(null);
    try {
      await transferRuleStore.reorderRules(workspaceSlug, projectId, reordered);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Не удалось изменить порядок" });
    }
  };

  const renderSourceLabel = (rule: TIssueTransferRule): string => {
    if (!rule.source_state_ids?.length) return "Из любой колонки";
    const names = rule.source_state_ids
      .map((id) => stateById[id]?.name)
      .filter(Boolean) as string[];
    if (!names.length) return "Из любой колонки";
    return `Из: ${names.join(", ")}`;
  };

  return (
    <section className="mt-10 border-t border-custom-border-100 pt-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-custom-text-100">Передача задач</h3>
          <p className="mt-1 text-sm text-custom-text-300">
            Переносите карточки между колонками одним кликом, при необходимости меняя
            исполнителей и метки. Тяните за ⠿ чтобы изменить порядок отображения в попапе на канбан-карточке.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          prependIcon={<Plus className="h-3 w-3" />}
          onClick={() => {
            setEditingRule(null);
            setShowForm(true);
          }}
        >
          Создать правило
        </Button>
      </div>

      {isLoading && rules.length === 0 ? (
        <Loader className="space-y-2">
          <Loader.Item height="44px" />
          <Loader.Item height="44px" />
        </Loader>
      ) : rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-custom-border-200 px-4 py-8 text-center text-sm text-custom-text-300">
          Правил пока нет. Создайте первое — оно появится на карточках задач в Канбане.
        </div>
      ) : (
        <ul className="divide-y divide-custom-border-100 rounded-md border border-custom-border-200">
          {rules.map((rule) => {
            const target = stateById[rule.target_state_id];
            const isDragOver = dragOverId === rule.id && draggedId !== rule.id;
            return (
              <li
                key={rule.id}
                draggable
                onDragStart={(e) => {
                  setDraggedId(rule.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverId !== rule.id) setDragOverId(rule.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === rule.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleDrop(rule.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                  isDragOver ? "bg-custom-background-80" : ""
                } ${draggedId === rule.id ? "opacity-50" : ""}`}
              >
                <span
                  className="cursor-grab text-custom-text-300 hover:text-custom-text-100 active:cursor-grabbing"
                  aria-label="Изменить порядок"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <span className="flex h-5 w-5 items-center justify-center" aria-hidden>
                  <RuleLogo rule={rule} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-custom-text-100">
                      {rule.name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-custom-text-300">
                    <span>{renderSourceLabel(rule)}</span>
                    <ArrowRight className="h-3 w-3 shrink-0" />
                    <span className="inline-flex items-center gap-1">
                      {target?.color ? (
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: target.color }}
                        />
                      ) : null}
                      <span className="truncate">{target?.name ?? "—"}</span>
                    </span>
                  </div>
                </div>
                <ToggleSwitch value={rule.is_active} onChange={() => handleToggle(rule)} />
                <button
                  type="button"
                  className="rounded p-1 text-custom-text-300 hover:bg-custom-background-80 hover:text-custom-text-100"
                  onClick={() => {
                    setEditingRule(rule);
                    setShowForm(true);
                  }}
                  aria-label="Изменить правило"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-custom-text-300 hover:bg-custom-background-80 hover:text-red-500"
                  onClick={() => handleDelete(rule)}
                  aria-label="Удалить правило"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <TransferRuleFormModal
          isOpen={showForm}
          onClose={() => {
            setShowForm(false);
            setEditingRule(null);
          }}
          rule={editingRule}
          projectId={projectId}
          workspaceSlug={workspaceSlug}
        />
      )}
    </section>
  );
});

// ---------------------------------------------------------------- form modal

type FormProps = {
  isOpen: boolean;
  onClose: () => void;
  rule: TIssueTransferRule | null;
  projectId: string;
  workspaceSlug: string;
};

// Empty by default — `iconType="material"` in EmojiPicker means a Lucide
// name like "ArrowUpRight" wouldn't resolve and would render as text. Leave
// the logo unset until the user picks something; `RuleLogo` falls back to
// the default ↗ glyph when `logo_props` is empty.
const DEFAULT_LOGO: TLogoProps = { in_use: "icon" } as TLogoProps;

type FormState = {
  name: string;
  logo_props: TLogoProps;
  source_all: boolean;
  source_state_ids: string[];
  target_state_id: string;
  add_assignees: string[];
  remove_assignees_all: boolean;
  remove_assignees: string[];
  add_labels: string[];
  remove_labels_all: boolean;
  remove_labels: string[];
};

const initialFromRule = (rule: TIssueTransferRule | null): FormState => {
  const lp = (rule?.logo_props as TLogoProps | undefined) ?? null;
  return {
    name: rule?.name ?? "",
    logo_props: lp && lp.in_use ? lp : DEFAULT_LOGO,
    source_all: !rule || (rule.source_state_ids ?? []).length === 0,
    source_state_ids: rule?.source_state_ids ?? [],
    target_state_id: rule?.target_state_id ?? "",
    add_assignees: rule?.actions?.add_assignees ?? [],
    remove_assignees_all: rule?.actions?.remove_assignees === "all",
    remove_assignees: Array.isArray(rule?.actions?.remove_assignees) ? rule.actions.remove_assignees : [],
    add_labels: rule?.actions?.add_labels ?? [],
    remove_labels_all: rule?.actions?.remove_labels === "all",
    remove_labels: Array.isArray(rule?.actions?.remove_labels) ? rule.actions.remove_labels : [],
  };
};

const TransferRuleFormModal = observer(function TransferRuleFormModal(props: FormProps) {
  const { isOpen, onClose, rule, projectId, workspaceSlug } = props;

  const { getProjectStates } = useProjectState();
  const { getProjectLabels } = useLabel();
  const { project } = useMember();

  const states = getProjectStates(projectId) ?? [];
  const labels = getProjectLabels(projectId) ?? [];
  const memberIds = project.getProjectMemberIds(projectId, false) ?? [];
  const memberById = (id: string) => project.getProjectMemberDetails(id, projectId);

  const [form, setForm] = useState<FormState>(() => initialFromRule(rule));
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setForm(initialFromRule(rule));
  }, [rule?.id]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleInArray = (arr: string[], id: string): string[] =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  const buildActions = (): TTransferRuleActions => {
    const actions: TTransferRuleActions = {};
    if (form.add_assignees.length) actions.add_assignees = form.add_assignees;
    if (form.remove_assignees_all) actions.remove_assignees = "all";
    else if (form.remove_assignees.length) actions.remove_assignees = form.remove_assignees;
    if (form.add_labels.length) actions.add_labels = form.add_labels;
    if (form.remove_labels_all) actions.remove_labels = "all";
    else if (form.remove_labels.length) actions.remove_labels = form.remove_labels;
    return actions;
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Введите название правила" });
      return;
    }
    if (!form.target_state_id) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Выберите целевую колонку" });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        logo_props: form.logo_props,
        // Keep `icon` for legacy fallback display. Empty string when using
        // the new picker.
        icon: "",
        source_state_ids: form.source_all ? [] : form.source_state_ids,
        target_state_id: form.target_state_id,
        actions: buildActions(),
      };
      if (rule) {
        await transferRuleStore.updateRule(workspaceSlug, projectId, rule.id, payload);
      } else {
        await transferRuleStore.createRule(workspaceSlug, projectId, payload);
      }
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Сохранено", message: "Правило сохранено" });
      onClose();
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Ошибка",
        message: err?.detail ?? "Не удалось сохранить правило",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {rule ? "Редактирование правила" : "Новое правило передачи"}
          </h3>
        </div>

        <div className="space-y-4">
          {/* name + emoji-icon picker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-custom-text-300">Название</label>
            <div className="flex gap-2">
              <EmojiPicker
                iconType="material"
                isOpen={pickerOpen}
                handleToggle={(v: boolean) => setPickerOpen(v)}
                buttonClassName="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-custom-border-200 bg-custom-background-100"
                label={<Logo logo={form.logo_props} size={18} />}
                onChange={(val: any) => {
                  if (val?.type === "emoji") {
                    update("logo_props", { in_use: "emoji", emoji: { value: val.value } });
                  } else if (val?.type === "icon") {
                    update("logo_props", { in_use: "icon", icon: val.value });
                  }
                  setPickerOpen(false);
                }}
                defaultIconColor={form.logo_props.icon?.color}
                defaultOpen={
                  form.logo_props.in_use === "emoji"
                    ? EmojiIconPickerTypes.EMOJI
                    : EmojiIconPickerTypes.ICON
                }
              />
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Например: В работу"
                className="flex-1 rounded-md border border-custom-border-200 bg-custom-background-100 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* target state */}
          <div>
            <label className="mb-1 block text-xs font-medium text-custom-text-300">
              Куда переносить (целевая колонка)
            </label>
            <select
              value={form.target_state_id}
              onChange={(e) => update("target_state_id", e.target.value)}
              className="w-full rounded-md border border-custom-border-200 bg-custom-background-100 px-3 py-1.5 text-sm"
            >
              <option value="">— выберите состояние —</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* source states */}
          <div>
            <label className="mb-1 flex items-center gap-2 text-xs font-medium text-custom-text-300">
              <input
                type="checkbox"
                checked={form.source_all}
                onChange={(e) => update("source_all", e.target.checked)}
              />
              Доступно из любой колонки
            </label>
            {!form.source_all && (
              <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-md border border-custom-border-200 p-2 text-sm">
                {states.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.source_state_ids.includes(s.id)}
                      onChange={() =>
                        update("source_state_ids", toggleInArray(form.source_state_ids, s.id))
                      }
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* actions: assignees */}
          <details className="rounded-md border border-custom-border-200 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-custom-text-200">Действия с исполнителями</summary>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.remove_assignees_all}
                  onChange={(e) => update("remove_assignees_all", e.target.checked)}
                />
                Снять всех текущих исполнителей
              </label>
              <div>
                <div className="mb-1 text-xs text-custom-text-300">Добавить исполнителей:</div>
                <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded border border-custom-border-100 p-2">
                  {memberIds.map((id) => {
                    const m = memberById(id);
                    if (!m) return null;
                    return (
                      <label key={id} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.add_assignees.includes(id)}
                          onChange={() => update("add_assignees", toggleInArray(form.add_assignees, id))}
                        />
                        <span className="truncate text-xs">{m.member.display_name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </details>

          {/* actions: labels */}
          <details className="rounded-md border border-custom-border-200 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-custom-text-200">Действия с метками</summary>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.remove_labels_all}
                  onChange={(e) => update("remove_labels_all", e.target.checked)}
                />
                Снять все текущие метки
              </label>
              <div>
                <div className="mb-1 text-xs text-custom-text-300">Прикрепить метки:</div>
                <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded border border-custom-border-100 p-2">
                  {labels.map((l) => (
                    <label key={l.id} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.add_labels.includes(l.id)}
                        onChange={() => update("add_labels", toggleInArray(form.add_labels, l.id))}
                      />
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: l.color || "#888" }}
                      />
                      <span className="truncate text-xs">{l.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={submitting}>
            {rule ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});

export { RuleLogo };

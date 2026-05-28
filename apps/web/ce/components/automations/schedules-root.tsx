/**
 * UI for project-scoped scheduled automations («Расписания»).
 *
 * Sister to `transfer-rules-root.tsx` but for time-driven rules — a Celery
 * beat task scans matching issues every 30 min and applies the same kind of
 * state move + assignee/label mutation. No manual trigger UI on cards.
 *
 * Form mirrors the manual rule form (icon picker, source states, target,
 * assignee/label actions) plus a trigger config block.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ArrowRight, Clock, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
// plane imports
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TAutomationTriggerType,
  TIssueAutomationSchedule,
  TLogoProps,
  TTransferRuleActions,
} from "@plane/types";
import { Button, EModalPosition, EModalWidth, Loader, ModalCore, ToggleSwitch } from "@plane/ui";
// hooks
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useProjectState } from "@/hooks/store/use-project-state";
// store
import { automationScheduleStore } from "@/store/automation-schedule.store";

type Props = {
  projectId: string;
  workspaceSlug: string;
};

const isEmptyLogo = (lp: TLogoProps | Record<string, never> | undefined): boolean =>
  !lp || !("in_use" in lp) || !lp.in_use;

const ScheduleLogo = ({ schedule, size = 16 }: { schedule: TIssueAutomationSchedule; size?: number }) => {
  if (!isEmptyLogo(schedule.logo_props)) {
    return <Logo logo={schedule.logo_props as TLogoProps} size={size} />;
  }
  return <Clock style={{ width: size, height: size }} />;
};

export const SchedulesRoot = observer(function SchedulesRoot(props: Props) {
  const { projectId, workspaceSlug } = props;

  const { getProjectStates } = useProjectState();
  const states = getProjectStates(projectId) ?? [];
  const stateById = useMemo(() => Object.fromEntries(states.map((s) => [s.id, s])), [states]);

  const [editing, setEditing] = useState<TIssueAutomationSchedule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    automationScheduleStore.fetchSchedules(workspaceSlug, projectId).catch(() => {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Не удалось загрузить расписания" });
    });
  }, [workspaceSlug, projectId]);

  const items = automationScheduleStore.schedulesByProject[projectId] ?? [];
  const isLoading = automationScheduleStore.isLoadingFor(workspaceSlug, projectId);

  const handleToggle = async (item: TIssueAutomationSchedule) => {
    try {
      await automationScheduleStore.updateSchedule(workspaceSlug, projectId, item.id, {
        is_active: !item.is_active,
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Не удалось переключить расписание" });
    }
  };

  const handleDelete = async (item: TIssueAutomationSchedule) => {
    if (!confirm(`Удалить расписание «${item.name}»?`)) return;
    try {
      await automationScheduleStore.deleteSchedule(workspaceSlug, projectId, item.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Удалено", message: "Расписание удалено" });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Не удалось удалить" });
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const ids = items.map((r) => r.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, draggedId);
    setDraggedId(null);
    setDragOverId(null);
    try {
      await automationScheduleStore.reorderSchedules(workspaceSlug, projectId, reordered);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Не удалось изменить порядок" });
    }
  };

  const renderTriggerLabel = (item: TIssueAutomationSchedule): string => {
    if (item.trigger_type === "deadline_within") {
      const days = item.trigger_config?.days ?? 0;
      return `Когда до срока ≤ ${days} дн.`;
    }
    return item.trigger_type;
  };

  const renderSourceLabel = (item: TIssueAutomationSchedule): string => {
    if (!item.source_state_ids?.length) return "из любой колонки";
    const names = item.source_state_ids.map((id) => stateById[id]?.name).filter(Boolean) as string[];
    if (!names.length) return "из любой колонки";
    return `из: ${names.join(", ")}`;
  };

  return (
    <section className="mt-10 border-t border-custom-border-100 pt-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-custom-text-100">Расписания</h3>
          <p className="mt-1 text-sm text-custom-text-300">
            Автоматические правила, которые срабатывают по времени. Например — переносить задачи в «В процессе»,
            когда до срока остаётся ≤ 3 дней.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          prependIcon={<Plus className="h-3 w-3" />}
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          Создать расписание
        </Button>
      </div>

      {isLoading && items.length === 0 ? (
        <Loader className="space-y-2">
          <Loader.Item height="44px" />
          <Loader.Item height="44px" />
        </Loader>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-custom-border-200 px-4 py-8 text-center text-sm text-custom-text-300">
          Расписаний пока нет. Создайте первое — оно будет проверяться раз в 30 минут.
        </div>
      ) : (
        <ul className="divide-y divide-custom-border-100 rounded-md border border-custom-border-200">
          {items.map((item) => {
            const target = stateById[item.target_state_id];
            const isDragOver = dragOverId === item.id && draggedId !== item.id;
            return (
              <li
                key={item.id}
                draggable
                onDragStart={(e) => {
                  setDraggedId(item.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverId !== item.id) setDragOverId(item.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === item.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleDrop(item.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                  isDragOver ? "bg-custom-background-80" : ""
                } ${draggedId === item.id ? "opacity-50" : ""}`}
              >
                <span className="cursor-grab text-custom-text-300 hover:text-custom-text-100 active:cursor-grabbing">
                  <GripVertical className="h-4 w-4" />
                </span>
                <span className="flex h-5 w-5 items-center justify-center" aria-hidden>
                  <ScheduleLogo schedule={item} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-custom-text-100">{item.name}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-custom-text-300">
                    <span>{renderTriggerLabel(item)}</span>
                    <span>·</span>
                    <span>{renderSourceLabel(item)}</span>
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
                <ToggleSwitch value={item.is_active} onChange={() => handleToggle(item)} />
                <button
                  type="button"
                  className="rounded p-1 text-custom-text-300 hover:bg-custom-background-80 hover:text-custom-text-100"
                  onClick={() => {
                    setEditing(item);
                    setShowForm(true);
                  }}
                  aria-label="Изменить"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-custom-text-300 hover:bg-custom-background-80 hover:text-red-500"
                  onClick={() => handleDelete(item)}
                  aria-label="Удалить"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <ScheduleFormModal
          isOpen={showForm}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          schedule={editing}
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
  schedule: TIssueAutomationSchedule | null;
  projectId: string;
  workspaceSlug: string;
};

// Empty by default — `iconType="material"` in EmojiPicker means a Lucide
// name like "Clock" wouldn't resolve and would render as text. Leave the
// logo unset until the user picks something; `ScheduleLogo` falls back to
// a default Clock glyph when `logo_props` is empty.
const DEFAULT_LOGO: TLogoProps = { in_use: "icon" } as TLogoProps;

type FormState = {
  name: string;
  logo_props: TLogoProps;
  source_all: boolean;
  source_state_ids: string[];
  target_state_id: string;
  trigger_type: TAutomationTriggerType;
  days: number;
  add_assignees: string[];
  remove_assignees_all: boolean;
  remove_assignees: string[];
  add_labels: string[];
  remove_labels_all: boolean;
  remove_labels: string[];
};

const initialFromSchedule = (schedule: TIssueAutomationSchedule | null): FormState => {
  const lp = (schedule?.logo_props as TLogoProps | undefined) ?? null;
  return {
    name: schedule?.name ?? "",
    logo_props: lp && lp.in_use ? lp : DEFAULT_LOGO,
    source_all: !schedule || (schedule.source_state_ids ?? []).length === 0,
    source_state_ids: schedule?.source_state_ids ?? [],
    target_state_id: schedule?.target_state_id ?? "",
    trigger_type: schedule?.trigger_type ?? "deadline_within",
    days: schedule?.trigger_config?.days ?? 3,
    add_assignees: schedule?.actions?.add_assignees ?? [],
    remove_assignees_all: schedule?.actions?.remove_assignees === "all",
    remove_assignees: Array.isArray(schedule?.actions?.remove_assignees)
      ? schedule.actions.remove_assignees
      : [],
    add_labels: schedule?.actions?.add_labels ?? [],
    remove_labels_all: schedule?.actions?.remove_labels === "all",
    remove_labels: Array.isArray(schedule?.actions?.remove_labels)
      ? schedule.actions.remove_labels
      : [],
  };
};

const ScheduleFormModal = observer(function ScheduleFormModal(props: FormProps) {
  const { isOpen, onClose, schedule, projectId, workspaceSlug } = props;

  const { getProjectStates } = useProjectState();
  const { getProjectLabels } = useLabel();
  const { project } = useMember();

  const states = getProjectStates(projectId) ?? [];
  const labels = getProjectLabels(projectId) ?? [];
  const memberIds = project.getProjectMemberIds(projectId, false) ?? [];
  const memberById = (id: string) => project.getProjectMemberDetails(id, projectId);

  const [form, setForm] = useState<FormState>(() => initialFromSchedule(schedule));
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setForm(initialFromSchedule(schedule));
  }, [schedule?.id]);

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
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Введите название" });
      return;
    }
    if (!form.target_state_id) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Выберите целевую колонку" });
      return;
    }
    if (form.trigger_type === "deadline_within" && (form.days < 0 || form.days > 365)) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: "Дней должно быть 0…365" });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        logo_props: form.logo_props,
        icon: "",
        source_state_ids: form.source_all ? [] : form.source_state_ids,
        target_state_id: form.target_state_id,
        trigger_type: form.trigger_type,
        trigger_config: { days: form.days },
        actions: buildActions(),
      };
      if (schedule) {
        await automationScheduleStore.updateSchedule(workspaceSlug, projectId, schedule.id, payload);
      } else {
        await automationScheduleStore.createSchedule(workspaceSlug, projectId, payload);
      }
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Сохранено", message: "Расписание сохранено" });
      onClose();
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Ошибка",
        message: err?.detail ?? JSON.stringify(err) ?? "Не удалось сохранить",
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
            {schedule ? "Редактирование расписания" : "Новое расписание"}
          </h3>
        </div>

        <div className="space-y-4">
          {/* name + icon picker */}
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
                placeholder="Например: Поджимающий дедлайн"
                className="flex-1 rounded-md border border-custom-border-200 bg-custom-background-100 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* trigger config */}
          <div className="rounded-md border border-custom-border-200 px-3 py-2.5">
            <div className="mb-2 text-xs font-medium text-custom-text-300">Условие срабатывания</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Когда до</span>
              <span className="font-medium">target_date</span>
              <span>остаётся ≤</span>
              <input
                type="number"
                min={0}
                max={365}
                value={form.days}
                onChange={(e) => update("days", Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                className="w-20 rounded-md border border-custom-border-200 bg-custom-background-100 px-2 py-1 text-sm"
              />
              <span>дней</span>
            </div>
            <p className="mt-2 text-xs text-custom-text-300">
              Сканируется каждые 30 минут. Задачи без даты завершения игнорируются.
            </p>
          </div>

          {/* target state */}
          <div>
            <label className="mb-1 block text-xs font-medium text-custom-text-300">
              Куда переносить
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
              Из любой колонки
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
            {schedule ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});

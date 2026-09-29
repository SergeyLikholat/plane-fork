/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * The three blocks of the ⋯ menu, from plain inputs:
 * 1. by kind — Big task / step / under control / own task;
 * 2. planning — date, weight, «Может быть», module;
 * 3. service — links, copy, archive, delete.
 */

import {
  Archive,
  ArrowUp,
  Briefcase,
  CalendarClock,
  CalendarRange,
  CalendarSearch,
  CalendarX2,
  CheckCheck,
  Copy,
  CornerDownRight,
  ExternalLink,
  Eye,
  Hand,
  Hash,
  Hourglass,
  Layers,
  Link,
  ListTree,
  Network,
  Plus,
  Repeat,
  Send,
  Sun,
  Sunrise,
  Trash2,
  Undo2,
  UserRoundCog,
} from "lucide-react";
import { WeightIcon } from "@/components/estimates/weight-icon";
import { FREQUENCY_OPTIONS } from "@/components/issues/issue-detail/control/helpers";
import type { TControlFrequency } from "@/services/issue/issue-control.service";
import type { TMenuEntry, TMenuGroup, TMenuIcon } from "./menu-entries";
import type { TWorkItemKind } from "./use-work-item-kind";

export type TMenuActions = {
  openNextStep: () => void;
  showSteps: () => void;
  completeBigTask: () => void;
  openParent: () => void;
  openNextStepForParent: () => void;
  openChildCreate: () => void;
  openHandover: () => void;
  makeBigTask: () => void;
  openBigTaskPicker: () => void;
  touch: () => void;
  setup: () => void;
  accept: () => void;
  returnWork: () => void;
  openSwapPerson: () => void;
  setFrequency: (value: TControlFrequency) => void;
  moveTo: (when: "today" | "tomorrow" | "next-monday") => void;
  openDatePicker: () => void;
  clearDate: () => void;
  setWeight: (pointId: string) => void;
  moveToMaybe: () => void;
  toggleModule: (moduleId: string) => void;
  copyLink: () => void;
  copyKey: () => void;
  openInNewTab: () => void;
  makeCopy: () => void;
  archive: () => void;
  remove: () => void;
};

export type TMenuInput = {
  kind: TWorkItemKind;
  canEdit: boolean;
  canDelete: boolean;
  /** Archive handler exists and the item is completed / cancelled. */
  canArchive: boolean;
  hasDate: boolean;
  hasKey: boolean;
  hasBigTasksState: boolean;
  hasControlState: boolean;
  /** «Может быть» exists and the item is not there yet. */
  canMoveToMaybe: boolean;
  /** Estimate points of «Вес»; empty when the project has none. */
  weights: { weight: number; pointId: string }[];
  currentWeight: number | null;
  /** Project modules; null until loaded. */
  modules: { id: string; name: string; isSelected: boolean }[] | null;
  /** Control frequency; undefined until loaded. */
  frequency: TControlFrequency | undefined;
  /** Variant-specific service entries (remove from cycle / module). */
  extraServiceEntries: TMenuEntry[];
};

const weightIcon =
  (weight: number): TMenuIcon =>
  ({ className }) => <WeightIcon weight={weight} className={className} />;

const bigTaskEntries = (a: TMenuActions): TMenuEntry[] => [
  { key: "next-step", title: "Следующий шаг", icon: Plus, action: a.openNextStep },
  { key: "show-steps", title: "Показать шаги", icon: ListTree, action: a.showSteps },
  { key: "complete-big", title: "Big task выполнена", icon: CheckCheck, action: a.completeBigTask },
];

const stepEntries = (a: TMenuActions): TMenuEntry[] => [
  { key: "open-parent", title: "Перейти к Big task", icon: ArrowUp, action: a.openParent },
  { key: "next-after", title: "Следующий шаг после этого", icon: Plus, action: a.openNextStepForParent },
];

const controlEntries = (input: TMenuInput, a: TMenuActions): TMenuEntry[] => {
  const { controlPhase, canControlAct } = input.kind;
  const entries: TMenuEntry[] = [];
  if (canControlAct && controlPhase === "setup")
    entries.push({ key: "setup", title: "Поставил", icon: Send, action: a.setup });
  if (canControlAct && controlPhase === "check")
    entries.push({ key: "touch", title: "Коснулся", icon: Hand, action: a.touch });
  if (canControlAct && controlPhase === "acceptance") {
    entries.push({ key: "accept", title: "Принял", icon: CheckCheck, action: a.accept });
    entries.push({ key: "return", title: "Вернул", icon: Undo2, action: a.returnWork });
  }
  entries.push({ key: "swap-person", title: "Сменить исполнителя…", icon: UserRoundCog, action: a.openSwapPerson });
  entries.push({
    key: "frequency",
    title: "Частота",
    icon: Repeat,
    children: FREQUENCY_OPTIONS.map((option) => ({
      key: `frequency-${option.value}`,
      title: option.label,
      isSelected: input.frequency === option.value,
      action: () => a.setFrequency(option.value),
    })),
  });
  return entries;
};

const ownEntries = (input: TMenuInput, a: TMenuActions): TMenuEntry[] => {
  const isStep = !!input.kind.bigTaskParent;
  const entries: TMenuEntry[] = [
    { key: "child", title: "Дочерняя задача", icon: CornerDownRight, action: a.openChildCreate },
  ];
  if (input.hasControlState)
    entries.push({ key: "handover", title: "Передать на контроль…", icon: Eye, action: a.openHandover });
  if (!isStep && input.hasBigTasksState) {
    entries.push({ key: "make-big", title: "Сделать Big task", icon: Briefcase, action: a.makeBigTask });
    entries.push({ key: "make-step", title: "Сделать шагом Big task…", icon: Network, action: a.openBigTaskPicker });
  }
  return entries;
};

/**
 * Attach to a Big task from any kind of work item: a control task can be a
 * step too («Сделать шагом Big task…»), and a step can move to another Big
 * task. Own tasks that are not steps already get it in ownEntries.
 */
const attachEntries = (input: TMenuInput, a: TMenuActions): TMenuEntry[] => {
  if (!input.hasBigTasksState) return [];
  if (input.kind.bigTaskParent)
    return [{ key: "move-step", title: "Перенести в другую Big task…", icon: Network, action: a.openBigTaskPicker }];
  if (input.kind.controlPhase)
    return [{ key: "make-step", title: "Сделать шагом Big task…", icon: Network, action: a.openBigTaskPicker }];
  return [];
};

const kindEntries = (input: TMenuInput, a: TMenuActions): TMenuEntry[] => {
  const { kind } = input;
  if (kind.isClosed) return [];
  if (kind.isBigTask) return bigTaskEntries(a);
  const entries = kind.bigTaskParent ? stepEntries(a) : [];
  return [
    ...entries,
    ...(kind.controlPhase ? controlEntries(input, a) : ownEntries(input, a)),
    ...attachEntries(input, a),
  ];
};

const rescheduleEntry = (input: TMenuInput, a: TMenuActions): TMenuEntry => ({
  key: "reschedule",
  title: "Перенести",
  icon: CalendarClock,
  children: [
    { key: "date-today", title: "Сегодня", icon: Sun, action: () => a.moveTo("today") },
    { key: "date-tomorrow", title: "Завтра", icon: Sunrise, action: () => a.moveTo("tomorrow") },
    {
      key: "date-next-monday",
      title: "Пн следующей недели",
      icon: CalendarRange,
      action: () => a.moveTo("next-monday"),
    },
    { key: "date-pick", title: "Выбрать дату…", icon: CalendarSearch, action: a.openDatePicker },
    ...(input.hasDate ? [{ key: "date-clear", title: "Снять дату", icon: CalendarX2, action: a.clearDate }] : []),
  ],
});

const planningEntries = (input: TMenuInput, a: TMenuActions): TMenuEntry[] => {
  if (input.kind.isClosed) return [];
  const entries: TMenuEntry[] = [rescheduleEntry(input, a)];
  if (!input.kind.isBigTask && input.weights.length > 0) {
    entries.push({
      key: "weight",
      title: "Вес",
      icon: weightIcon(input.currentWeight ?? 3),
      children: input.weights.map(({ weight, pointId }) => ({
        key: `weight-${pointId}`,
        title: String(weight),
        icon: weightIcon(weight),
        isSelected: input.currentWeight === weight,
        action: () => a.setWeight(pointId),
      })),
    });
  }
  if (input.canMoveToMaybe)
    entries.push({ key: "maybe", title: "Отложить в «Может быть»", icon: Hourglass, action: a.moveToMaybe });
  if (input.modules === null || input.modules.length > 0) {
    entries.push({
      key: "module",
      title: "Модуль",
      icon: Layers,
      children:
        input.modules === null
          ? [{ key: "module-loading", title: "Загрузка…" }]
          : input.modules.map((module) => ({
              key: `module-${module.id}`,
              title: module.name,
              isSelected: module.isSelected,
              action: () => a.toggleModule(module.id),
            })),
    });
  }
  return entries;
};

const serviceEntries = (input: TMenuInput, a: TMenuActions): TMenuEntry[] => {
  const entries: TMenuEntry[] = [{ key: "copy-link", title: "Копировать ссылку", icon: Link, action: a.copyLink }];
  if (input.hasKey) entries.push({ key: "copy-key", title: "Копировать номер", icon: Hash, action: a.copyKey });
  entries.push({ key: "new-tab", title: "Открыть в новой вкладке", icon: ExternalLink, action: a.openInNewTab });
  if (input.canEdit) entries.push({ key: "make-copy", title: "Сделать копию", icon: Copy, action: a.makeCopy });
  entries.push(...input.extraServiceEntries);
  if (input.canArchive) entries.push({ key: "archive", title: "Архивировать", icon: Archive, action: a.archive });
  if (input.canDelete)
    entries.push({ key: "delete", title: "Удалить", icon: Trash2, isDanger: true, action: a.remove });
  return entries;
};

export const buildMenuGroups = (input: TMenuInput, actions: TMenuActions): TMenuGroup[] => [
  { key: "kind", entries: input.canEdit ? kindEntries(input, actions) : [] },
  { key: "planning", entries: input.canEdit ? planningEntries(input, actions) : [] },
  { key: "service", entries: serviceEntries(input, actions) },
];

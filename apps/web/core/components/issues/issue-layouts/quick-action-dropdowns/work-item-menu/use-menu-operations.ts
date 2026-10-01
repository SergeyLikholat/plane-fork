/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Writes behind the ⋯ menu entries: a regular field update through the
 * layout's `updateIssue` (so the row moves between groups) — or, outside a
 * layout without a handler, through the issue detail store — and the
 * fork's own endpoints (Big task complete, control handover / frequency).
 * Every failure ends in a toast; nothing throws.
 */

import { useContext } from "react";
import { useParams } from "next/navigation";
import { mutate as mutateGlobal } from "swr";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue } from "@plane/types";
import { announceBigTaskChanged, revalidateBigTaskContext } from "@/components/issues/big-task/helpers";
import { refreshAfterBigTaskChange } from "@/components/issues/big-task/refresh";
import { controlErrorMessage, getControlSwrKey } from "@/components/issues/issue-detail/control/use-control-actions";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import { StoreContext } from "@/lib/store-context";
import { BigTaskService } from "@/services/issue/big-task.service";
import type { TProjectBigTask } from "@/services/issue/big-task.service";
import { IssueControlService } from "@/services/issue/issue-control.service";
import type { TControlFrequency } from "@/services/issue/issue-control.service";
import { addDays, nextWeekMonday, planReschedule, toPayloadDate } from "./helpers";
import { requestLayoutRefresh } from "@/components/issues/issue-layouts/live-refresh";

const bigTaskService = new BigTaskService();
const issueControlService = new IssueControlService();

export const toastError = (message: string) => setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message });
export const toastDone = (title: string, message?: string) => setToast({ type: TOAST_TYPE.SUCCESS, title, message });

export type TMoveWhen = "today" | "tomorrow" | "next-monday";

type TInput = {
  issue: TIssue;
  /** Layout update; without it the detail store saves the change. */
  handleUpdate?: (data: TIssue) => Promise<void>;
};

export const useMenuOperations = ({ issue, handleUpdate }: TInput) => {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug?.toString();
  const projectId = issue.project_id ?? undefined;
  const rootStore = useContext(StoreContext);
  const { rootIssueStore, updateIssue: updateInDetail } = useIssueDetail();
  const { issues: layoutIssues } = useIssuesStore();

  // After a store update the item may move between groups of the layout.
  const refileInLayout = (after: TIssue, before: TIssue) => {
    if ("updateIssueList" in layoutIssues) layoutIssues.updateIssueList(after, before);
    // The server knows the page filters: drop the item now if it no longer fits.
    requestLayoutRefresh();
  };

  const saveUpdate = async (data: Partial<TIssue>): Promise<void> => {
    // The layout roots pass `updateIssue(projectId, id, data)`: a partial is what it takes.
    if (handleUpdate) return handleUpdate(data as TIssue);
    if (!workspaceSlug || !projectId) throw new Error("Задача ещё не загружена");
    return updateInDetail(workspaceSlug, projectId, issue.id, data);
  };

  const update = async (data: Partial<TIssue>, doneTitle?: string): Promise<boolean> => {
    try {
      await saveUpdate(data);
      if (doneTitle) toastDone(doneTitle, issue.name);
      return true;
    } catch (error) {
      toastError(controlErrorMessage(error, "Не удалось сохранить задачу"));
      return false;
    }
  };

  const moveTo = (when: TMoveWhen) => {
    const now = new Date();
    const target = when === "today" ? now : when === "tomorrow" ? addDays(now, 1) : nextWeekMonday(now);
    const date = toPayloadDate(target);
    if (date) void update(planReschedule(issue, date));
  };

  const completeBigTask = async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      const result = await bigTaskService.complete(workspaceSlug, projectId, issue.id);
      rootIssueStore.issues.updateIssue(issue.id, { state_id: result.state_id });
      toastDone("Big task выполнена", issue.name);
      refreshAfterBigTaskChange(rootStore, {
        workspaceSlug,
        projectId,
        bigTaskId: issue.id,
        routeUserId: params.userId?.toString(),
        routeProjectId: params.projectId?.toString(),
      });
    } catch (error) {
      toastError(controlErrorMessage(error, "Не удалось закрыть Big task"));
    }
  };

  const handover = async (personLabelId: string): Promise<boolean> => {
    if (!workspaceSlug || !projectId) return false;
    try {
      const response = await issueControlService.handover(workspaceSlug, projectId, issue.id, personLabelId);
      const before = { ...issue };
      const changes: Partial<TIssue> = {
        state_id: response.issue.state_id ?? issue.state_id,
        label_ids: response.issue.label_ids,
        estimate_point: response.issue.estimate_point,
      };
      rootIssueStore.issues.updateIssue(issue.id, changes);
      refileInLayout({ ...before, ...changes }, before);
      void mutateGlobal(getControlSwrKey(issue.id), response.control, { revalidate: false });
      toastDone("Передано на контроль", "Этап «🗣 Постановка»: нажмите «Поставил», когда объясните задачу");
      return true;
    } catch (error) {
      toastError(controlErrorMessage(error, "Не удалось передать задачу"));
      return false;
    }
  };

  const setFrequency = async (frequency: TControlFrequency) => {
    if (!workspaceSlug || !projectId) return;
    try {
      const next = await issueControlService.update(workspaceSlug, projectId, issue.id, { frequency });
      void mutateGlobal(getControlSwrKey(issue.id), next, { revalidate: false });
      toastDone("Частота сохранена");
    } catch (error) {
      toastError(controlErrorMessage(error, "Не удалось сохранить частоту"));
    }
  };

  const makeStepOf = async (bigTask: TProjectBigTask): Promise<boolean> => {
    const isDone = await update({ parent_id: bigTask.id }, `Шаг Big task «${bigTask.name}»`);
    if (isDone) {
      void revalidateBigTaskContext();
      announceBigTaskChanged();
    }
    return isDone;
  };

  const toggleModule = (moduleId: string) => {
    if (!workspaceSlug || !projectId) return;
    const isIn = issue.module_ids?.includes(moduleId) ?? false;
    layoutIssues
      .changeModulesInIssue(workspaceSlug, projectId, issue.id, isIn ? [] : [moduleId], isIn ? [moduleId] : [])
      .catch((error: unknown) => toastError(controlErrorMessage(error, "Не удалось изменить модуль")));
  };

  return {
    workspaceSlug,
    projectId,
    refileInLayout,
    update,
    moveTo,
    completeBigTask,
    handover,
    setFrequency,
    makeStepOf,
    toggleModule,
  };
};

export type TMenuOperations = ReturnType<typeof useMenuOperations>;

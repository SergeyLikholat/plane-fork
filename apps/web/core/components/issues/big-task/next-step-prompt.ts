/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * «Какой следующий шаг?» — who asks and when.
 *
 * A single observable request, read by the one dialog mounted in the
 * workspace layout (`BigTaskNextStepModal`). Anything can open it: the issue
 * stores after a step moves to a completed state, «Принял» in the control
 * block, the «＋ Следующий шаг» buttons.
 */
import { action, makeObservable, observable } from "mobx";
import { BigTaskService } from "@/services/issue/big-task.service";
import { revalidateBigTaskContext } from "./helpers";

export type TNextStepBigTask = {
  id: string;
  projectId: string;
  name: string;
  /** Final deadline, `YYYY-MM-DD`. */
  targetDate: string | null;
};

export type TNextStepRequest = {
  workspaceSlug: string;
  bigTask: TNextStepBigTask;
  /** Set when the dialog opens because this step was just closed. */
  closedStep?: { id: string; name?: string } | null;
};

class NextStepPromptStore {
  request: TNextStepRequest | null = null;

  constructor() {
    makeObservable(this, {
      request: observable.ref,
      open: action,
      close: action,
    });
  }

  open = (request: TNextStepRequest) => {
    this.request = request;
  };

  close = () => {
    this.request = null;
  };
}

export const nextStepPrompt = new NextStepPromptStore();

const bigTaskService = new BigTaskService();

/**
 * A work item was just closed: if its parent is a Big task, ask for the next
 * step. The parent's state may not be loaded in this view (profile pages span
 * projects), so the server decides. Never throws — a failed lookup only means
 * no dialog.
 */
export const promptNextStepAfterStepClosed = async (
  workspaceSlug: string,
  step: { id: string; name?: string }
): Promise<void> => {
  try {
    const context = await bigTaskService.getContext(workspaceSlug, [step.id]);
    const parent = context.parents[step.id];
    if (!parent?.is_big_task) return;
    // Progress of the Big task changed («N готово», current step).
    void revalidateBigTaskContext();
    nextStepPrompt.open({
      workspaceSlug,
      bigTask: { id: parent.id, projectId: parent.project_id, name: parent.name, targetDate: parent.target_date },
      closedStep: step,
    });
  } catch (error) {
    console.error("big-task: failed to check the parent of a closed step", step.id, error);
  }
};

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * «Big task» rows of the issue detail sidebar and the peek.
 * - On a Big task: progress «N готово из M», the current step (or «⚠ нет
 *   следующего шага») and «＋ Следующий шаг».
 * - On a step of a Big task: its parent (click → peek) and «＋ Следующий шаг»,
 *   right above the «Контроль» block of a supervised step.
 */

import { observer } from "mobx-react";
import { Briefcase, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
import { describeStep, formatShortDay, isBigTaskStateName } from "./helpers";
import { nextStepPrompt } from "./next-step-prompt";
import type { TNextStepBigTask } from "./next-step-prompt";
import { useBigTaskContext } from "./use-big-task-context";

const CLOSED_GROUPS = new Set(["completed", "cancelled"]);

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  labelClassName?: string;
};

function NextStepButton(props: { workspaceSlug: string; bigTask: TNextStepBigTask }) {
  return (
    <Button
      variant="secondary"
      size="base"
      prependIcon={<Plus />}
      onClick={() => nextStepPrompt.open({ workspaceSlug: props.workspaceSlug, bigTask: props.bigTask })}
    >
      Следующий шаг
    </Button>
  );
}

export const BigTaskProperties = observer(function BigTaskProperties(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, labelClassName = "text-body-xs-regular" } = props;
  const {
    issue: { getIssueById },
    setPeekIssue,
  } = useIssueDetail();
  const { getStateById } = useProjectState();

  const issue = getIssueById(issueId);
  const state = getStateById(issue?.state_id);
  const isBigTask = isBigTaskStateName(state?.name);
  const hasParent = !!issue?.parent_id;
  const context = useBigTaskContext(workspaceSlug, issue && (isBigTask || hasParent) ? [issueId] : []);

  if (!issue || (!isBigTask && !hasParent)) return null;
  const canAct = !disabled && !CLOSED_GROUPS.has(state?.group ?? "");

  if (isBigTask) {
    const summary = context?.big_tasks[issueId];
    const step = summary?.current_step ?? null;
    return (
      <SidebarPropertyListItem icon={Briefcase} label="Big task">
        <div className="flex w-full flex-col gap-1.5 py-1 pl-2">
          <span className={cn(labelClassName, "text-secondary tabular-nums")}>
            {summary ? `${summary.done} готово из ${summary.total}` : "…"}
          </span>
          {summary && step && (
            <span className={cn(labelClassName, "text-primary")} title="Текущий шаг — открытый с ближайшей датой">
              <span className="text-tertiary">→ сейчас: </span>
              {describeStep(step)}
            </span>
          )}
          {summary && !step && !CLOSED_GROUPS.has(state?.group ?? "") && (
            <span className="inline-flex w-fit items-center gap-1 rounded-sm bg-warning-subtle px-1.5 py-0.5 text-caption-md-medium text-warning-primary">
              <TriangleAlert className="size-3" />
              нет следующего шага
            </span>
          )}
          {canAct && (
            <div>
              <NextStepButton
                workspaceSlug={workspaceSlug}
                bigTask={{ id: issue.id, projectId, name: issue.name, targetDate: issue.target_date ?? null }}
              />
            </div>
          )}
        </div>
      </SidebarPropertyListItem>
    );
  }

  const parent = context?.parents[issueId];
  if (!parent?.is_big_task) return null;
  const deadline = formatShortDay(parent.target_date);
  return (
    <SidebarPropertyListItem icon={Briefcase} label="Big task">
      <div className="flex w-full flex-col gap-1.5 py-1 pl-2">
        <button
          type="button"
          className={cn(
            labelClassName,
            "w-fit max-w-full truncate rounded-sm text-left text-secondary underline-offset-2 hover:text-primary hover:underline"
          )}
          title="Открыть Big task"
          onClick={() =>
            setPeekIssue({ workspaceSlug, projectId: parent.project_id, issueId: parent.id, isArchived: false })
          }
        >
          💼 {parent.name}
          {deadline && <span className="text-tertiary"> · ⚑ {deadline}</span>}
        </button>
        {!disabled && (
          <div>
            <NextStepButton
              workspaceSlug={workspaceSlug}
              bigTask={{
                id: parent.id,
                projectId: parent.project_id,
                name: parent.name,
                targetDate: parent.target_date,
              }}
            />
          </div>
        )}
      </div>
    </SidebarPropertyListItem>
  );
});

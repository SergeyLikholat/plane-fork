/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * «Какой следующий шаг?» — the one dialog of the workspace, opened through
 * `nextStepPrompt` (see next-step-prompt.ts). A Big task never has a long
 * plan, only its current step: when a step closes, the chain must not break
 * silently. Three ways out: set the next step, close the Big task, or
 * «Решу позже» (the Big task then shows «⚠ нет следующего шага»).
 */

import { useContext, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { CheckCheck, Flag, Footprints } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { WeightIcon } from "@/components/estimates/weight-icon";
import { nextWorkingDay } from "@/components/issues/issue-detail/control/next-touch";
import { StoreContext } from "@/lib/store-context";
import { BigTaskService, PERFORMER_ME } from "@/services/issue/big-task.service";
import type { TNextStepPayload } from "@/services/issue/big-task.service";
import { STEP_WEIGHTS, defaultStepWeight, formatShortDay } from "./helpers";
import { nextStepPrompt } from "./next-step-prompt";
import type { TNextStepRequest } from "./next-step-prompt";
import { refreshAfterBigTaskChange } from "./refresh";
import { usePeople } from "./use-people-labels";

const bigTaskService = new BigTaskService();

const errorMessage = (error: unknown, fallback: string): string => {
  const data = error as { error?: string; detail?: string } | undefined;
  return data?.error ?? data?.detail ?? fallback;
};

const FIELD_LABEL = "text-caption-md-medium tracking-wide text-tertiary uppercase";

// Joined without cn: tailwind-merge drops the text-caption-* size next to text-white.
const chipClass = (isActive: boolean) =>
  [
    // Compact: 24px high, 12px text — the people list is long.
    "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-caption-md-medium transition-colors outline-none",
    "focus-visible:ring-2 focus-visible:ring-[#9AA5B1]",
    // Selected = calm graphite, not a pale-blue fill.
    isActive
      ? "border-[#2F3640] bg-[#2F3640] text-white"
      : "border-subtle bg-surface-1 text-primary hover:border-strong-1",
  ].join(" ");

type FormProps = { request: TNextStepRequest; onClose: () => void };

const NextStepForm = observer(function NextStepForm({ request, onClose }: FormProps) {
  const { workspaceSlug, bigTask, closedStep } = request;
  const rootStore = useContext(StoreContext);
  const params = useParams();
  const people = usePeople(workspaceSlug, bigTask.projectId);
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [performer, setPerformer] = useState<string>(PERFORMER_ME);
  const [date, setDate] = useState<Date | null>(() => nextWorkingDay(new Date()));
  const [weight, setWeight] = useState<number | null>(null);
  const [busy, setBusy] = useState<"step" | "complete" | null>(null);

  // The dialog opens from a checkbox click; focus once it is on screen.
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);

  const effectiveWeight = weight ?? defaultStepWeight(performer);
  const isMine = performer === PERFORMER_ME;
  const canSubmit = busy === null && name.trim().length > 0;
  const deadline = formatShortDay(bigTask.targetDate);

  const refresh = () =>
    refreshAfterBigTaskChange(rootStore, {
      workspaceSlug,
      projectId: bigTask.projectId,
      bigTaskId: bigTask.id,
      routeUserId: params.userId?.toString(),
      routeProjectId: params.projectId?.toString(),
    });

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const payload: TNextStepPayload = { name: name.trim(), performer, weight: effectiveWeight };
    if (date) payload.target_date = renderFormattedPayloadDate(date) ?? undefined;
    setBusy("step");
    try {
      const step = await bigTaskService.createNextStep(workspaceSlug, bigTask.projectId, bigTask.id, payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Шаг поставлен",
        message: `${step.name}${formatShortDay(step.target_date) ? ` · ${formatShortDay(step.target_date)}` : ""}`,
      });
      refresh();
      onClose();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Ошибка", message: errorMessage(error, "Не удалось поставить шаг") });
    } finally {
      setBusy(null);
    }
  };

  const handleComplete = async () => {
    if (busy !== null) return;
    setBusy("complete");
    try {
      const result = await bigTaskService.complete(workspaceSlug, bigTask.projectId, bigTask.id);
      rootStore.issue.issues.updateIssue(bigTask.id, { state_id: result.state_id });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Big task выполнена", message: bigTask.name });
      refresh();
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Ошибка",
        message: errorMessage(error, "Не удалось закрыть Big task"),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey || event.target === inputRef.current)) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Enter / ⌘Enter shortcut for the whole form
    <div
      // Rendered in a portal outside the peek: without this mark the peek treats
      // clicks here as «outside» and closes (see control/touch-modal.tsx).
      data-prevent-outside-click
      className="flex flex-col gap-4 px-5 py-4"
      onKeyDown={handleKeyDown}
    >
      <header className="flex flex-col gap-1">
        {closedStep ? (
          <span className="inline-flex items-center gap-1 text-caption-md-medium text-success-primary">
            <CheckCheck className="size-3.5" />
            Шаг выполнен{closedStep.name ? `: ${closedStep.name}` : ""}
          </span>
        ) : (
          <span className="text-caption-md-medium text-tertiary">Следующий шаг</span>
        )}
        <h3 className="text-h5-medium text-primary">Какой следующий шаг?</h3>
        <p className="flex min-w-0 items-baseline gap-1.5 text-body-xs-regular text-secondary">
          <span className="min-w-0 truncate">💼 {bigTask.name}</span>
          {deadline && (
            <span className="inline-flex shrink-0 items-center gap-1 text-tertiary" title="Финальный срок Big task">
              <Flag className="size-3 self-center" />
              {deadline}
            </span>
          )}
        </p>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Следующий шаг</span>
        <input
          ref={inputRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={255}
          placeholder="Одно конкретное действие"
          className="h-9 w-full rounded-md border border-subtle bg-layer-2 px-2.5 text-body-sm-regular text-primary transition-colors placeholder:text-placeholder hover:border-strong focus:border-accent-strong focus:outline-none"
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className={cn(FIELD_LABEL, "mb-1.5")}>Кто делает</legend>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            aria-pressed={isMine}
            className={chipClass(isMine)}
            onClick={() => setPerformer(PERFORMER_ME)}
          >
            Я
          </button>
          {people.map((person) => (
            <button
              key={person.id}
              type="button"
              aria-pressed={performer === person.id}
              className={chipClass(performer === person.id)}
              onClick={() => setPerformer(person.id)}
            >
              {person.name}
            </button>
          ))}
        </div>
        <span className="text-caption-md-regular text-placeholder">
          {isMine ? "Своя задача — в «В процессе»" : "Чужая — на контроль, этап «🗣 Постановка»"}
        </span>
      </fieldset>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>{isMine ? "Когда" : "Когда поставить"}</span>
          <DateDropdown
            value={date}
            onChange={setDate}
            minDate={new Date()}
            buttonVariant="border-with-text"
            placeholder="Выберите дату"
            isClearable={false}
          />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className={cn(FIELD_LABEL, "mb-1.5")}>Вес</legend>
          <div className="flex flex-wrap gap-1">
            {STEP_WEIGHTS.map((value) => {
              const isActive = effectiveWeight === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isActive}
                  title={value === defaultStepWeight(performer) ? "Вес по умолчанию" : undefined}
                  className={`${chipClass(isActive)} tabular-nums`}
                  onClick={() => setWeight(value)}
                >
                  <WeightIcon weight={value} className="size-3.5" />
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-subtle pt-3">
        <Button variant="ghost" size="lg" onClick={onClose} disabled={busy !== null}>
          Решу позже
        </Button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="lg"
            prependIcon={<CheckCheck />}
            onClick={() => void handleComplete()}
            loading={busy === "complete"}
            disabled={busy !== null}
            title="Больше шагов не нужно — перевести Big task в «Завершено»"
          >
            Big task выполнена
          </Button>
          <Button
            variant="primary"
            size="lg"
            prependIcon={<Footprints />}
            onClick={() => void handleSubmit()}
            loading={busy === "step"}
            disabled={!canSubmit}
            // Plane's disabled primary is white text on light grey (invisible):
            // keep the accent, just paler, so the main action stays readable.
            className="disabled:bg-accent-primary disabled:text-on-color disabled:opacity-50"
            title={canSubmit ? undefined : "Напишите, какой следующий шаг"}
          >
            Поставить шаг
          </Button>
        </div>
      </footer>
    </div>
  );
});

/** Mounted once in the workspace layout. */
export const BigTaskNextStepModal = observer(function BigTaskNextStepModal() {
  const { request, close } = nextStepPrompt;
  return (
    <ModalCore isOpen={!!request} handleClose={close} position={EModalPosition.TOP} width={EModalWidth.XL}>
      {/* Keyed by Big task + step: a fresh form every time the question is asked. */}
      {request && (
        <NextStepForm
          key={`${request.bigTask.id}:${request.closedStep?.id ?? "manual"}`}
          request={request}
          onClose={close}
        />
      )}
    </ModalCore>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * «Сделать шагом Big task…» — pick a Big task of the same project; the work
 * item becomes its sub-issue (a step). Searchable, nearest deadline first.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Briefcase, Flag, LoaderCircle } from "lucide-react";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { formatShortDay } from "@/components/issues/big-task/helpers";
import { BigTaskService } from "@/services/issue/big-task.service";
import type { TProjectBigTask } from "@/services/issue/big-task.service";
import { DIALOG_TITLE } from "./dialog-styles";
import { formatWorkItemKey } from "./helpers";

const bigTaskService = new BigTaskService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  projectIdentifier: string | null | undefined;
  issueId: string;
  issueName: string;
  currentParentId: string | null | undefined;
  onClose: () => void;
  onSubmit: (bigTask: TProjectBigTask) => Promise<boolean>;
};

const normalize = (value: string) => value.toLowerCase().replace(/ё/g, "е");

export function BigTaskPicker(props: Props) {
  const { workspaceSlug, projectId, projectIdentifier, issueId, issueName, currentParentId, onClose, onSubmit } = props;
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, error, isLoading } = useSWR(["PROJECT_BIG_TASKS", workspaceSlug, projectId], () =>
    bigTaskService.listProjectBigTasks(workspaceSlug, projectId)
  );

  // Opened from a menu item: focus once the dialog is on screen.
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);

  const options = useMemo(() => {
    const needle = normalize(query.trim());
    return (data ?? []).filter((task) => {
      if (task.id === issueId || task.id === currentParentId) return false;
      if (!needle) return true;
      const key = formatWorkItemKey(projectIdentifier, task.sequence_id) ?? "";
      return normalize(task.name).includes(needle) || normalize(key).includes(needle);
    });
  }, [data, query, issueId, currentParentId, projectIdentifier]);

  const handlePick = async (task: TProjectBigTask) => {
    if (savingId) return;
    setSavingId(task.id);
    const isDone = await onSubmit(task);
    setSavingId(null);
    if (isDone) onClose();
  };

  let body;
  if (isLoading) {
    body = (
      <p className="flex items-center gap-2 px-2 py-3 text-body-xs-regular text-tertiary">
        <LoaderCircle className="size-3.5 animate-spin" /> Загружаю Big tasks…
      </p>
    );
  } else if (error) {
    body = <p className="px-2 py-3 text-body-xs-regular text-danger-secondary">Не удалось загрузить Big tasks</p>;
  } else if (options.length === 0) {
    body = (
      <p className="px-2 py-3 text-body-xs-regular text-tertiary">
        {query.trim() ? "Ничего не нашлось" : "В проекте нет других Big tasks"}
      </p>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-0.5" aria-label="Big tasks">
        {options.map((task) => {
          const deadline = formatShortDay(task.target_date);
          return (
            <li key={task.id}>
              <button
                type="button"
                disabled={savingId !== null}
                onClick={() => void handlePick(task)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-body-xs-medium text-primary transition-colors hover:bg-layer-1-hover focus-visible:bg-layer-1-hover focus-visible:outline-none disabled:opacity-60"
              >
                {savingId === task.id ? (
                  <LoaderCircle className="size-3.5 shrink-0 animate-spin text-icon-secondary" />
                ) : (
                  <Briefcase className="size-3.5 shrink-0 text-icon-secondary" />
                )}
                <span className="shrink-0 text-tertiary tabular-nums">
                  {formatWorkItemKey(projectIdentifier, task.sequence_id)}
                </span>
                <span className="min-w-0 flex-1 truncate">{task.name}</span>
                {deadline && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-caption-md-regular text-tertiary">
                    <Flag className="size-3" />
                    {deadline}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ModalCore isOpen handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.LG}>
      <div data-prevent-outside-click className="flex flex-col gap-3 px-5 py-4">
        <header className="flex flex-col gap-0.5">
          <h3 className={DIALOG_TITLE}>Сделать шагом Big task</h3>
          <p className="truncate text-body-xs-regular text-tertiary">{issueName}</p>
        </header>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти Big task"
          aria-label="Найти Big task"
          className="h-9 w-full rounded-md border border-subtle bg-layer-2 px-2.5 text-body-sm-regular text-primary transition-colors placeholder:text-placeholder hover:border-strong focus:border-accent-strong focus:outline-none"
        />
        <div className="max-h-[min(22rem,55vh)] overflow-y-auto">{body}</div>
      </div>
    </ModalCore>
  );
}

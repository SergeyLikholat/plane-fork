/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Icon-only touch button for list rows and kanban cards: «Коснулся» (hand),
 * «Поставил» in «Постановка» (same hand), and in «Приёмка» a check that opens
 * «Принял» / «Вернул». Same actions as the control block (`useControlActions`),
 * but the control data is fetched and the dialogs mounted only on click.
 *
 * The row / card around it is a link that opens the peek and a drag source:
 * clicks stop here, and a drag started on the button is cancelled.
 */

import type { DragEvent, MouseEvent } from "react";
import { observer } from "mobx-react";
import { CheckCheck, CircleCheck, Hand, LoaderCircle, Undo2 } from "lucide-react";
import type { TIssue } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import { useControlActions } from "./use-control-actions";

const BUTTON_CLASS =
  "grid size-7 shrink-0 place-items-center rounded-md text-icon-secondary transition-colors hover:bg-layer-1-hover hover:text-icon-primary active:bg-layer-1-active focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none";

const ACCEPTANCE_LABEL = "Приёмка: принял или вернул";

// Portal events (the dialogs) bubble through React to the row link: stop
// them here, but keep their default action (checkboxes, links inside).
const handleClick = (event: MouseEvent<HTMLElement>) => {
  event.stopPropagation();
  if (event.currentTarget.contains(event.target as Node)) event.preventDefault();
};

const cancelDrag = (event: DragEvent<HTMLElement>) => {
  event.preventDefault();
  event.stopPropagation();
};

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  className?: string;
};

export const ControlQuickAction = observer(function ControlQuickAction(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, className } = props;
  const { issues: layoutIssues } = useIssuesStore();

  // After a touch the item may move between groups (state, labels, date).
  const refileInLayout = (after: TIssue, before: TIssue) => {
    if ("updateIssueList" in layoutIssues) layoutIssues.updateIssueList(after, before);
  };

  const { phase, canAct, isAccepting, isPreparing, openTouch, openSetup, openReturn, accept, modals } =
    useControlActions({ workspaceSlug, projectId, issueId, disabled, lazy: true, onIssueUpdated: refileInLayout });

  if (!phase || !canAct) return null;

  const isBusy = isAccepting || isPreparing;
  const busyIcon = <LoaderCircle className="size-4 animate-spin" />;

  let control;
  if (phase === "acceptance") {
    control = (
      <CustomMenu
        customButton={isBusy ? busyIcon : <CircleCheck className="size-4" />}
        customButtonClassName={BUTTON_CLASS}
        ariaLabel={ACCEPTANCE_LABEL}
        disabled={isBusy}
        placement="bottom-end"
        optionsClassName="min-w-36"
        menuItemsClassName="z-[14]"
        closeOnSelect
      >
        <CustomMenu.MenuItem onClick={() => void accept()}>
          <span className="flex items-center gap-2 text-body-xs-medium text-primary">
            <CheckCheck className="size-3.5 text-icon-secondary" />
            Принял
          </span>
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem onClick={openReturn}>
          <span className="flex items-center gap-2 text-body-xs-medium text-primary">
            <Undo2 className="size-3.5 text-icon-secondary" />
            Вернул
          </span>
        </CustomMenu.MenuItem>
      </CustomMenu>
    );
  } else {
    const label = phase === "setup" ? "Поставил" : "Коснулся";
    control = (
      <button
        type="button"
        className={BUTTON_CLASS}
        title={label}
        aria-label={label}
        disabled={isBusy}
        onClick={phase === "setup" ? openSetup : openTouch}
      >
        {isBusy ? busyIcon : <Hand className="size-4" />}
      </button>
    );
  }

  return (
    <span
      role="presentation"
      data-prevent-outside-click
      className={cn("inline-flex shrink-0", className)}
      title={phase === "acceptance" ? ACCEPTANCE_LABEL : undefined}
      draggable
      onDragStart={cancelDrag}
      onClick={handleClick}
    >
      {control}
      {modals}
    </span>
  );
});

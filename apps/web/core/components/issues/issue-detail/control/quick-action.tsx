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
import { CircleCheck, Hand, LoaderCircle } from "lucide-react";
import type { TIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import { AcceptanceMenu } from "./acceptance-menu";
import { useControlActions } from "./use-control-actions";
import { requestLayoutRefresh } from "@/components/issues/issue-layouts/live-refresh";

const BUTTON_CLASS =
  "grid size-7 shrink-0 place-items-center rounded-md text-icon-secondary transition-colors hover:bg-layer-1-hover hover:text-icon-primary active:bg-layer-1-active focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none";

// List rows: an explicit chip with the word, not a lone icon.
const LABELED_BUTTON_CLASS =
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-[#E7E1D6] bg-surface-1 px-2 text-caption-md-medium text-secondary transition-colors hover:border-strong-1 hover:text-primary active:bg-layer-1-active focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none disabled:opacity-60";

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
  /** Show the action's word next to the icon («✋ Коснулся»); phones keep the icon only. */
  withLabel?: boolean;
};

export const ControlQuickAction = observer(function ControlQuickAction(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, className, withLabel = false } = props;
  const { issues: layoutIssues } = useIssuesStore();

  // After a touch the item may move between groups (state, labels, date).
  const refileInLayout = (after: TIssue, before: TIssue) => {
    if ("updateIssueList" in layoutIssues) layoutIssues.updateIssueList(after, before);
    // The server knows the page filters: drop the item now if it no longer fits.
    requestLayoutRefresh();
  };

  const { phase, canAct, isAccepting, isPreparing, openTouch, openSetup, openReturn, accept, modals } =
    useControlActions({ workspaceSlug, projectId, issueId, disabled, lazy: true, onIssueUpdated: refileInLayout });

  if (!phase || !canAct) return null;

  const isBusy = isAccepting || isPreparing;
  const iconSize = withLabel ? "size-3.5" : "size-4";
  const busyIcon = <LoaderCircle className={cn(iconSize, "animate-spin")} />;
  const buttonClass = withLabel ? LABELED_BUTTON_CLASS : BUTTON_CLASS;

  let control;
  if (phase === "acceptance") {
    control = (
      <AcceptanceMenu
        buttonClassName={buttonClass}
        label={ACCEPTANCE_LABEL}
        icon={
          <>
            {isBusy ? busyIcon : <CircleCheck className={iconSize} />}
            {withLabel && <span className="max-md:hidden">Приёмка</span>}
          </>
        }
        disabled={isBusy}
        onAccept={() => void accept()}
        onReturn={openReturn}
      />
    );
  } else {
    const label = phase === "setup" ? "Поставил" : "Коснулся";
    control = (
      <button
        type="button"
        className={buttonClass}
        title={label}
        aria-label={label}
        disabled={isBusy}
        onClick={phase === "setup" ? openSetup : openTouch}
      >
        {isBusy ? busyIcon : <Hand className={iconSize} />}
        {withLabel && <span className="max-md:hidden">{label}</span>}
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

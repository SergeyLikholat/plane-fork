/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Hover highlighting of Big task relations on a board.
 *
 * Every Big task card and every step card carries `data-big-task-id`: the
 * Big task's own id / the id of the step's Big task parent. Hovering one of
 * them outlines the other cards of the same family (the Big task and its
 * steps) through the `data-big-task-related` attribute (styled in
 * `styles/user-background.css`).
 *
 * One delegated `pointerover` listener on the board root, pure DOM toggling:
 * no card re-renders while the mouse moves. An attribute, not a class, so a
 * re-render of a card (its `className` changes) does not wipe it midway.
 */
import { useEffect } from "react";

export const BIG_TASK_ID_ATTR = "data-big-task-id";
const RELATED_ATTR = "data-big-task-related";

export function useBigTaskRelationHover(root: HTMLElement | null): void {
  useEffect(() => {
    if (!root) return;

    let activeCard: HTMLElement | null = null;
    let highlighted: HTMLElement[] = [];

    const clear = () => {
      for (const el of highlighted) el.removeAttribute(RELATED_ATTR);
      highlighted = [];
      activeCard = null;
    };

    const onOver = (event: PointerEvent) => {
      // Touch: a tap opens the peek, a highlight would only stick around.
      if (event.pointerType === "touch") return;
      const card = (event.target as HTMLElement | null)?.closest<HTMLElement>(`[${BIG_TASK_ID_ATTR}]`) ?? null;
      if (card === activeCard) return;
      clear();
      const bigTaskId = card?.getAttribute(BIG_TASK_ID_ATTR);
      if (!card || !bigTaskId) return;
      activeCard = card;
      highlighted = Array.from(
        root.querySelectorAll<HTMLElement>(`[${BIG_TASK_ID_ATTR}="${CSS.escape(bigTaskId)}"]`)
      ).filter((el) => el !== card);
      for (const el of highlighted) el.setAttribute(RELATED_ATTR, "");
    };

    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerleave", clear);
    return () => {
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerleave", clear);
      clear();
    };
  }, [root]);
}

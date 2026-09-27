/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * The server can change a description behind an open editor (the «Поставил»
 * touch appends «Что сдаёт: …»). The rich-text editor reads `initialValue`
 * only on mount, so without a push the open editor keeps the old text and
 * its next autosave would erase the appended line.
 */

import { useEffect } from "react";
import type { RefObject } from "react";
import type { EditorRefApi } from "@plane/editor";

const DESCRIPTION_REPLACED_EVENT = "plane:issue-description-replaced";

type TDescriptionReplaced = { issueId: string; descriptionHtml: string };

export const announceDescriptionReplaced = (issueId: string, descriptionHtml: string): void => {
  window.dispatchEvent(
    new CustomEvent<TDescriptionReplaced>(DESCRIPTION_REPLACED_EVENT, { detail: { issueId, descriptionHtml } })
  );
};

/** Puts a server-side description change into the open editor without re-saving it. */
export const useDescriptionReplaced = (
  issueId: string | undefined,
  editorRef: RefObject<EditorRefApi | null>
): void => {
  useEffect(() => {
    if (!issueId) return;
    const handler = (event: Event) => {
      const { detail } = event as CustomEvent<TDescriptionReplaced>;
      if (detail?.issueId !== issueId) return;
      editorRef.current?.setEditorValue(detail.descriptionHtml, false);
    };
    window.addEventListener(DESCRIPTION_REPLACED_EVENT, handler);
    return () => window.removeEventListener(DESCRIPTION_REPLACED_EVENT, handler);
  }, [issueId, editorRef]);
};

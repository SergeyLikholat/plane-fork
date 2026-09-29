/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** «Перенести ▸ Выбрать дату…» — a calendar; picking a day moves the work item at once. */

import { useState } from "react";
import { Calendar } from "@plane/propel/calendar";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { getDate } from "@plane/utils";
import { DIALOG_TITLE } from "./dialog-styles";
import { toPayloadDate } from "./helpers";

type Props = {
  issueName: string;
  /** Current due date, `YYYY-MM-DD`. */
  value: string | null | undefined;
  onClose: () => void;
  onSubmit: (date: string) => Promise<boolean>;
};

export function DateDialog({ issueName, value, onClose, onSubmit }: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const current = getDate(value);

  const handleSelect = async (date: Date | undefined) => {
    const payload = date ? toPayloadDate(date) : null;
    if (!payload || isSaving) return;
    setIsSaving(true);
    const isDone = await onSubmit(payload);
    setIsSaving(false);
    if (isDone) onClose();
  };

  return (
    <ModalCore isOpen handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.SM}>
      <div data-prevent-outside-click className="flex flex-col items-center gap-3 px-4 py-4">
        <header className="flex w-full flex-col gap-0.5">
          <h3 className={DIALOG_TITLE}>Перенести на дату</h3>
          <p className="truncate text-body-xs-regular text-tertiary">{issueName}</p>
        </header>
        <Calendar
          className="rounded-md border border-subtle p-3"
          captionLayout="dropdown"
          mode="single"
          selected={current}
          defaultMonth={current ?? new Date()}
          onSelect={(date: Date | undefined) => void handleSelect(date)}
          disabled={isSaving}
          showOutsideDays
          fixedWeeks
          initialFocus
        />
      </div>
    </ModalCore>
  );
}

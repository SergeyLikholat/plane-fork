/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * «Поставил» dialog (phase «🗣 Постановка»): the task has been explained to the
 * assignee. Records the agreed deadline, how often to check on it and what
 * exactly they deliver; the phase then moves to «👁 Проверка».
 */

import { useEffect, useState } from "react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import type { TControlFrequency, TControlTouchPayload } from "@/services/issue/issue-control.service";
import { FREQUENCY_OPTIONS } from "./helpers";

const MAX_DELIVERABLE_LENGTH = 1000;
const MAX_COMMENT_LENGTH = 5000;

const FIELD_LABEL = "text-caption-md-medium tracking-wide text-tertiary uppercase";
const TEXTAREA =
  "w-full resize-none rounded-md border border-subtle bg-layer-2 px-2.5 py-2 text-body-xs-regular text-primary transition-colors placeholder:text-placeholder hover:border-strong focus:border-accent-strong focus:outline-none";

type Props = {
  isOpen: boolean;
  issueName?: string;
  /** Current control frequency, preselected. */
  frequency: TControlFrequency;
  onClose: () => void;
  onSubmit: (payload: TControlTouchPayload) => Promise<void>;
};

export function ControlSetupModal(props: Props) {
  const { isOpen, issueName, frequency: currentFrequency, onClose, onSubmit } = props;
  const [promisedDate, setPromisedDate] = useState<Date | null>(null);
  const [frequency, setFrequency] = useState<TControlFrequency>(currentFrequency);
  const [deliverable, setDeliverable] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setPromisedDate(null);
    setFrequency(currentFrequency);
    setDeliverable("");
    setComment("");
  }, [isOpen, currentFrequency]);

  const canSubmit = !isSubmitting && promisedDate !== null;

  const handleSubmit = async () => {
    if (!canSubmit || !promisedDate) return;
    const payload: TControlTouchPayload = {
      outcome: "assigned",
      promised_date: renderFormattedPayloadDate(promisedDate),
      frequency,
    };
    const trimmedDeliverable = deliverable.trim();
    if (trimmedDeliverable) payload.deliverable = trimmedDeliverable;
    const trimmedComment = comment.trim();
    if (trimmedComment) payload.comment = trimmedComment;
    setIsSubmitting(true);
    try {
      await onSubmit(payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.LG}>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- ⌘Enter shortcut for the whole form */}
      <div className="flex flex-col gap-4 px-5 py-4" onKeyDown={handleKeyDown}>
        <header className="flex flex-col gap-0.5">
          <h3 className="text-h5-medium text-primary">Поставил задачу</h3>
          {issueName && <p className="truncate text-body-xs-regular text-tertiary">{issueName}</p>}
        </header>

        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5">
          <span className={FIELD_LABEL}>Обещал к</span>
          <div>
            <DateDropdown
              value={promisedDate}
              onChange={setPromisedDate}
              minDate={new Date()}
              buttonVariant="border-with-text"
              placeholder="Выберите дату"
              isClearable={false}
              buttonClassName={cn(!promisedDate && "text-placeholder")}
            />
          </div>

          <span className={FIELD_LABEL}>Частота</span>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Частота">
            {FREQUENCY_OPTIONS.map((option) => {
              const isActive = frequency === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setFrequency(option.value)}
                  className={cn(
                    "h-7 rounded-md border px-2.5 text-body-xs-medium transition-colors focus-visible:border-accent-strong focus-visible:outline-none",
                    isActive
                      ? "border-accent-strong bg-accent-subtle text-accent-primary"
                      : "border-subtle bg-layer-2 text-secondary hover:border-strong hover:bg-layer-2-hover"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Что сдаёт</span>
          <textarea
            value={deliverable}
            onChange={(event) => setDeliverable(event.target.value)}
            rows={2}
            maxLength={MAX_DELIVERABLE_LENGTH}
            placeholder="Например: таблица отверстий в Excel с отметками"
            className={TEXTAREA}
          />
          <span className="text-caption-md-regular text-placeholder">Допишется в описание задачи</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Комментарий</span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="Необязательно"
            className={TEXTAREA}
          />
        </label>

        <footer className="flex items-center justify-between gap-2 border-t border-subtle pt-3">
          <span className="text-caption-md-regular text-placeholder">⌘/Ctrl + Enter</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>
              Отмена
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              loading={isSubmitting}
            >
              Поставил
            </Button>
          </div>
        </footer>
      </div>
    </ModalCore>
  );
}

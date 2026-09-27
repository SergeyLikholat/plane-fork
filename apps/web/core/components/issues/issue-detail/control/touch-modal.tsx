/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * «Коснулся» dialog. Two modes:
 * - `touch` (phase «Проверка»): what the assignee said + one of four outcomes;
 * - `return` (phase «Приёмка»): send the work back with a new promised date.
 */

import { useEffect, useState } from "react";
import { CalendarClock, PackageCheck, PauseCircle, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import type { TControlOutcome, TControlTouchPayload } from "@/services/issue/issue-control.service";
import { CHECK_OUTCOMES } from "./helpers";
import type { TCheckOutcomeOption } from "./helpers";

export type TTouchModalMode = "touch" | "return";

type Props = {
  isOpen: boolean;
  mode: TTouchModalMode;
  issueName?: string;
  onClose: () => void;
  onSubmit: (payload: TControlTouchPayload) => Promise<void>;
};

const OUTCOME_ICONS: Record<TCheckOutcomeOption["value"], LucideIcon> = {
  progress: TrendingUp,
  no_progress: PauseCircle,
  new_deadline: CalendarClock,
  submitted: PackageCheck,
};

const needsDate = (mode: TTouchModalMode, outcome: TControlOutcome) => mode === "return" || outcome === "new_deadline";

export function ControlTouchModal(props: Props) {
  const { isOpen, mode, issueName, onClose, onSubmit } = props;
  const [comment, setComment] = useState("");
  const [outcome, setOutcome] = useState<TControlOutcome>("progress");
  const [promisedDate, setPromisedDate] = useState<Date | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setComment("");
    setOutcome(mode === "return" ? "returned" : "progress");
    setPromisedDate(null);
  }, [isOpen, mode]);

  const dateRequired = needsDate(mode, outcome);
  const canSubmit = !isSubmitting && (!dateRequired || promisedDate !== null);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const payload: TControlTouchPayload = { outcome: mode === "return" ? "returned" : outcome };
    const trimmed = comment.trim();
    if (trimmed) payload.comment = trimmed;
    if (dateRequired && promisedDate) payload.promised_date = renderFormattedPayloadDate(promisedDate);
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

  const title = mode === "return" ? "Вернуть на доработку" : "Касание";

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.LG}>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- ⌘Enter shortcut for the whole form */}
      <div className="flex flex-col gap-4 px-5 py-4" onKeyDown={handleKeyDown}>
        <header className="flex flex-col gap-0.5">
          <h3 className="text-h5-medium text-primary">{title}</h3>
          {issueName && <p className="truncate text-body-xs-regular text-tertiary">{issueName}</p>}
        </header>

        <label className="flex flex-col gap-1.5">
          <span className="text-caption-md-medium tracking-wide text-tertiary uppercase">Что ответил</span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            maxLength={5000}
            placeholder={mode === "return" ? "Что доделать" : "Коротко, своими словами"}
            className="w-full resize-none rounded-md border border-subtle bg-layer-2 px-2.5 py-2 text-body-xs-regular text-primary transition-colors placeholder:text-placeholder hover:border-strong focus:border-accent-strong focus:outline-none"
          />
        </label>

        {mode === "touch" && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-caption-md-medium tracking-wide text-tertiary uppercase">Исход</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {CHECK_OUTCOMES.map((option) => {
                const Icon = OUTCOME_ICONS[option.value];
                const isActive = outcome === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "group flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition-colors",
                      "focus-within:border-accent-strong",
                      isActive
                        ? "border-accent-strong bg-accent-subtle"
                        : "border-subtle bg-layer-2 hover:border-strong hover:bg-layer-2-hover"
                    )}
                  >
                    <input
                      type="radio"
                      name="control-outcome"
                      value={option.value}
                      checked={isActive}
                      onChange={() => setOutcome(option.value)}
                      className="sr-only"
                    />
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        isActive ? "text-icon-accent-primary" : "text-icon-tertiary group-hover:text-icon-secondary"
                      )}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className={cn("text-body-xs-medium", isActive ? "text-accent-primary" : "text-primary")}>
                        {option.label}
                      </span>
                      <span className="text-caption-md-regular text-tertiary">{option.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {dateRequired && (
          <div className="flex items-center gap-3">
            <span className="text-caption-md-medium tracking-wide text-tertiary uppercase">
              {mode === "return" ? "Доделать к" : "Обещал к"}
            </span>
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
        )}

        <footer className="flex items-center justify-between gap-2 border-t border-subtle pt-3">
          <span className="text-caption-md-regular text-placeholder">⌘/Ctrl + Enter</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>
              Отмена
            </Button>
            <Button
              variant={mode === "return" ? "error-outline" : "primary"}
              size="lg"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              loading={isSubmitting}
            >
              {mode === "return" ? "Вернуть" : "Записать касание"}
            </Button>
          </div>
        </footer>
      </div>
    </ModalCore>
  );
}

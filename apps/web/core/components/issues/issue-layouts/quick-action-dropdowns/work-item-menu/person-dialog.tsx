/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Who does it — «Передать на контроль…» (an own work item goes to someone,
 * phase «🗣 Постановка») and «Сменить исполнителя…» (a supervised one gets
 * another person). People are the project's labels under «ЛЮДИ»; the item's
 * current person is preselected.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { usePeople } from "@/components/issues/big-task/use-people-labels";
import { DIALOG_BODY, DIALOG_FOOTER, DIALOG_TITLE, FIELD_LABEL, choiceChipClass } from "./dialog-styles";

export type TPersonDialogMode = "handover" | "swap";

const COPY: Record<TPersonDialogMode, { title: string; hint: string; submit: string }> = {
  handover: {
    title: "Передать на контроль",
    hint: "Задача уйдёт в «На контроле», этап «🗣 Постановка»",
    submit: "Передать",
  },
  swap: {
    title: "Сменить исполнителя",
    hint: "Этап контроля не меняется",
    submit: "Сохранить",
  },
};

type Props = {
  mode: TPersonDialogMode;
  workspaceSlug: string;
  projectId: string;
  issueName: string;
  /** Label ids of the work item: the current person is preselected. */
  labelIds: string[];
  onClose: () => void;
  /** `peopleIds` — every «ЛЮДИ» label of the project (to drop the previous person). */
  onSubmit: (personLabelId: string, peopleIds: string[]) => Promise<boolean>;
};

const PersonForm = observer(function PersonForm(props: Props) {
  const { mode, workspaceSlug, projectId, issueName, labelIds, onClose, onSubmit } = props;
  const people = usePeople(workspaceSlug, projectId);
  const current = people.find((person) => labelIds.includes(person.id))?.id ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selected = picked ?? current;
  const copy = COPY[mode];
  const canSubmit = !isSubmitting && selected !== null && !(mode === "swap" && selected === current);

  const handleSubmit = async () => {
    if (!canSubmit || !selected) return;
    setIsSubmitting(true);
    const isDone = await onSubmit(
      selected,
      people.map((person) => person.id)
    );
    setIsSubmitting(false);
    if (isDone) onClose();
  };

  return (
    // Rendered in a portal outside the peek: without the mark the peek treats
    // clicks here as «outside» and closes.
    <div data-prevent-outside-click className={DIALOG_BODY}>
      <header className="flex flex-col gap-0.5">
        <h3 className={DIALOG_TITLE}>{copy.title}</h3>
        <p className="truncate text-body-xs-regular text-tertiary">{issueName}</p>
      </header>

      <fieldset className="flex flex-col gap-1.5">
        <legend className={`${FIELD_LABEL} mb-1.5`}>Кто делает</legend>
        {people.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Кто делает">
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                role="radio"
                aria-checked={selected === person.id}
                className={choiceChipClass(selected === person.id)}
                onClick={() => setPicked(person.id)}
              >
                {person.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-body-xs-regular text-secondary">
            В проекте нет людей: заведите метку «ЛЮДИ» и вложите в неё метки с именами.
          </p>
        )}
        <span className="text-caption-md-regular text-placeholder">{copy.hint}</span>
      </fieldset>

      <footer className={DIALOG_FOOTER}>
        <Button variant="secondary" size="lg" onClick={onClose} disabled={isSubmitting}>
          Отмена
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          loading={isSubmitting}
        >
          {copy.submit}
        </Button>
      </footer>
    </div>
  );
});

/** Mount only while open: the form reads the current person once. */
export function PersonDialog(props: Props) {
  return (
    <ModalCore isOpen handleClose={props.onClose} position={EModalPosition.TOP} width={EModalWidth.MD}>
      <PersonForm {...props} />
    </ModalCore>
  );
}

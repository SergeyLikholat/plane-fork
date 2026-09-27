/**
 * Week board — the weight chip of a card as a button: opens a compact list of
 * the project's «Вес» points. Picking a different point changes the estimate;
 * picking the current one just confirms it.
 *
 * The chip lives inside a draggable card that opens the peek on click and on
 * Enter/Space, so every pointer and key event is stopped here. The list is
 * portalled to <body> with a fixed popper: the column body scrolls and would
 * clip it otherwise.
 */
import { useState } from "react";
import type { SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { Listbox } from "@headlessui/react";
import { CheckIcon } from "@plane/propel/icons";
import type { TIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { EstimateValueIcon } from "@/components/estimates/weight-icon";
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useEstimate } from "@/hooks/store/estimates/use-estimate";
import { WeightChip } from "./weight-chip";
import { needsWeightConfirmation, useWeekBoardWeight } from "./weight-confirmations";
import type { TWeightInfo } from "./weights";

const stop = (event: SyntheticEvent) => event.stopPropagation();

const chipTitle = (info: TWeightInfo, isUnconfirmed: boolean): string => {
  if (info.isImplicit) return "Вес угадан по метке, оценка не проставлена — нажмите, чтобы выбрать";
  if (isUnconfirmed) return "Вес поставлен автоматически — нажмите, чтобы подтвердить или изменить";
  return "Вес из оценки задачи — нажмите, чтобы изменить";
};

type Props = { issue: TIssue; info: TWeightInfo };

export const WeekBoardWeightPicker = observer(function WeekBoardWeightPicker(props: Props) {
  const { issue, info } = props;
  const { isConfirmed, pickWeight } = useWeekBoardWeight();
  const { currentActiveEstimateIdByProjectId } = useProjectEstimates();
  const estimateId = issue.project_id ? currentActiveEstimateIdByProjectId(issue.project_id) : undefined;
  const { estimatePointIds, estimatePointById } = useEstimate(estimateId);
  const points = (estimatePointIds ?? []).map((id) => estimatePointById(id)).filter((p) => p?.id && p.value);

  const [buttonEl, setButtonEl] = useState<HTMLButtonElement | null>(null);
  const [popperEl, setPopperEl] = useState<HTMLElement | null>(null);
  const { styles, attributes } = usePopper(buttonEl, popperEl, {
    strategy: "fixed",
    placement: "bottom-end",
    modifiers: [
      { name: "offset", options: { offset: [0, 4] } },
      { name: "preventOverflow", options: { padding: 8 } },
    ],
  });

  const isUnconfirmed = needsWeightConfirmation(info, isConfirmed(issue.id));
  const isDashed = isUnconfirmed && !info.isImplicit;
  // No «Вес» estimate in the project (or not loaded yet) — nothing to pick from.
  if (points.length === 0) {
    return (
      <WeightChip
        weight={info.weight}
        isImplicit={info.isImplicit}
        isUnconfirmed={isDashed}
        title={info.isImplicit ? "Вес угадан по метке — оценка в задаче не проставлена" : "Вес из оценки задачи"}
      />
    );
  }

  return (
    <span role="presentation" className="shrink-0" onClick={stop} onKeyDown={stop}>
      <Listbox value={issue.estimate_point ?? null} onChange={(pointId: string) => void pickWeight(issue, pointId)}>
        <Listbox.Button
          ref={setButtonEl}
          draggable={false}
          // Keeps the card from starting a native drag from the chip.
          onMouseDown={(event: React.MouseEvent) => event.preventDefault()}
          onDragStart={(event: React.DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          title={chipTitle(info, isUnconfirmed)}
          aria-label={`Вес: ${info.weight}. ${chipTitle(info, isUnconfirmed)}`}
          className="flex rounded-sm outline-none hover:brightness-95 focus-visible:ring-1 focus-visible:ring-accent-strong"
        >
          <WeightChip
            weight={info.weight}
            isImplicit={info.isImplicit}
            isUnconfirmed={isDashed}
            className="cursor-pointer"
          />
        </Listbox.Button>
        {createPortal(
          <Listbox.Options
            ref={setPopperEl}
            style={styles.popper}
            {...attributes.popper}
            className="z-30 w-40 rounded-md border border-subtle bg-surface-1 p-1 text-12 shadow-raised-200 outline-none"
          >
            {points.map((point) => (
              <Listbox.Option
                key={point?.id}
                value={point?.id}
                className={({ active, selected }) =>
                  cn(
                    "flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 select-none",
                    active && "bg-layer-1-hover",
                    selected ? "font-medium text-primary" : "text-secondary"
                  )
                }
              >
                {({ selected }) => (
                  <>
                    <EstimateValueIcon value={point?.value} className="size-3.5" />
                    <span className="flex-1 truncate">{point?.value}</span>
                    {selected && <CheckIcon className="size-3.5 shrink-0 text-accent-primary" />}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>,
          document.body
        )}
      </Listbox>
    </span>
  );
});

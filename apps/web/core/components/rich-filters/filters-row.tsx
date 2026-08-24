/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { ListFilter, ListFilterPlus, X } from "lucide-react";
import { Transition } from "@headlessui/react";
// plane imports
import { Button } from "@plane/propel/button";
import type { IFilterInstance } from "@plane/shared-state";
import type { TExternalFilter, TFilterProperty } from "@plane/types";
import { cn, EHeaderVariant, Header, Loader } from "@plane/ui";
// local imports
import type { TAddFilterButtonProps } from "./add-filters/button";
import { AddFilterButton } from "./add-filters/button";
import { FilterItem } from "./filter-item/root";

export type TFiltersRowProps<K extends TFilterProperty, E extends TExternalFilter> = {
  buttonConfig?: TAddFilterButtonProps<K, E>["buttonConfig"];
  disabledAllOperations?: boolean;
  filter: IFilterInstance<K, E>;
  variant?: "modal" | "header";
  trackerElements?: {
    clearFilter?: string;
    saveView?: string;
    updateView?: string;
  };
};

export const FiltersRow = observer(function FiltersRow<K extends TFilterProperty, E extends TExternalFilter>(
  props: TFiltersRowProps<K, E>
) {
  const {
    buttonConfig,
    disabledAllOperations: disabledAllOperationsProp = false,
    filter,
    variant = "header",
    trackerElements,
  } = props;
  // states
  const [isUpdating, setIsUpdating] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  // derived values
  const disabledAllOperations = disabledAllOperationsProp || !filter.configManager.areConfigsReady;
  const hasAnyConditions = filter.allConditionsForDisplay.length > 0;
  const hasAvailableOperations =
    !disabledAllOperations && (filter.canClearFilters || filter.canSaveView || filter.canUpdateView);
  const conditionCount = filter.allConditionsForDisplay.length;

  const headerButtonConfig: Partial<TAddFilterButtonProps<K, E>["buttonConfig"]> = {
    label: null,
  };

  const modalButtonConfig: Partial<TAddFilterButtonProps<K, E>["buttonConfig"]> = {
    label: !hasAnyConditions ? "Фильтры" : null,
  };

  const handleUpdate = useCallback(async () => {
    setIsUpdating(true);
    try {
      await filter.updateView();
    } finally {
      setTimeout(() => setIsUpdating(false), 240); // To avoid flickering
    }
  }, [filter]);

  const leftContent = (
    <>
      {filter.allConditionsForDisplay.map((condition) => (
        <FilterItem key={condition.id} filter={filter} condition={condition} isDisabled={disabledAllOperations} />
      ))}
      <AddFilterButton
        filter={filter}
        buttonConfig={{
          label: null,
          ...(variant === "modal" ? modalButtonConfig : headerButtonConfig),
          size: "lg",
          iconConfig: {
            shouldShowIcon: true,
            iconComponent: ListFilterPlus,
          },
          ...buttonConfig,
          isDisabled: disabledAllOperations,
        }}
      />
    </>
  );

  const rightContent = !disabledAllOperations && (
    <>
      <ElementTransition show={filter.canClearFilters}>
        <Button
          variant="secondary"
          className={COMMON_OPERATION_BUTTON_CLASSNAME}
          onClick={filter.clearFilters}
          data-ph-element={trackerElements?.clearFilter}
        >
          {filter.clearFilterOptions?.label ?? "Очистить все"}
        </Button>
      </ElementTransition>
      <ElementTransition show={filter.canSaveView}>
        <Button
          variant="secondary"
          className={COMMON_OPERATION_BUTTON_CLASSNAME}
          onClick={filter.saveView}
          data-ph-element={trackerElements?.saveView}
        >
          {filter.saveViewOptions?.label ?? "Сохранить вид"}
        </Button>
      </ElementTransition>
      <ElementTransition show={filter.canUpdateView}>
        <Button
          variant="secondary"
          className={COMMON_OPERATION_BUTTON_CLASSNAME}
          onClick={handleUpdate}
          loading={isUpdating}
          disabled={isUpdating}
          data-ph-element={trackerElements?.updateView}
        >
          {isUpdating ? "Сохранение" : (filter.updateViewOptions?.label ?? "Обновить вид")}
        </Button>
      </ElementTransition>
    </>
  );

  const mainContent = (
    <div className="flex w-full items-start gap-2 rounded-lg bg-layer-1 px-3 py-2 md:px-4">
      <div className="flex w-full flex-wrap items-center gap-2">{leftContent}</div>
      <div
        className={cn("flex items-center gap-2 border-l border-subtle pl-4", {
          "border-l-transparent pl-0": !hasAvailableOperations,
        })}
      >
        {rightContent}
      </div>
    </div>
  );

  // Mobile (<lg) variant: compact "Фильтры (N)" trigger + bottom-sheet.
  // The inline chip row tried to fit operator+value into one line on a
  // 360-pixel viewport and truncated everything past the first half-word
  // ("Группа статусов | одно и…"). A bottom-sheet gives each chip its
  // own row at full width — values stay readable, no horizontal scroll
  // required, and adding/clearing filters works the same as on desktop.
  const MobileVariant = (
    <div className="flex w-full items-center justify-between gap-2 rounded-lg bg-layer-1 px-3 py-2">
      <button
        type="button"
        onClick={() => setIsMobileSheetOpen(true)}
        className="flex h-8 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 text-13 text-secondary hover:bg-layer-transparent-hover"
        aria-label="Открыть фильтры"
      >
        <ListFilter className="size-3.5 flex-shrink-0" />
        <span>Фильтры</span>
        {conditionCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-primary px-1.5 text-11 font-medium text-on-color">
            {conditionCount}
          </span>
        )}
      </button>
      {filter.canClearFilters && (
        <button
          type="button"
          onClick={filter.clearFilters}
          data-ph-element={trackerElements?.clearFilter}
          className="flex-shrink-0 rounded-md px-2 py-1 text-13 text-secondary hover:bg-layer-transparent-hover"
        >
          {filter.clearFilterOptions?.label ?? "Очистить все"}
        </button>
      )}
    </div>
  );

  const ModalVariant = (
    <div className="flex min-h-11 w-full flex-wrap items-center gap-2 rounded-lg bg-layer-1 p-2">{mainContent}</div>
  );

  const HeaderVariant = (
    <Header variant={EHeaderVariant.TERNARY} className="min-h-11 bg-surface-1 !px-3">
      <div className="hidden w-full lg:block">{mainContent}</div>
      <div className="block w-full lg:hidden">{MobileVariant}</div>
      {/* Bottom-sheet rendered to body via portal so it escapes the
          header's stacking context and overlays the whole viewport.
          z-[30] matches the rest of Plane's popover layer (modals,
          dropdowns, context menus). Dropdowns opened FROM inside the
          sheet (Add filter, operator, value) also portal to body at
          z-30 — same level — and DOM order resolves them above the
          sheet because they're appended later. Going higher (z-60)
          made these inner dropdowns appear behind the sheet's dim. */}
      {isMobileSheetOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[30] lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setIsMobileSheetOpen(false)} />
            <div className="absolute right-0 bottom-0 left-0 flex max-h-[85svh] flex-col overflow-hidden rounded-t-lg border-t border-strong bg-surface-1 text-secondary shadow-raised-200">
              <div className="flex flex-shrink-0 items-center justify-between border-b border-subtle px-4 py-3">
                <h3 className="text-body-sm-medium text-primary">
                  Фильтры{conditionCount > 0 ? ` (${conditionCount})` : ""}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsMobileSheetOpen(false)}
                  className="rounded-sm p-1 text-tertiary hover:bg-layer-transparent-hover"
                  aria-label="Закрыть"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="flex flex-col gap-2">
                  {filter.allConditionsForDisplay.map((condition) => (
                    // Each chip on its own row. `overflow-x-auto` on the
                    // wrapper lets a very-wide chip (e.g. value with many
                    // selected items) scroll horizontally WITHIN its row
                    // instead of overflowing the sheet.
                    <div
                      key={condition.id}
                      className="-mx-1 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                      <FilterItem filter={filter} condition={condition} isDisabled={disabledAllOperations} />
                    </div>
                  ))}
                  <div className="pt-1">
                    <AddFilterButton
                      filter={filter}
                      buttonConfig={{
                        label: "Добавить фильтр",
                        size: "lg",
                        iconConfig: {
                          shouldShowIcon: true,
                          iconComponent: ListFilterPlus,
                        },
                        ...buttonConfig,
                        isDisabled: disabledAllOperations,
                      }}
                    />
                  </div>
                </div>
              </div>
              {!disabledAllOperations && (filter.canClearFilters || filter.canSaveView || filter.canUpdateView) && (
                <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-subtle px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                  {rightContent}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </Header>
  );

  if (!filter.configManager.areConfigsReady && !hasAnyConditions) {
    return (
      <RowTransition show={filter.isVisible}>
        <Loader>
          <Loader.Item height="44px" width="100%" className={cn({ "rounded-none": variant === "header" })} />
        </Loader>
      </RowTransition>
    );
  }

  return <RowTransition show={filter.isVisible}>{variant === "modal" ? ModalVariant : HeaderVariant}</RowTransition>;
});

const COMMON_OPERATION_BUTTON_CLASSNAME = "py-1";

type TElementTransitionProps = {
  children: React.ReactNode;
  show: boolean;
};

const ElementTransition = observer(function ElementTransition(props: TElementTransitionProps) {
  return (
    <Transition
      show={props.show}
      enter="transition ease-out duration-200"
      enterFrom="opacity-0 scale-95"
      enterTo="opacity-100 scale-100"
      leave="transition ease-in duration-150"
      leaveFrom="opacity-100 scale-100"
      leaveTo="opacity-0 scale-95"
    >
      {props.children}
    </Transition>
  );
});

type TRowTransitionProps = {
  children: React.ReactNode;
  show: boolean;
};

const RowTransition = observer(function RowTransition(props: TRowTransitionProps) {
  return (
    <Transition
      show={props.show}
      enter="transition-all duration-150 ease-out"
      enterFrom="opacity-0 -translate-y-1"
      enterTo="opacity-100 translate-y-0"
      leave="transition-all duration-100 ease-in"
      leaveFrom="opacity-100 translate-y-0"
      leaveTo="opacity-0 -translate-y-1"
    >
      {props.children}
    </Transition>
  );
});

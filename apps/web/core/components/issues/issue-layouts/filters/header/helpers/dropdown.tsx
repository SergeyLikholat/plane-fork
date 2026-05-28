/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import type { Placement } from "@popperjs/core";
import { usePopper } from "react-popper";
// headless ui
import { Popover, Transition } from "@headlessui/react";
// ui
import { Button } from "@plane/propel/button";

type Props = {
  children: React.ReactNode;
  icon?: React.ReactElement;
  miniIcon?: React.ReactNode;
  title?: string;
  placement?: Placement;
  disabled?: boolean;
  tabIndex?: number;
  menuButton?: React.ReactNode;
  isFiltersApplied?: boolean;
};

export function FiltersDropdown(props: Props) {
  const {
    children,
    miniIcon,
    icon,
    title = "Dropdown",
    placement,
    disabled = false,
    tabIndex,
    menuButton,
    isFiltersApplied = false,
  } = props;

  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | HTMLDivElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "auto",
  });

  // When disabled, skip the Popover entirely and render a non-clickable
  // button so the dropdown panel cannot open and no transition artefact
  // shows on click.
  if (disabled) {
    return (
      <>
        <div className="hidden @4xl:flex">
          <Button
            disabled
            variant="secondary"
            prependIcon={icon}
            tabIndex={-1}
            className="relative cursor-not-allowed opacity-50"
            size="lg"
          >
            <span className="text-tertiary">{title}</span>
          </Button>
        </div>
        <div className="flex @4xl:hidden">
          <Button
            disabled
            variant="secondary"
            tabIndex={-1}
            size="lg"
            className="cursor-not-allowed opacity-50"
          >
            {miniIcon || title}
          </Button>
        </div>
      </>
    );
  }

  return (
    <Popover as="div">
      {({ open }) => (
        <>
          <Popover.Button as={React.Fragment}>
            {menuButton ? (
              <button type="button" ref={setReferenceElement}>
                {menuButton}
              </button>
            ) : (
              <div ref={setReferenceElement}>
                <div className="hidden @4xl:flex">
                  <Button
                    disabled={disabled}
                    variant="secondary"
                    prependIcon={icon}
                    tabIndex={tabIndex}
                    className="relative"
                    size="lg"
                  >
                    <>
                      <div className={`${open ? "text-primary" : "text-secondary"}`}>
                        <span>{title}</span>
                      </div>
                      {isFiltersApplied && (
                        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent-primary" />
                      )}
                    </>
                  </Button>
                </div>
                <div className="flex @4xl:hidden">
                  <Button
                    disabled={disabled}
                    ref={setReferenceElement}
                    variant="secondary"
                    tabIndex={tabIndex}
                    size="lg"
                  >
                    {miniIcon || title}
                  </Button>
                </div>
              </div>
            )}
          </Popover.Button>
          {/* Portal the panel out to body so it escapes any ancestor stacking
              context — calendar's sticky `весь день` row creates one (it has
              z-20 + sticky positioning) and was painting OVER the dropdown
              even at z-50. document.body is at the root, so z-[100] there
              wins outright. */}
          {typeof document !== "undefined" &&
            createPortal(
              <Transition
                as={Fragment}
                show={open}
                enter="transition ease-out duration-200"
                enterFrom="opacity-0 translate-y-1"
                enterTo="opacity-100 translate-y-0"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 translate-y-1"
              >
                <Popover.Panel static className="fixed z-[100] translate-y-0">
                  <div
                    className="my-1 overflow-hidden rounded-sm border border-subtle bg-surface-1 shadow-raised-100"
                    ref={setPopperElement}
                    style={styles.popper}
                    {...attributes.popper}
                  >
                    <div className="flex max-h-[30rem] w-[18.75rem] flex-col overflow-hidden lg:max-h-[37.5rem]">
                      {children}
                    </div>
                  </div>
                </Popover.Panel>
              </Transition>,
              document.body
            )}
        </>
      )}
    </Popover>
  );
}

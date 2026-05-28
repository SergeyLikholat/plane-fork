/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { forwardRef, useEffect } from "react";
import { observer } from "mobx-react";
import { TwitterPicker } from "react-color";
import type { SubmitHandler } from "react-hook-form";
import { Controller, useForm } from "react-hook-form";
import { Popover, Transition } from "@headlessui/react";
// plane imports
import { getRandomLabelColor, LABEL_COLOR_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { ChevronDownIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IIssueLabel } from "@plane/types";
import { Input } from "@plane/ui";

// error codes
const errorCodes = {
  LABEL_NAME_ALREADY_EXISTS: "LABEL_NAME_ALREADY_EXISTS",
};

export type TLabelOperationsCallbacks = {
  createLabel: (data: Partial<IIssueLabel>) => Promise<IIssueLabel>;
  updateLabel: (labelId: string, data: Partial<IIssueLabel>) => Promise<IIssueLabel>;
};

type TCreateUpdateLabelInlineProps = {
  labelForm: boolean;
  setLabelForm: React.Dispatch<React.SetStateAction<boolean>>;
  isUpdating: boolean;
  labelOperationsCallbacks: TLabelOperationsCallbacks;
  labelToUpdate?: IIssueLabel;
  onClose?: () => void;
  // Fork tweak: pool of labels that can serve as parent (category) for the
  // label being edited. The settings page passes its `projectLabels` here.
  // Empty / undefined = no parent select shown (back-compat for unused
  // callers that don't pass labels).
  availableParents?: IIssueLabel[];
};

const defaultValues: Partial<IIssueLabel> = {
  name: "",
  color: "var(--text-color-secondary)",
  parent: null,
};

export const CreateUpdateLabelInline = observer(
  forwardRef(function CreateUpdateLabelInline(
    props: TCreateUpdateLabelInlineProps,
    ref: React.ForwardedRef<HTMLDivElement>
  ) {
    const {
      labelForm,
      setLabelForm,
      isUpdating,
      labelOperationsCallbacks,
      labelToUpdate,
      onClose,
      availableParents = [],
    } = props;
    // form info
    const {
      handleSubmit,
      control,
      reset,
      formState: { errors, isSubmitting },
      watch,
      setValue,
      setFocus,
    } = useForm<IIssueLabel>({
      defaultValues,
    });

    const { t } = useTranslation();

    const handleClose = () => {
      setLabelForm(false);
      reset(defaultValues);
      if (onClose) onClose();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getErrorMessage = (error: any, operation: "create" | "update"): string => {
      const errorData = error ?? {};

      const labelError = errorData.name?.includes(errorCodes.LABEL_NAME_ALREADY_EXISTS);
      if (labelError) {
        return t("label.create.already_exists");
      }

      // Fallback to general error messages
      if (operation === "create") {
        return errorData?.detail ?? errorData?.error ?? t("common.something_went_wrong");
      }

      return errorData?.error ?? t("project_settings.labels.toast.error");
    };

    const handleLabelCreate: SubmitHandler<IIssueLabel> = async (formData) => {
      if (isSubmitting) return;

      await labelOperationsCallbacks
        .createLabel(formData)
        .then((_res) => {
          handleClose();
          reset(defaultValues);
        })
        .catch((error) => {
          const errorMessage = getErrorMessage(error, "create");
          setToast({
            title: "Error!",
            type: TOAST_TYPE.ERROR,
            message: errorMessage,
          });
          reset(formData);
        });
    };

    const handleLabelUpdate: SubmitHandler<IIssueLabel> = async (formData) => {
      if (!labelToUpdate?.id || isSubmitting) return;

      await labelOperationsCallbacks
        .updateLabel(labelToUpdate.id, formData)
        .then((_res) => {
          reset(defaultValues);
          handleClose();
        })
        .catch((error) => {
          const errorMessage = getErrorMessage(error, "update");
          setToast({
            title: "Oops!",
            type: TOAST_TYPE.ERROR,
            message: errorMessage,
          });
          reset(formData);
        });
    };

    const handleFormSubmit = (formData: IIssueLabel) => {
      if (isUpdating) {
        handleLabelUpdate(formData);
      } else {
        handleLabelCreate(formData);
      }
    };

    /**
     * For settings focus on name input
     */
    useEffect(() => {
      setFocus("name");
    }, [setFocus, labelForm]);

    useEffect(() => {
      if (!labelToUpdate) return;

      setValue("name", labelToUpdate.name);
      setValue("color", labelToUpdate.color && labelToUpdate.color !== "" ? labelToUpdate.color : "#000");
      // Pre-populate parent for edit-mode so the select shows the current
      // category. Backend stores `parent` as UUID string or null.
      setValue("parent", labelToUpdate.parent ?? null);
    }, [labelToUpdate, setValue]);

    // Filter potential parents: top-level only (parent==null) AND not the
    // label being edited itself (a label can't be its own parent). This
    // keeps the hierarchy at most 2 levels deep, matching the chip-filter
    // picker in the issue dropdown.
    const parentOptions = availableParents.filter(
      (l) => l.parent == null && l.id !== labelToUpdate?.id
    );

    useEffect(() => {
      if (labelToUpdate) {
        setValue("color", labelToUpdate.color && labelToUpdate.color !== "" ? labelToUpdate.color : "#000");
        return;
      }

      setValue("color", getRandomLabelColor());
    }, [labelToUpdate, setValue]);

    return (
      <>
        <div
          ref={ref}
          className={`flex w-full scroll-m-8 items-center gap-2 bg-surface-1 ${labelForm ? "" : "hidden"}`}
        >
          <div className="flex-shrink-0">
            <Popover className="relative z-10 flex h-full w-full items-center justify-center">
              {({ open }) => (
                <>
                  <Popover.Button
                    className={`group inline-flex items-center text-14 font-medium focus:outline-none ${
                      open ? "text-primary" : "text-secondary"
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full"
                      style={{
                        backgroundColor: watch("color"),
                      }}
                    />
                  </Popover.Button>

                  <Transition
                    as={React.Fragment}
                    enter="transition ease-out duration-200"
                    enterFrom="opacity-0 translate-y-1"
                    enterTo="opacity-100 translate-y-0"
                    leave="transition ease-in duration-150"
                    leaveFrom="opacity-100 translate-y-0"
                    leaveTo="opacity-0 translate-y-1"
                  >
                    <Popover.Panel className="absolute top-full left-0 z-20 mt-3 w-screen max-w-xs px-2 sm:px-0">
                      <Controller
                        name="color"
                        control={control}
                        render={({ field: { value, onChange } }) => (
                          <TwitterPicker
                            colors={LABEL_COLOR_OPTIONS}
                            color={value}
                            onChange={(value) => onChange(value.hex)}
                          />
                        )}
                      />
                    </Popover.Panel>
                  </Transition>
                </>
              )}
            </Popover>
          </div>
          <div className="flex flex-1 flex-col justify-center">
            <Controller
              control={control}
              name="name"
              rules={{
                required: t("project_settings.labels.label_title_is_required"),
                maxLength: {
                  value: 255,
                  message: t("project_settings.labels.label_max_char"),
                },
              }}
              render={({ field: { value, onChange, ref } }) => (
                <Input
                  id="labelName"
                  name="name"
                  type="text"
                  autoFocus
                  value={value}
                  onChange={onChange}
                  ref={ref}
                  hasError={Boolean(errors.name)}
                  placeholder={t("project_settings.labels.label_title")}
                  className="w-full"
                />
              )}
            />
          </div>
          {parentOptions.length > 0 && (
            <Controller
              control={control}
              name="parent"
              render={({ field: { value, onChange } }) => (
                <div className="relative">
                  <select
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
                    className="h-9 w-44 appearance-none rounded-md border-[0.5px] border-subtle-1 bg-layer-2 px-3 pr-8 text-13 text-secondary focus:outline-none focus:ring-1 focus:ring-accent-strong"
                    aria-label="Категория"
                  >
                    <option value="">Без категории</option>
                    {parentOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-tertiary" />
                </div>
              )}
            />
          )}
          <Button variant="secondary" onClick={() => handleClose()}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={(e) => {
              e.preventDefault();
              handleSubmit(handleFormSubmit)();
            }}
            loading={isSubmitting}
          >
            {isUpdating ? (isSubmitting ? t("updating") : t("update")) : isSubmitting ? t("adding") : t("add")}
          </Button>
        </div>
        {errors.name?.message && <p className="p-0.5 pl-8 text-13 text-danger-primary">{errors.name?.message}</p>}
      </>
    );
  })
);

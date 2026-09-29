/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState, useEffect, useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import type {
  SingleOrArray,
  IFilterOption,
  TFilterProperty,
  TMultiSelectFilterFieldConfig,
  TFilterConditionNodeForDisplay,
} from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { toFilterArray, getFilterValueLength } from "@plane/utils";
// local imports
import { SelectedOptionsDisplay } from "./selected-options-display";
import { getCommonCustomSearchSelectProps, getFormattedOptions, loadOptions } from "./shared";

type TMultiSelectFilterValueInputProps<P extends TFilterProperty> = {
  config: TMultiSelectFilterFieldConfig<string>;
  condition: TFilterConditionNodeForDisplay<P, string>;
  isDisabled?: boolean;
  onChange: (values: SingleOrArray<string>) => void;
};

export const MultiSelectFilterValueInput = observer(function MultiSelectFilterValueInput<P extends TFilterProperty>(
  props: TMultiSelectFilterValueInputProps<P>
) {
  const { config, condition, isDisabled, onChange } = props;
  // states
  const [options, setOptions] = useState<IFilterOption<string>[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  // derived values
  const mergedOptions = useMemo(
    () => (config.mergeOptionsByLabel ? mergeOptionsByLabel(options) : undefined),
    [config.mergeOptionsByLabel, options]
  );
  const visibleOptions = mergedOptions?.options ?? options;
  const formattedOptions = useMemo(() => getFormattedOptions<string>(visibleOptions), [visibleOptions]);
  const rawValues = toFilterArray(condition.value).map(String);
  // With merged options the select works on representative values: any
  // selected alias marks its merged entry as picked. Values that belong to no
  // option (e.g. a deleted state) are kept as-is so they are not dropped.
  const selectValues = mergedOptions
    ? Array.from(new Set(rawValues.map((value) => mergedOptions.representativeByValue.get(value) ?? value)))
    : rawValues;

  useEffect(() => {
    loadOptions({ config, setOptions, setLoading });
  }, [config]);

  const handleSelectChange = (values: string[]) => {
    if (!mergedOptions) {
      onChange(values);
      return;
    }
    const expanded = values.flatMap((value) => mergedOptions.valuesByRepresentative.get(value) ?? [value]);
    onChange(Array.from(new Set(expanded)));
  };

  return (
    <CustomSearchSelect
      {...getCommonCustomSearchSelectProps(isDisabled)}
      value={selectValues}
      onChange={handleSelectChange}
      options={formattedOptions}
      multiple
      disabled={loading || isDisabled}
      customButton={<SelectedOptionsDisplay<string> selectedValue={selectValues} options={visibleOptions} />}
      defaultOpen={getFilterValueLength(condition.value) === 0}
    />
  );
});

type TMergedOptions = {
  options: IFilterOption<string>[];
  representativeByValue: Map<string, string>;
  valuesByRepresentative: Map<string, string[]>;
};

/**
 * Collapse options with the same label (trimmed, case-insensitive — the same
 * key as buildStateNameAliasMap) into one entry, keeping the first option's
 * position, label and icon. Its value stands for all merged values.
 */
const mergeOptionsByLabel = (options: IFilterOption<string>[]): TMergedOptions => {
  const representativeByKey = new Map<string, string>();
  const representativeByValue = new Map<string, string>();
  const valuesByRepresentative = new Map<string, string[]>();
  const merged: IFilterOption<string>[] = [];
  options.forEach((option) => {
    const key = String(option.label).trim().toLowerCase();
    const representative = representativeByKey.get(key);
    if (representative === undefined) {
      representativeByKey.set(key, option.value);
      representativeByValue.set(option.value, option.value);
      valuesByRepresentative.set(option.value, [option.value]);
      merged.push(option);
      return;
    }
    representativeByValue.set(option.value, representative);
    valuesByRepresentative.set(representative, [...(valuesByRepresentative.get(representative) ?? []), option.value]);
  });
  return { options: merged, representativeByValue, valuesByRepresentative };
};

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/propel/utils";
import type { IFilterInstance } from "@plane/shared-state";
import type { TExternalFilter, TFilterProperty, TSupportedOperators } from "@plane/types";
// local imports
import { AddFilterDropdown } from "../add-filters/dropdown";
import { COMMON_FILTER_ITEM_BORDER_CLASSNAME } from "../shared";

interface IFilterItemPropertyProps<P extends TFilterProperty, E extends TExternalFilter> {
  conditionId: string;
  icon: React.FC<React.SVGAttributes<SVGElement>> | undefined;
  isDisabled?: boolean;
  filter: IFilterInstance<P, E>;
  label: string;
  tooltipContent?: React.ReactNode | undefined;
}

export const FilterItemProperty = observer(function FilterItemProperty<
  P extends TFilterProperty,
  E extends TExternalFilter,
>(props: IFilterItemPropertyProps<P, E>) {
  const { conditionId, filter, isDisabled } = props;

  if (isDisabled) {
    return <PropertyButton {...props} />;
  }

  const handleFilterSelect = (property: P, operator: TSupportedOperators, isNegation: boolean) => {
    filter.updateConditionProperty(conditionId, property, operator, isNegation);
  };

  return (
    <AddFilterDropdown
      {...props}
      handleFilterSelect={handleFilterSelect}
      customButton={<PropertyButton {...props} />}
    />
  );
});

type TPropertyButtonProps<P extends TFilterProperty, E extends TExternalFilter> = IFilterItemPropertyProps<P, E> & {
  className?: string;
};

function PropertyButton<P extends TFilterProperty, E extends TExternalFilter>(props: TPropertyButtonProps<P, E>) {
  const { icon: Icon, label, tooltipContent, className } = props;

  return (
    <Tooltip tooltipContent={tooltipContent} position="bottom-start" disabled={!tooltipContent}>
      <div
        className={cn(
          // h-full, not self-stretch: this button is handed to AddFilterDropdown
          // as `customButton`, so it renders inside that dropdown's own plain
          // wrapper — not as a direct flex child of the chip row. align-self has
          // nothing to act on there and the label collapses to its line height
          // (measured: 14px tall, sitting 6px above the chip centre). The
          // wrapper does have a resolved height, so height:100% centres it.
          // No vertical padding either: the row is a fixed 28px and items-center
          // does the centring; a hard py-[5px] left too little room for the 13px
          // line box and pushed the label down.
          "flex h-full min-w-0 items-center gap-1 px-2 text-13 leading-none text-tertiary",
          COMMON_FILTER_ITEM_BORDER_CLASSNAME,
          className
        )}
      >
        {Icon && (
          <div className="flex-shrink-0 transition-transform duration-200 ease-in-out">
            <Icon className="size-3.5" />
          </div>
        )}
        <span className="truncate">{label}</span>
      </div>
    </Tooltip>
  );
}

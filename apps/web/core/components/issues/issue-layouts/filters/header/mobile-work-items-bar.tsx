/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { EIssueFilterType, ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ChevronDownIcon } from "@plane/propel/icons";
import type {
  ICycle,
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  IIssueFilters,
  IModule,
  TIssueGroupByOptions,
} from "@plane/types";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
// components
import { WorkItemsModal } from "@/components/analytics/work-items/modal";
import { WorkItemFiltersToggle } from "@/components/work-item-filters/filters-toggle";
// hooks
import { useProject } from "@/hooks/store/use-project";
// local imports
import { DisplayFiltersSelection } from "./display-filters";
import { FiltersDropdown } from "./helpers/dropdown";
import { MobileLayoutSelection } from "./mobile-layout-selection";

const MOBILE_LAYOUTS = [EIssueLayoutTypes.LIST, EIssueLayoutTypes.KANBAN, EIssueLayoutTypes.CALENDAR];

type Props = {
  storeType: EIssuesStoreType.PROJECT | EIssuesStoreType.MODULE | EIssuesStoreType.CYCLE;
  /** project id for the project list, module / cycle id inside a module / cycle */
  entityId: string;
  issueFilters: IIssueFilters | undefined;
  onUpdateFilters: (
    type: EIssueFilterType.DISPLAY_FILTERS | EIssueFilterType.DISPLAY_PROPERTIES,
    value: Partial<IIssueDisplayFilterOptions> | Partial<IIssueDisplayProperties>
  ) => void;
  ignoreGroupedFilters?: Partial<TIssueGroupByOptions>[];
  moduleDetails?: IModule;
  cycleDetails?: ICycle;
};

/**
 * Mobile toolbar under the header: layout · display · add filter · analytics.
 * Shared by the project work-items list, a module and a cycle so the three screens
 * look and behave the same on a phone.
 */
export const MobileWorkItemsBar = observer(function MobileWorkItemsBar(props: Props) {
  const { storeType, entityId, issueFilters, onUpdateFilters, ignoreGroupedFilters, moduleDetails, cycleDetails } =
    props;
  const { t } = useTranslation();
  const [analyticsModal, setAnalyticsModal] = useState(false);
  const { currentProjectDetails } = useProject();
  const activeLayout = issueFilters?.displayFilters?.layout;

  return (
    <>
      <WorkItemsModal
        isOpen={analyticsModal}
        onClose={() => setAnalyticsModal(false)}
        projectDetails={currentProjectDetails ?? undefined}
        moduleDetails={moduleDetails}
        cycleDetails={cycleDetails}
      />
      <div className="z-[13] flex items-center justify-evenly border-b border-subtle bg-surface-1 py-2 md:hidden">
        <MobileLayoutSelection
          layouts={MOBILE_LAYOUTS}
          activeLayout={activeLayout}
          onChange={(layout) => onUpdateFilters(EIssueFilterType.DISPLAY_FILTERS, { layout })}
        />
        <div className="flex flex-grow items-center justify-center border-l border-subtle text-13 text-secondary">
          <FiltersDropdown
            title={t("common.display")}
            placement="bottom-end"
            menuButton={
              <span className="flex items-center text-13 text-secondary">
                {t("common.display")}
                <ChevronDownIcon className="ml-2 h-4 w-4 text-secondary" />
              </span>
            }
          >
            <DisplayFiltersSelection
              layoutDisplayFiltersOptions={
                activeLayout ? ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.layoutOptions[activeLayout] : undefined
              }
              displayFilters={issueFilters?.displayFilters ?? {}}
              handleDisplayFiltersUpdate={(value) => onUpdateFilters(EIssueFilterType.DISPLAY_FILTERS, value)}
              displayProperties={issueFilters?.displayProperties ?? {}}
              handleDisplayPropertiesUpdate={(value) => onUpdateFilters(EIssueFilterType.DISPLAY_PROPERTIES, value)}
              ignoreGroupedFilters={ignoreGroupedFilters}
              cycleViewDisabled={!currentProjectDetails?.cycle_view}
              moduleViewDisabled={!currentProjectDetails?.module_view}
            />
          </FiltersDropdown>
        </div>

        {/* "Add filter" (+) entry — without it the filter row only shows up once a
            condition exists, so there was no way to add the first filter on a phone. */}
        <div className="flex flex-shrink-0 items-center justify-center border-l border-subtle px-3">
          <WorkItemFiltersToggle entityType={storeType} entityId={entityId} />
        </div>

        <button
          onClick={() => setAnalyticsModal(true)}
          className="flex flex-grow justify-center border-l border-subtle text-13 text-secondary"
        >
          {t("common.analytics")}
        </button>
      </div>
    </>
  );
});

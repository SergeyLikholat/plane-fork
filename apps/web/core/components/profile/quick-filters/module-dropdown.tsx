/**
 * Two-level module picker for «Ваша работа»: projects first, modules second.
 *
 * Modules are project-scoped and their names only make sense next to their
 * project ("Contracts" in one, "Finance" in another), so a flat cross-project
 * list would be unreadable. The panel therefore opens on the project list and drills into
 * one project's modules; going back is a single click.
 *
 * Projects with no modules never appear.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { ChevronRight, ChevronLeft, X } from "lucide-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import type { IModule, IProject } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
// local imports
import { QuickFilterDropdown, QuickFilterOption } from "./dropdown-shell";
import { useConditionValues } from "./use-condition-values";

type TProjectModules = {
  project: IProject;
  modules: IModule[];
};

type TModuleQuickFilterProps = {
  filter: IWorkItemFilterInstance;
};

export const ModuleQuickFilter = observer(function ModuleQuickFilter(props: TModuleQuickFilterProps) {
  const { filter } = props;
  const { joinedProjectIds, getProjectById } = useProject();
  const { getProjectModuleDetails } = useModule();
  const { selectedIds, setSelection, toggleIds } = useConditionValues(filter, "module_id");
  // `null` = showing the project list; otherwise the drilled-into project id.
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  // NOT memoized on purpose. `getProjectModuleDetails` is a MobX computedFn
  // with a stable identity and `joinedProjectIds` does not change when the
  // workspace modules finally arrive — a useMemo keyed on them would hand
  // back the empty first-render result forever, even though the observer
  // re-renders. Reading store data directly in the render body is what makes
  // the observer track it.
  //
  // Every joined project is listed, including the ones without modules: a
  // silently missing project reads as a bug ("а где мой проект?"),
  // whereas an explicit "нет модулей" answers the question in place.
  const projectModules: TProjectModules[] = (joinedProjectIds ?? [])
    .map((projectId) => {
      const project = getProjectById(projectId);
      if (!project) return undefined;
      return { project, modules: getProjectModuleDetails(projectId) ?? [] };
    })
    .filter((entry): entry is TProjectModules => entry !== undefined);

  const allModules = projectModules.flatMap((entry) => entry.modules);
  const activeModules = allModules.filter((module) => selectedIds.has(module.id));
  const openProject = projectModules.find((entry) => entry.project.id === openProjectId);

  // Nothing to filter by anywhere in the workspace — hide the control entirely.
  if (allModules.length === 0) return null;

  return (
    <QuickFilterDropdown label="Модули" activeCount={activeModules.length} activeSummary={activeModules[0]?.name}>
      {activeModules.length > 0 && (
        <button
          type="button"
          onClick={() => setSelection([])}
          className="mb-1 flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-11 text-tertiary transition-colors hover:bg-layer-1-hover hover:text-secondary"
        >
          <X className="size-3" />
          Снять выбор
        </button>
      )}

      {!openProject &&
        projectModules.map(({ project, modules }) => {
          const selectedCount = modules.filter((module) => selectedIds.has(module.id)).length;
          const isEmpty = modules.length === 0;
          return (
            <button
              key={project.id}
              type="button"
              disabled={isEmpty}
              onClick={() => setOpenProjectId(project.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-13 transition-colors",
                isEmpty ? "cursor-default text-placeholder" : "text-secondary hover:bg-layer-1-hover"
              )}
            >
              <span className="grid size-4 flex-shrink-0 place-items-center">
                <Logo logo={project.logo_props} size={12} />
              </span>
              <span className="flex-1 truncate">{project.name}</span>
              {isEmpty && <span className="flex-shrink-0 text-11">нет модулей</span>}
              {selectedCount > 0 && (
                <span className="rounded-full bg-accent-primary px-1.5 text-10 text-on-color">{selectedCount}</span>
              )}
              {!isEmpty && <ChevronRight className="size-3.5 flex-shrink-0 text-tertiary" />}
            </button>
          );
        })}

      {openProject && (
        <>
          <button
            type="button"
            onClick={() => setOpenProjectId(null)}
            className="mb-1 flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-11 font-medium text-tertiary transition-colors hover:bg-layer-1-hover hover:text-secondary"
          >
            <ChevronLeft className="size-3.5" />
            <span className="truncate">{openProject.project.name}</span>
          </button>
          {openProject.modules.map((module) => (
            <QuickFilterOption
              key={module.id}
              name={module.name}
              isSelected={selectedIds.has(module.id)}
              onClick={() => toggleIds([module.id])}
            />
          ))}
        </>
      )}
    </QuickFilterDropdown>
  );
});

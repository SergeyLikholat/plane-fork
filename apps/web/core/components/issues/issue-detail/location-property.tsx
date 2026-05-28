/**
 * "Расположение" sidebar property — breadcrumb of where the issue lives:
 * <project logo> Project › <state dot> State.
 *
 * Each chip is independently clickable:
 * - project chip → kanban view of the project
 * - state chip → same kanban with `?focusedState={stateId}` (the kanban
 *   layout reacts to this and scrolls/highlights the column)
 *
 * Navigation is via `useAppRouter().push(...)` (same tab, no <a target>).
 */

import { observer } from "mobx-react";
import { ChevronRight } from "lucide-react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
};

export const IssueLocationProperty = observer(function IssueLocationProperty(props: Props) {
  const { workspaceSlug, projectId, issueId } = props;
  const router = useAppRouter();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getProjectById } = useProject();
  const { getStateById } = useProjectState();

  const issue = getIssueById(issueId);
  const project = getProjectById(projectId);
  const state = issue?.state_id ? getStateById(issue.state_id) : null;

  if (!project) return null;

  const goToProject = () => router.push(`/${workspaceSlug}/projects/${projectId}/issues`);
  const goToState = () => {
    if (!state) return goToProject();
    router.push(`/${workspaceSlug}/projects/${projectId}/issues?focusedState=${state.id}`);
  };

  const hasLogo =
    project.logo_props &&
    typeof project.logo_props === "object" &&
    (project.logo_props as any).in_use;

  // Match the parent SidebarPropertyListItem label box (h-7.5, items-center
  // inside an items-start row) so the text baseline of "Расположение" lines
  // up with project/state names.
  return (
    <div className="flex h-7.5 w-full min-w-0 items-center gap-1 px-2">
      <button
        type="button"
        onClick={goToProject}
        title={project.name}
        className="flex min-w-0 max-w-[55%] items-center gap-1.5 rounded px-1 text-body-xs-regular text-secondary hover:bg-layer-1-hover hover:text-primary"
      >
        {hasLogo ? (
          <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
            <Logo logo={project.logo_props as any} size={14} />
          </span>
        ) : null}
        <span className="truncate leading-5">{project.name}</span>
      </button>
      {state && (
        <>
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-tertiary" />
          <button
            type="button"
            onClick={goToState}
            title={state.name}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-body-xs-regular text-secondary hover:bg-layer-1-hover hover:text-primary"
          >
            {state.color ? (
              <span
                className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: state.color }}
              />
            ) : null}
            <span className="truncate leading-5">{state.name}</span>
          </button>
        </>
      )}
    </div>
  );
});

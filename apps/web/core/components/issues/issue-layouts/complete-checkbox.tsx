/**
 * Shared "mark as complete" checkbox used across all issue layouts.
 *
 * Behaviour:
 *   • Checked iff the issue's current state belongs to the `completed` group.
 *   • Click while unchecked → moves the issue to the project's first state in
 *     the `completed` group.
 *   • Click while checked   → moves it back to a sensible non-completed state
 *     (preferring `started` → `unstarted` → `backlog`). The previous state is
 *     remembered locally for the duration of the session so toggling restores
 *     the original column when possible.
 *
 * The component is intentionally cheap: no peek redirect, no menu — just a
 * fixed-size square that flips state. It stops pointer/click propagation so
 * adding it to a draggable card or peek-link wrapper doesn't trigger those
 * parent actions.
 */
import { observer } from "mobx-react";
import type { MouseEvent, PointerEvent } from "react";
import { Check } from "lucide-react";
import type { TIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { useProjectState } from "@/hooks/store/use-project-state";

type Props = {
  issue: Pick<TIssue, "id" | "project_id" | "state_id">;
  updateIssue?: (
    projectId: string | null | undefined,
    issueId: string,
    data: Partial<TIssue>
  ) => Promise<void> | void | undefined;
  size?: "xs" | "sm";
  disabled?: boolean;
  className?: string;
};

// Session-local mapping of issueId → previous state_id so unchecking can
// restore the original column. Module-scoped Map keeps it stable across
// renders without leaking into MobX or persistent storage.
const previousStateByIssue = new Map<string, string>();

export const CompleteCheckbox = observer(function CompleteCheckbox(props: Props) {
  const { issue, updateIssue, size = "sm", disabled, className } = props;
  const { stateMap, getProjectStates } = useProjectState();

  const projectId = issue.project_id;
  if (!projectId) return null;

  const projectStates = getProjectStates(projectId) ?? [];
  if (projectStates.length === 0) return null;

  const currentState = issue.state_id ? stateMap[issue.state_id] : undefined;
  const isCompleted = currentState?.group === "completed";

  const sizeCls =
    size === "xs"
      ? "h-3.5 w-3.5 [&_svg]:h-2.5 [&_svg]:w-2.5"
      : "h-4 w-4 [&_svg]:h-3 [&_svg]:w-3";

  const handleClick = async (e: MouseEvent | PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !updateIssue) return;

    let targetStateId: string | undefined;
    if (isCompleted) {
      // Unchecking: prefer the remembered previous state, then fall back by group.
      const remembered = previousStateByIssue.get(issue.id);
      if (remembered && projectStates.some((s) => s.id === remembered)) {
        targetStateId = remembered;
      } else {
        const byGroup = (g: string) => projectStates.find((s) => s.group === g)?.id;
        targetStateId =
          byGroup("started") ?? byGroup("unstarted") ?? byGroup("backlog");
      }
    } else {
      if (issue.state_id) previousStateByIssue.set(issue.id, issue.state_id);
      targetStateId = projectStates.find((s) => s.group === "completed")?.id;
    }
    if (!targetStateId || targetStateId === issue.state_id) return;
    try {
      await updateIssue(projectId, issue.id, { state_id: targetStateId });
    } catch {
      /* parent layout shows toast; checkbox just no-ops on failure */
    }
  };

  // Plane's tailwind palette resets default colors to `initial` (see
  // packages/tailwind-config/variables.css) — that's why `bg-emerald-*`
  // silently rendered transparent. Use the project's semantic
  // `success-primary` token, which is the accepted "done" green.
  const checkedStyle: React.CSSProperties = {
    backgroundColor: "var(--bg-success-primary)",
    borderColor: "var(--bg-success-primary)",
    color: "var(--color-white)",
  };

  return (
    <button
      type="button"
      aria-label={isCompleted ? "Снять отметку выполнения" : "Отметить выполненной"}
      title={isCompleted ? "Снять отметку выполнения" : "Отметить выполненной"}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={handleClick}
      disabled={disabled || !updateIssue}
      style={isCompleted ? checkedStyle : undefined}
      className={cn(
        "inline-grid flex-shrink-0 place-items-center rounded-sm border transition-colors",
        sizeCls,
        !isCompleted &&
          "border-subtle-1 bg-surface-1 text-transparent hover:border-strong hover:text-tertiary",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <Check strokeWidth={3} />
    </button>
  );
});

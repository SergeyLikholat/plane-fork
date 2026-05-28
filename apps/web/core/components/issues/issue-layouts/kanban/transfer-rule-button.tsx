/**
 * Per-card "↗ передача" button shown on Kanban issue blocks.
 *
 * Sits next to the three-dot quick-actions menu, appears on hover only, and
 * is hidden entirely if the project has no transfer rules. Clicking opens a
 * tiny popover listing applicable rules (filtered by current state); picking
 * one fires `applyRule` on the backend (atomic state move + assignee/label
 * mutations) and immediately calls the kanban store's `updateIssue` with
 * `skip_activity: true` so the card moves between columns without waiting
 * for the next polling tick.
 *
 * Why filter by source state on the client: rules with empty source_state_ids
 * are universal; otherwise we want to show only rules whose source allow the
 * card's current state. Backend re-validates on apply.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { ArrowUpRight, Loader2 } from "lucide-react";
// plane imports
import { useOutsideClickDetector } from "@plane/hooks";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue, TLogoProps } from "@plane/types";
// components
import { RuleLogo } from "@/plane-web/components/automations/transfer-rules-root";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// store
import { previewIssueAfterRule, transferRuleStore } from "@/store/transfer-rule.store";

type Props = {
  issue: TIssue;
  workspaceSlug: string;
  /** Same updateIssue signature the kanban block already receives. Used after
   *  apply to push the new state into the local issue map immediately. */
  updateIssue?: (
    projectId: string | null,
    issueId: string,
    data: Partial<TIssue>
  ) => Promise<void>;
  /** Lets the parent block keep the action-row visible while the popover is
   *  open — otherwise moving the cursor off the card hides the row (it has
   *  `hidden group-hover/kanban-block:flex`) and the popover unmounts. */
  onOpenChange?: (open: boolean) => void;
};

const isEmptyLogo = (lp: TLogoProps | Record<string, never> | undefined): boolean =>
  !lp || !("in_use" in lp) || !lp.in_use;

export const KanbanTransferRuleButton = observer(function KanbanTransferRuleButton(props: Props) {
  const { issue, workspaceSlug, updateIssue, onOpenChange } = props;
  const projectId = issue.project_id || "";

  const [open, setOpenRaw] = useState(false);
  const setOpen = (next: boolean | ((v: boolean) => boolean)) =>
    setOpenRaw((prev) => {
      const v = typeof next === "function" ? (next as (v: boolean) => boolean)(prev) : next;
      onOpenChange?.(v);
      return v;
    });
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [hoveredRuleId, setHoveredRuleId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useOutsideClickDetector(ref, () => setOpen(false));

  const { getStateById } = useProjectState();

  // Lazy-fetch rules for this project on first hover/open. fetchRules has
  // its own dedup + in-flight guard so calling it multiple times is fine.
  useEffect(() => {
    if (!projectId || !workspaceSlug) return;
    transferRuleStore.fetchRules(workspaceSlug, projectId).catch(() => {
      /* silently fail — non-critical UI affordance */
    });
  }, [workspaceSlug, projectId]);

  const allRules = transferRuleStore.rulesByProject[projectId] ?? [];
  const applicable = useMemo(() => {
    const here = issue.state_id ? String(issue.state_id) : "";
    return allRules
      .filter((r) => r.is_active)
      .filter((r) => !r.source_state_ids?.length || r.source_state_ids.includes(here));
  }, [allRules, issue.state_id]);

  if (!projectId || applicable.length === 0) return null;

  const apply = async (e: React.MouseEvent, ruleId: string, targetStateId: string) => {
    // Critical: ControlLink wraps the kanban card in an <a>, so a bare click
    // inside this popover navigates to the issue. stopPropagation + preventDefault
    // both have to fire on the originating event.
    e.stopPropagation();
    e.preventDefault();
    setBusyRuleId(ruleId);
    try {
      const rule = applicable.find((r) => r.id === ruleId);
      await transferRuleStore.applyRule(workspaceSlug, projectId, issue.id, ruleId);
      // Push state + assignee + label changes through the kanban store so
      // the card moves AND its meta (avatar, label chips) reflect the rule
      // immediately — without this, only state_id flips and the UI sits
      // ~10s with stale assignees until the next polling tick refetches.
      // skip_activity=true keeps the timeline single-entry (the apply
      // endpoint already logged it).
      if (updateIssue) {
        const preview = previewIssueAfterRule(issue, rule?.actions);
        const stateChanged = issue.state_id !== targetStateId;
        const assigneesChanged =
          JSON.stringify([...preview.assignee_ids].sort()) !==
          JSON.stringify([...(issue.assignee_ids ?? [])].sort());
        const labelsChanged =
          JSON.stringify([...preview.label_ids].sort()) !==
          JSON.stringify([...(issue.label_ids ?? [])].sort());
        if (stateChanged || assigneesChanged || labelsChanged) {
          await updateIssue(projectId, issue.id, {
            ...(stateChanged ? { state_id: targetStateId } : {}),
            ...(assigneesChanged ? { assignee_ids: preview.assignee_ids } : {}),
            ...(labelsChanged ? { label_ids: preview.label_ids } : {}),
            // typed any-style — Plane backend accepts skip_activity in payload
            // for the same reason migrations use it; not in TIssue type.
            ...({ skip_activity: true } as any),
          });
        }
      }
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Готово", message: "Задача перенесена" });
      setOpen(false);
    } catch (err: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Ошибка",
        message: err?.error ?? err?.detail ?? "Не удалось применить правило",
      });
    } finally {
      setBusyRuleId(null);
    }
  };

  return (
    <div
      ref={ref}
      className="relative"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <button
        type="button"
        title="Передать"
        className="flex h-full w-full cursor-pointer items-center rounded-sm p-1 text-placeholder hover:bg-layer-1 hover:text-primary"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 min-w-[200px] rounded-md border border-subtle bg-layer-2 py-1 shadow-md"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          {applicable.map((r) => {
            const target = getStateById(r.target_state_id);
            const isHovered = hoveredRuleId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                disabled={!!busyRuleId}
                onMouseEnter={() => setHoveredRuleId(r.id)}
                onMouseLeave={() => setHoveredRuleId((h) => (h === r.id ? null : h))}
                style={{
                  // Tailwind tokens here are too low-contrast against the popup
                  // bg-layer-2 backdrop to be visible. Drive the hover shade
                  // explicitly so it always reads — same RGBA pattern Plane
                  // uses for layer-transparent-hover.
                  backgroundColor: isHovered ? "rgba(0, 0, 0, 0.08)" : "transparent",
                  transition: "background-color 120ms ease",
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-primary disabled:opacity-50"
                onClick={(e) => apply(e, r.id, r.target_state_id)}
              >
                <span className="flex h-4 w-4 items-center justify-center" aria-hidden>
                  <RuleLogo rule={r} size={16} />
                </span>
                <span className="flex-1 truncate">{r.name}</span>
                {target?.color ? (
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: target.color }}
                    title={target.name}
                  />
                ) : null}
                {busyRuleId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

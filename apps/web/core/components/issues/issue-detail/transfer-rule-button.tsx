/**
 * Transfer-rule button for the issue-detail widget row («Добавить подэлемент…»).
 *
 * Visually matches `IssueDetailWidgetButton` (Button variant=secondary size=lg,
 * icon + label) so the row stays uniform. Used in both peek and full-screen
 * detail views via `action-buttons.tsx` (one place, shared layout).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { ArrowUpRight, Loader2 } from "lucide-react";
// plane imports
import { useOutsideClickDetector } from "@plane/hooks";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { RuleLogo } from "@/plane-web/components/automations/transfer-rules-root";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
// store
import { previewIssueAfterRule, transferRuleStore } from "@/store/transfer-rule.store";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
};

export const IssueDetailTransferRuleButton = observer(function IssueDetailTransferRuleButton(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const {
    issue: { getIssueById },
    updateIssue,
  } = useIssueDetail();
  const issue = getIssueById(issueId);

  const [open, setOpen] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [hoveredRuleId, setHoveredRuleId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useOutsideClickDetector(ref, () => setOpen(false));

  const { getStateById } = useProjectState();

  useEffect(() => {
    if (!projectId || !workspaceSlug) return;
    transferRuleStore.fetchRules(workspaceSlug, projectId).catch(() => {});
  }, [workspaceSlug, projectId]);

  const allRules = transferRuleStore.rulesByProject[projectId] ?? [];
  const applicable = useMemo(() => {
    const here = issue?.state_id ? String(issue.state_id) : "";
    return allRules
      .filter((r) => r.is_active)
      .filter((r) => !r.source_state_ids?.length || r.source_state_ids.includes(here));
  }, [allRules, issue?.state_id]);

  if (!issue || disabled || applicable.length === 0) return null;

  const apply = async (ruleId: string, targetStateId: string) => {
    setBusyRuleId(ruleId);
    try {
      const rule = applicable.find((r) => r.id === ruleId);
      await transferRuleStore.applyRule(workspaceSlug, projectId, issueId, ruleId);
      // Mirror the rule's assignee/label mutations into the local store on
      // the same PATCH that flips state_id. Without this, only the state
      // changes immediately and assignees/labels lag by ~10s until the
      // next polling tick.
      const preview = previewIssueAfterRule(issue, rule?.actions);
      const stateChanged = issue.state_id !== targetStateId;
      const assigneesChanged =
        JSON.stringify([...preview.assignee_ids].sort()) !==
        JSON.stringify([...(issue.assignee_ids ?? [])].sort());
      const labelsChanged =
        JSON.stringify([...preview.label_ids].sort()) !==
        JSON.stringify([...(issue.label_ids ?? [])].sort());
      if (stateChanged || assigneesChanged || labelsChanged) {
        await updateIssue(workspaceSlug, projectId, issueId, {
          ...(stateChanged ? { state_id: targetStateId } : {}),
          ...(assigneesChanged ? { assignee_ids: preview.assignee_ids } : {}),
          ...(labelsChanged ? { label_ids: preview.label_ids } : {}),
          ...({ skip_activity: true } as any),
        });
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
    <div ref={ref} className="relative">
      <Button variant="secondary" size="lg" disabled={disabled} onClick={() => setOpen((v) => !v)}>
        <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />
        <span className="text-body-xs-medium">Передать</span>
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[220px] rounded-md border border-subtle bg-layer-2 py-1 shadow-md">
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
                  backgroundColor: isHovered ? "rgba(0, 0, 0, 0.08)" : "transparent",
                  transition: "background-color 120ms ease",
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-primary disabled:opacity-50"
                onClick={() => apply(r.id, r.target_state_id)}
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

/**
 * Per-project scheduled automation rules — Celery-beat-driven.
 * Distinct from `TIssueTransferRule` (manual click-triggered).
 */

import type { TLogoProps } from "./common";
import type { TTransferRuleActions } from "./transfer-rule";

export type TAutomationTriggerType =
  /** Issues whose target_date falls within `days`. */
  | "deadline_within"
  /** Every issue currently sitting in the source states — no time condition. */
  | "in_source_state";

export type TAutomationTriggerConfig = {
  /** Used by `deadline_within`: match issues whose target_date is within N days. */
  days?: number;
};

export type TIssueAutomationSchedule = {
  id: string;
  project_id: string;
  workspace_id: string;
  name: string;
  icon: string;
  logo_props: TLogoProps | Record<string, never>;
  sequence: number;
  source_state_ids: string[];
  target_state_id: string;
  trigger_type: TAutomationTriggerType;
  trigger_config: TAutomationTriggerConfig;
  /** Extra gate on top of the trigger: the issue must carry these labels. */
  condition_label_ids: string[];
  /** `any` — at least one of them; `all` — every one. */
  condition_label_match: "any" | "all";
  actions: TTransferRuleActions;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TIssueAutomationSchedulePayload = Partial<
  Omit<TIssueAutomationSchedule, "id" | "project_id" | "workspace_id" | "last_run_at" | "created_at" | "updated_at">
>;

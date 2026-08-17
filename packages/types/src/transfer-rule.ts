/**
 * Per-project automation rules ("issue transfer rules" / «передача задач»).
 *
 * A rule moves an issue to `target_state_id` and applies optional
 * assignee/label mutations. Available from any state by default; restricting
 * `source_state_ids` makes the rule appear only on cards in those states.
 */

import type { TLogoProps } from "./common";

export type TTransferRuleActions = {
  add_assignees?: string[];
  remove_assignees?: "all" | string[];
  add_labels?: string[];
  remove_labels?: "all" | string[];
  /** Module membership — what makes the "put it in module X" action work. */
  add_modules?: string[];
  remove_modules?: "all" | string[];
};

export type TIssueTransferRule = {
  id: string;
  project_id: string;
  workspace_id: string;
  name: string;
  /** Legacy short emoji string. New rules carry `logo_props`. */
  icon: string;
  /** Plane standard emoji+icon picker payload. Empty `{}` for legacy rules. */
  logo_props: TLogoProps | Record<string, never>;
  sequence: number;
  source_state_ids: string[];
  target_state_id: string;
  actions: TTransferRuleActions;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TIssueTransferRulePayload = Partial<
  Omit<TIssueTransferRule, "id" | "project_id" | "workspace_id" | "created_at" | "updated_at">
>;

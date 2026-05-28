# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Periodic Celery task that runs scheduled automations.

Scans all active `IssueAutomationSchedule` rows; for each, finds matching
issues per the trigger and applies the standard transformation (state move
+ assignee/label mutations) via the shared `apply_transformation` helper.

Runs every 30 minutes — frequent enough that "deadline within 3 days"
catches transitions promptly, infrequent enough to avoid query churn on
large projects.
"""

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from plane.app.views.transfer_rule.apply_helper import apply_transformation
from plane.db.models import Issue, IssueAutomationSchedule
from plane.utils.exception_logger import log_exception


def _matching_issues_for_deadline_within(schedule: IssueAutomationSchedule):
    days = (schedule.trigger_config or {}).get("days", 0)
    cutoff = timezone.now().date() + timedelta(days=int(days))

    qs = Issue.issue_objects.filter(
        workspace_id=schedule.workspace_id,
        project_id=schedule.project_id,
        target_date__isnull=False,
        target_date__lte=cutoff,
    )
    if schedule.source_state_ids:
        qs = qs.filter(state_id__in=schedule.source_state_ids)
    # Exclude already-in-target-state — re-applying is a no-op but spams the
    # activity feed once per tick.
    qs = qs.exclude(state_id=schedule.target_state_id)
    return list(qs)


def _run_schedule(schedule: IssueAutomationSchedule):
    if schedule.trigger_type == "deadline_within":
        issues = _matching_issues_for_deadline_within(schedule)
    else:
        return 0

    if not issues:
        return 0

    actor_id = schedule.created_by_id or schedule.project.created_by_id
    if not actor_id:
        return 0

    apply_transformation(
        project_id=schedule.project_id,
        workspace_id=schedule.workspace_id,
        workspace_slug=schedule.workspace.slug,
        issues=issues,
        target_state_id=schedule.target_state_id,
        actions=schedule.actions,
        actor_id=actor_id,
        origin="automation_schedule",
        rule_marker_field="_automation_schedule_id",
        rule_id=schedule.id,
    )
    return len(issues)


@shared_task
def run_automation_schedules():
    """Cron entrypoint — iterate all active schedules across all projects."""
    schedules = IssueAutomationSchedule.objects.filter(is_active=True).select_related(
        "project", "workspace", "target_state"
    )
    for schedule in schedules:
        try:
            n = _run_schedule(schedule)
            schedule.last_run_at = timezone.now()
            schedule.save(update_fields=["last_run_at"])
            if n:
                # log light — full activity already in issue_activity feed
                pass
        except Exception as exc:
            log_exception(exc)

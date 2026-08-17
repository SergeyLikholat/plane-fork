# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Periodic Celery task that runs scheduled automations.

Scans all active `IssueAutomationSchedule` rows; for each, finds matching
issues per the trigger and applies the standard transformation (state move
+ assignee/label mutations) via the shared `apply_transformation` helper.

Runs every 5 minutes. `deadline_within` would be fine on a much slower tick,
but `in_source_state` routes freshly-arrived items out of Входящие — half an
hour of an unsorted inbox defeats the point. The scan is cheap: it is gated
on state ids and skips issues already in the target state.
"""

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from plane.app.views.transfer_rule.apply_helper import apply_transformation
from plane.db.models import Issue, IssueAutomationSchedule
from plane.utils.exception_logger import log_exception


def _base_queryset(schedule: IssueAutomationSchedule):
    qs = Issue.issue_objects.filter(
        workspace_id=schedule.workspace_id,
        project_id=schedule.project_id,
    )
    if schedule.source_state_ids:
        qs = qs.filter(state_id__in=schedule.source_state_ids)
    # Exclude already-in-target-state — re-applying is a no-op but spams the
    # activity feed once per tick.
    return qs.exclude(state_id=schedule.target_state_id)


def _apply_label_condition(qs, schedule: IssueAutomationSchedule):
    """Narrow to issues carrying the configured labels.

    `any` is a plain `in` lookup. `all` cannot be expressed as a single
    many-to-many filter (one join row can't match two labels at once), so it
    chains one `.filter()` per label — each adds its own join.
    """
    label_ids = schedule.condition_label_ids or []
    if not label_ids:
        return qs
    if schedule.condition_label_match == "all":
        for label_id in label_ids:
            qs = qs.filter(labels__id=label_id)
        return qs.distinct()
    return qs.filter(labels__id__in=label_ids).distinct()


def _matching_issues_for_deadline_within(schedule: IssueAutomationSchedule):
    days = (schedule.trigger_config or {}).get("days", 0)
    cutoff = timezone.now().date() + timedelta(days=int(days))

    qs = _base_queryset(schedule).filter(
        target_date__isnull=False,
        target_date__lte=cutoff,
    )
    return list(_apply_label_condition(qs, schedule))


def _matching_issues_for_in_source_state(schedule: IssueAutomationSchedule):
    """Everything currently in the source states — no time condition.

    Guarded on a non-empty `source_state_ids`: without it the rule would
    sweep every issue in the project into the target state on the first tick.
    """
    if not schedule.source_state_ids:
        return []
    return list(_apply_label_condition(_base_queryset(schedule), schedule))


def _run_schedule(schedule: IssueAutomationSchedule):
    if schedule.trigger_type == "deadline_within":
        issues = _matching_issues_for_deadline_within(schedule)
    elif schedule.trigger_type == "in_source_state":
        issues = _matching_issues_for_in_source_state(schedule)
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

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Per-project scheduled automation rules — Celery-beat-driven.

Distinct from `IssueTransferRule` (manual, click-triggered): a schedule
runs on a cron tick, scans `source_state_ids` for issues whose deadline is
within `trigger_config.days`, and applies the same kind of state move +
assignee/label mutations atomically.

Triggers (extensible via `trigger_type`):
- `deadline_within` — issues whose `target_date - now() <= days` (and
  target_date is not null) match.
- `in_source_state` — every issue currently sitting in `source_state_ids`
  matches, with no time condition. Combined with a label condition this is
  the "route what lands in Входящие" rule: e.g. anything carrying a given
  calendar label leaves Входящие for Бэклог and joins the matching module.
"""

from django.contrib.postgres.fields import ArrayField
from django.db import models

from .project import ProjectBaseModel


class IssueAutomationSchedule(ProjectBaseModel):
    """Recurring rule that moves issues based on time-based conditions."""

    name = models.CharField(max_length=120)
    icon = models.CharField(max_length=8, blank=True, default="")
    logo_props = models.JSONField(default=dict, blank=True)
    sequence = models.FloatField(default=65535)

    source_state_ids = ArrayField(
        models.UUIDField(),
        default=list,
        blank=True,
        help_text="If empty, schedule applies to issues in any state.",
    )
    target_state = models.ForeignKey(
        "db.State",
        on_delete=models.CASCADE,
        related_name="automation_schedules_targeting",
    )

    # `deadline_within` | `in_source_state`; future triggers (`stale_for`,
    # `created_within`) share this field.
    trigger_type = models.CharField(max_length=32, default="deadline_within")
    # Shape for `deadline_within`: {"days": 3}. `in_source_state` needs none.
    trigger_config = models.JSONField(default=dict, blank=True)

    # Extra gate applied on top of the trigger: the issue must carry these
    # labels. Empty list = no label condition.
    condition_label_ids = ArrayField(
        models.UUIDField(),
        default=list,
        blank=True,
        help_text="If empty, no label condition is applied.",
    )
    # `any` — issue carries at least one of them; `all` — carries every one.
    condition_label_match = models.CharField(max_length=8, default="any")

    # Same shape as IssueTransferRule.actions — kept identical so the shared
    # `apply_transformation` helper serves both. Also carries
    # `add_modules` / `remove_modules`.
    actions = models.JSONField(default=dict, blank=True)

    is_active = models.BooleanField(default=True)
    last_run_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Issue Automation Schedule"
        verbose_name_plural = "Issue Automation Schedules"
        db_table = "issue_automation_schedules"
        ordering = ("sequence", "created_at")

    def __str__(self) -> str:
        return f"{self.project.identifier} :: {self.name} [{self.trigger_type}] -> {self.target_state.name}"

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Control data of a supervised work item («📍 На контроле»).

The owner supervises someone else's work: he periodically checks progress
and finally accepts the result. The issue's `target_date` is the date of his
next touch; this side table keeps what the plain Issue row cannot: the
deadline the assignee promised, the touch frequency and the streak of
touches without progress. Kept out of `Issue` on purpose so the many issue
list serializers stay untouched.
"""

from django.db import models

from .project import ProjectBaseModel


class IssueControlFrequency(models.TextChoices):
    DAILY = "daily", "Daily"
    TWICE_WEEK = "twice_week", "Twice a week"
    WEEKLY = "weekly", "Weekly"


class IssueControl(ProjectBaseModel):
    issue = models.OneToOneField("db.Issue", on_delete=models.CASCADE, related_name="control")
    promised_date = models.DateField(null=True, blank=True)
    frequency = models.CharField(
        max_length=20,
        choices=IssueControlFrequency.choices,
        default=IssueControlFrequency.TWICE_WEEK,
    )
    no_progress_streak = models.PositiveIntegerField(default=0)
    last_touch_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Issue Control"
        verbose_name_plural = "Issue Controls"
        db_table = "issue_controls"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue_id} <{self.frequency}>"

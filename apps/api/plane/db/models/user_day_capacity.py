# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
How much work (in «Вес» points) a person plans to carry on each day.

A weekly template (`weekday_limits`, index 0 = Monday) plus one-off exceptions
for specific dates (`date_overrides`, {"YYYY-MM-DD": limit}). The week board
and the calendar-week show a day's load against this limit. Limit 0 is a day
off. Rules for reading and changing it live in `plane/utils/day_capacity.py`.
"""

from django.conf import settings
from django.db import models

from plane.utils.day_capacity import default_weekday_limits

from .base import BaseModel


def get_default_weekday_limits():
    return default_weekday_limits()


class UserDayCapacity(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="user_day_capacities")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="day_capacities")
    weekday_limits = models.JSONField(default=get_default_weekday_limits)
    date_overrides = models.JSONField(default=dict)

    class Meta:
        unique_together = ["workspace", "user", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user"],
                condition=models.Q(deleted_at__isnull=True),
                name="user_day_capacity_unique_workspace_user_when_deleted_at_null",
            )
        ]
        verbose_name = "User Day Capacity"
        verbose_name_plural = "User Day Capacities"
        db_table = "user_day_capacities"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.user_id} <{self.workspace_id}>"

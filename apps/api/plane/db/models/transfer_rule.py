# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Per-project automation rules — "transfer" / "передача задач" YouGile-style.

A rule is "from one of these states, move to that state, then apply these
mutations". Triggered manually by the user clicking the rule on a card; not
on schedule. Source state list is empty = applicable from any state.
"""

from django.contrib.postgres.fields import ArrayField
from django.db import models

from .project import ProjectBaseModel


class IssueTransferRule(ProjectBaseModel):
    """User-defined rule that moves an issue between states and applies
    a set of mutations to assignees / labels."""

    name = models.CharField(max_length=120)
    # Legacy short emoji string. New rules use `logo_props` (Plane standard
    # emoji+lucide+material-icon picker payload). `icon` is kept for the two
    # rules created before the picker landed; both are read by the frontend
    # with logo_props taking precedence.
    icon = models.CharField(max_length=8, blank=True, default="")
    logo_props = models.JSONField(default=dict, blank=True)
    sequence = models.FloatField(default=65535)

    source_state_ids = ArrayField(
        models.UUIDField(),
        default=list,
        blank=True,
        help_text="If empty, rule applies from any state.",
    )
    target_state = models.ForeignKey(
        "db.State",
        on_delete=models.CASCADE,
        related_name="transfer_rules_targeting",
    )

    # Action payload — opaque to the model, validated in serializer.
    # Shape: {
    #   "remove_assignees": "all" | [user_id, ...] | null,
    #   "add_assignees":    [user_id, ...] | null,
    #   "remove_labels":    "all" | [label_id, ...] | null,
    #   "add_labels":       [label_id, ...] | null,
    # }
    actions = models.JSONField(default=dict, blank=True)

    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Issue Transfer Rule"
        verbose_name_plural = "Issue Transfer Rules"
        db_table = "issue_transfer_rules"
        ordering = ("sequence", "created_at")

    def __str__(self) -> str:
        return f"{self.project.identifier} :: {self.name} -> {self.target_state.name}"

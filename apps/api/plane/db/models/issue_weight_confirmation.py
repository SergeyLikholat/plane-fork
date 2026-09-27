# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
A human looked at a work item's «Вес» and agreed with it.

Weights are often set automatically (`apply_default_weight`), which leaves no
trace. Changing the estimate by hand records an IssueActivity, but keeping an
automatic weight as is does not — this row is that missing «yes, it's right».
The week board marks weights that are neither confirmed here nor changed by a
person as «не подтверждено».
"""

from django.db import models

from .project import ProjectBaseModel


class IssueWeightConfirmation(ProjectBaseModel):
    issue = models.OneToOneField("db.Issue", on_delete=models.CASCADE, related_name="weight_confirmation")
    confirmed_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Issue Weight Confirmation"
        verbose_name_plural = "Issue Weight Confirmations"
        db_table = "issue_weight_confirmations"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue_id} <{self.confirmed_at}>"

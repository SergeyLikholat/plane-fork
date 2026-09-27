# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.validators import MinValueValidator
from django.db import models, transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel

class EstimateType(models.TextChoices):
    CATEGORIES = "categories", "Categories"
    POINTS = "points", "Points"


class Estimate(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(verbose_name="Estimate Description", blank=True)
    type = models.CharField(max_length=255, choices=EstimateType.choices, default=EstimateType.CATEGORIES)
    last_used = models.BooleanField(default=False)

    def __str__(self):
        """Return name of the estimate"""
        return f"{self.name} <{self.project.name}>"

    class Meta:
        unique_together = ["name", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=Q(deleted_at__isnull=True),
                name="estimate_unique_name_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Estimate"
        verbose_name_plural = "Estimates"
        db_table = "estimates"
        ordering = ("name",)


class EstimatePoint(ProjectBaseModel):
    estimate = models.ForeignKey("db.Estimate", on_delete=models.CASCADE, related_name="points")
    key = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    description = models.TextField(blank=True)
    value = models.CharField(max_length=255)

    def __str__(self):
        """Return name of the estimate"""
        return f"{self.estimate.name} <{self.key}> <{self.value}>"

    class Meta:
        verbose_name = "Estimate Point"
        verbose_name_plural = "Estimate Points"
        db_table = "estimate_points"
        ordering = ("value",)


@receiver(post_save, sender="db.Project")
def create_weight_estimate(sender, instance, created, **kwargs):
    """New projects get the shared «Вес» scale so «Ваша работа» can sum load."""
    if not created:
        return
    from plane.utils.weight_estimate import ensure_weight_estimate

    project_id = instance.pk

    def _ensure():
        from plane.db.models import Project

        project = Project.objects.filter(pk=project_id).first()
        if project:
            ensure_weight_estimate(project)

    transaction.on_commit(_ensure)

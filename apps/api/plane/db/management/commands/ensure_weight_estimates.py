# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.management.base import BaseCommand

# Module imports
from plane.db.models import Project
from plane.utils.weight_estimate import ensure_weight_estimate


class Command(BaseCommand):
    help = "Make the «Вес» (Fibonacci weight) estimate active in every project"

    def handle(self, *args, **options):
        for project in Project.objects.filter(archived_at__isnull=True):
            result = ensure_weight_estimate(project)
            self.stdout.write(f"{project.identifier}: {result}")

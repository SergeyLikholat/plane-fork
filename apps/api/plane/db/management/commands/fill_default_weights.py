# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.management.base import BaseCommand

# Module imports
from plane.db.models import Issue
from plane.utils.weight_estimate import apply_default_weight

OPEN_GROUPS = ["backlog", "unstarted", "started", "supervised"]


class Command(BaseCommand):
    help = "Give open work items without an estimate the default «Вес» by their labels"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        issues = Issue.issue_objects.filter(
            estimate_point__isnull=True, state__group__in=OPEN_GROUPS, archived_at__isnull=True
        ).select_related("project", "state")
        candidates = list(issues)
        changed = 0
        for issue in candidates:
            if options["dry_run"]:
                continue
            # Backfill only: old supervised items keep their phase (no label = check).
            changed += int(apply_default_weight(issue, attach_phase_label=False))
        self.stdout.write(f"candidates: {len(candidates)}, set: {changed}")

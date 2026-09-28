# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.management.base import BaseCommand

# Module imports
from plane.utils.control_labels import sync_phase_label_colors


class Command(BaseCommand):
    help = (
        "Repaint the control phase labels («🗣 Постановка», «👁 Проверка», «✅ Приёмка») "
        "of every project in the canonical colours (matched by normalised name)"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only report how many labels would be repainted",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        counts = sync_phase_label_colors(dry_run=dry_run)
        total = sum(counts.values())
        verb = "would be repainted" if dry_run else "repainted"
        details = ", ".join(f"{color}: {count}" for color, count in sorted(counts.items())) or "nothing to do"
        self.stdout.write(f"Phase labels {verb}: {total} ({details})")

"""
Parse @HH:MM-HH:MM / @HH:MM / ⏰HH:MM patterns out of Issue.name into
start_time / target_time fields and strip the pattern from the name.

Idempotent: skips issues that already have start_time/target_time set,
and issues whose names don't match the pattern.

Usage:
    python manage.py backfill_issue_times             # dry-run, shows diffs
    python manage.py backfill_issue_times --apply     # actually write
    python manage.py backfill_issue_times --apply --limit 50
"""

import re
from datetime import time as dt_time

from django.core.management import BaseCommand
from django.db import transaction

from plane.db.models import Issue

# Mirrors regex in plane-gcal-sync / CalendarWeekLayout.
RANGE_RE = re.compile(
    r"(?<![\d:])(?:[@⏰]\s*)?(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})(?![\d:])"
)
POINT_RE = re.compile(r"(?<![\d:])[@⏰]\s*(\d{1,2}):(\d{2})(?![\d:])")
DEFAULT_DURATION_MIN = 60


def parse(name: str):
    """Returns (start_time, target_time, stripped_name) or None."""
    if not name:
        return None

    m = RANGE_RE.search(name)
    if m:
        sh, sm, eh, em = (int(x) for x in m.groups())
        if not _valid(sh, sm) or not _valid(eh, em):
            return None
        start = dt_time(sh, sm)
        end = dt_time(eh, em)
        if end <= start:
            return None
        stripped = _strip(name)
        return start, end, stripped

    m = POINT_RE.search(name)
    if m:
        sh, sm = int(m.group(1)), int(m.group(2))
        if not _valid(sh, sm):
            return None
        start = dt_time(sh, sm)
        # end = start + 60min, but clamp to 23:59
        end_total = sh * 60 + sm + DEFAULT_DURATION_MIN
        if end_total >= 24 * 60:
            end_total = 23 * 60 + 59
        end = dt_time(end_total // 60, end_total % 60)
        stripped = _strip(name)
        return start, end, stripped

    return None


def _valid(h: int, m: int) -> bool:
    return 0 <= h < 24 and 0 <= m < 60


def _strip(name: str) -> str:
    out = RANGE_RE.sub("", name)
    out = POINT_RE.sub("", out)
    out = re.sub(r"[@⏰]", "", out)
    out = re.sub(r"\s+", " ", out).strip()
    return out or name  # never leave the name empty


class Command(BaseCommand):
    help = "Parse @HH:MM patterns from Issue.name into start_time/target_time"

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Write changes (default is dry-run)")
        parser.add_argument("--limit", type=int, default=0, help="Max issues to process (0 = no limit)")

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        limit = options["limit"]

        qs = Issue.objects.filter(start_time__isnull=True, target_time__isnull=True).exclude(name="")
        if limit:
            qs = qs[:limit]

        total = 0
        matched = 0
        for issue in qs.iterator(chunk_size=200):
            total += 1
            result = parse(issue.name)
            if not result:
                continue
            start, end, stripped = result
            matched += 1
            self.stdout.write(
                f"{issue.id} | {issue.name!r:50s} -> name={stripped!r} "
                f"start={start.strftime('%H:%M')} end={end.strftime('%H:%M')}"
            )
            if apply_changes:
                with transaction.atomic():
                    issue.start_time = start
                    issue.target_time = end
                    issue.name = stripped
                    issue.save(update_fields=["start_time", "target_time", "name", "updated_at"])

        verb = "updated" if apply_changes else "would update"
        self.stdout.write(self.style.SUCCESS(f"Scanned {total} issues, {verb} {matched}"))

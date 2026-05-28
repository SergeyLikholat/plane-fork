"""Fork-only helper: auto-attach the workspace's default `cal:*` label
to a newly-created Issue when no explicit `cal:*` label was provided.

Why this exists
---------------
The sibling service `plane-gcal-sync` routes Plane issues to a specific
Google Calendar based on which `cal:*` label is attached. Without any
such label, the push falls back to the user's primary GCal (typically
"Встречи"). The user wants "Текучка" to be the global default — so we
attach `cal:Текучка` proactively here at issue-create time.

The desired label name is read from `DEFAULT_CAL_LABEL_NAME` env (full
prefix included), defaulting to `cal:Текучка`. If the project does not
have such a label yet (e.g. fresh project), this is a silent no-op —
the next reconcile pass in plane-gcal-sync will create the label, and
subsequent issues will pick it up.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

from django.db import IntegrityError

if TYPE_CHECKING:
    from plane.db.models import Issue

DEFAULT_CAL_LABEL_NAME = "cal:Текучка"


def attach_default_cal_label_if_missing(issue: "Issue") -> None:
    """Attach the project's default `cal:*` label to `issue` iff the
    issue has no `cal:*` label yet. Best-effort: any DB hiccup is
    swallowed so a missing label never breaks issue creation."""
    from plane.db.models import IssueLabel, Label  # avoid circular at import time

    desired = os.environ.get("DEFAULT_CAL_LABEL_NAME", DEFAULT_CAL_LABEL_NAME)

    # If any cal:* label is already attached (incl. one the user picked
    # explicitly), don't override it.
    if IssueLabel.objects.filter(
        issue=issue,
        label__name__startswith="cal:",
    ).exists():
        return

    label = Label.objects.filter(
        project_id=issue.project_id,
        name=desired,
    ).first()
    if label is None:
        return

    try:
        IssueLabel.objects.create(
            label=label,
            issue=issue,
            project_id=issue.project_id,
            workspace_id=issue.workspace_id,
            created_by_id=issue.created_by_id,
            updated_by_id=issue.updated_by_id,
        )
    except IntegrityError:
        # Race between two parallel creates — fine, the other side won.
        pass

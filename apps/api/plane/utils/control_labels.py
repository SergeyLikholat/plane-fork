# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Project labels behind the control marks («🗣 Постановка», «👁 Проверка»,
«✅ Приёмка», «🔥 риск»). Matched by normalised name, so a hand-made
«Приемка» or «проверка» is reused instead of duplicated.
"""

from plane.utils.control_touch import MARK_LABELS, PHASE_MARKS, normalize_label_name


def resolve_mark_label(project_id, workspace_id, mark):
    """Id of the project label for a mark key; created when missing."""
    from plane.db.models import Label

    spec = MARK_LABELS[mark]
    for label in Label.objects.filter(project_id=project_id).only("id", "name"):
        if normalize_label_name(label.name) == spec["match"]:
            return label.id
    label = Label.objects.create(
        name=spec["name"],
        color=spec["color"],
        project_id=project_id,
        workspace_id=workspace_id,
    )
    return label.id


def ensure_phase_labels(project) -> int:
    """Make sure the three phase labels exist in `project`. Returns how many were created."""
    from plane.db.models import Label

    before = Label.objects.filter(project_id=project.id).count()
    for mark in PHASE_MARKS:
        resolve_mark_label(project.id, project.workspace_id, mark)
    return Label.objects.filter(project_id=project.id).count() - before


def plan_phase_label_colors(labels) -> dict:
    """
    Which phase labels need a new colour. `labels` — iterable of objects with
    `id`, `name`, `color`. Returns `{label_id: new_color}`; labels already in
    the canonical colour (case-insensitive) and non-phase labels are skipped.
    """
    colors_by_match = {MARK_LABELS[mark]["match"]: MARK_LABELS[mark]["color"] for mark in PHASE_MARKS}
    changes = {}
    for label in labels:
        color = colors_by_match.get(normalize_label_name(label.name))
        if color and (label.color or "").lower() != color.lower():
            changes[label.id] = color
    return changes


def sync_phase_label_colors(dry_run: bool = False) -> dict:
    """
    Repaint the phase labels of every project in the canonical colours.
    Returns `{color: count}` of labels that were (or, with `dry_run`, would be) updated.
    """
    from django.utils import timezone

    from plane.db.models import Label

    labels = Label.objects.filter(project_id__isnull=False).only("id", "name", "color")
    changes = plan_phase_label_colors(labels)
    ids_by_color: dict = {}
    for label_id, color in changes.items():
        ids_by_color.setdefault(color, []).append(label_id)
    if not dry_run:
        now = timezone.now()
        for color, ids in ids_by_color.items():
            Label.objects.filter(id__in=ids).update(color=color, updated_at=now)
    return {color: len(ids) for color, ids in ids_by_color.items()}

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

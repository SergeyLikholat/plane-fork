# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Every project gets the same «Вес» estimate: Fibonacci weights with Russian
names. «Ваша работа» sums weights across all projects, so the scale must be
identical everywhere. Called for existing projects by the
`ensure_weight_estimates` command and for new ones by a post_save signal.
"""

# Python imports
import logging

# Django imports
from django.db import transaction
from django.utils import timezone

WEIGHT_ESTIMATE_NAME = "Вес"
WEIGHT_VALUES = [
    "1 · пустяк",
    "2 · мелочь",
    "3 · средняя",
    "5 · большая",
    "8 · тяжёлая",
    "13 · разбить",
]

logger = logging.getLogger("plane.api")


def _points_in_use(estimate) -> bool:
    from plane.db.models import Issue

    return Issue.all_objects.filter(estimate_point__estimate=estimate).exists()


@transaction.atomic
def ensure_weight_estimate(project) -> str:
    """Make «Вес» the active estimate of `project`. Returns what was done.

    A foreign estimate nobody uses is converted in place (upstream allows
    only one estimate per project in the UI). One that issues already
    reference is left alone: silently rewriting someone's scale loses data.
    """
    from plane.db.models import Estimate, EstimatePoint, Issue

    estimates = list(Estimate.objects.filter(project=project))
    estimate = next((e for e in estimates if e.name == WEIGHT_ESTIMATE_NAME), None)
    action = "ok"
    if estimate is None:
        foreign = [e for e in estimates if not _points_in_use(e)]
        if estimates and len(foreign) < len(estimates):
            logger.warning("weight estimate: project %s has a used estimate, skipped", project.id)
            return "skipped: estimate in use"
        if foreign:
            estimate = foreign[0]
            estimate.name = WEIGHT_ESTIMATE_NAME
            action = "converted"
            for extra in foreign[1:]:
                extra.delete()
        else:
            estimate = Estimate(project=project, workspace_id=project.workspace_id, name=WEIGHT_ESTIMATE_NAME)
            action = "created"

    estimate.type = "categories"
    estimate.last_used = True
    estimate.save()

    now = timezone.now()
    existing = {p.value: p for p in EstimatePoint.objects.filter(estimate=estimate)}
    for key, value in enumerate(WEIGHT_VALUES):
        point = existing.pop(value, None)
        if point is None:
            EstimatePoint.objects.create(
                estimate=estimate,
                project=project,
                workspace_id=project.workspace_id,
                key=key,
                value=value,
            )
            if action == "ok":
                action = "points added"
        elif point.key != key:
            point.key = key
            point.save(update_fields=["key", "updated_at"])
    # Points outside the scale (e.g. plain "1", "2" of an old Points estimate).
    for point in existing.values():
        if not Issue.all_objects.filter(estimate_point=point).exists():
            point.deleted_at = now
            point.save(update_fields=["deleted_at", "updated_at"])

    Estimate.objects.filter(project=project).exclude(pk=estimate.pk).update(last_used=False)
    if project.estimate_id != estimate.id:
        project.estimate = estimate
        project.save(update_fields=["estimate", "updated_at"])
    transaction.on_commit(lambda: _invalidate_workspace_estimates(project.workspace.slug))
    return action


def _invalidate_workspace_estimates(slug: str) -> None:
    """Drop the cached workspace estimates list, including legacy per-user keys."""
    from django.core.cache import cache

    key = f"/api/workspaces/{slug}/estimates/"
    cache.delete(key)
    try:
        cache.delete_many(keys=cache.keys(f"{key}*"))
    except (AttributeError, NotImplementedError):
        pass


# --------------------------------------------------------------------------
# Default weight of a work item (mirrors week-board/weights.ts)
# --------------------------------------------------------------------------

CHECK_WEIGHT = 1
ACCEPTANCE_WEIGHT = 3
FALLBACK_WEIGHT = 1
CAL_LABEL_WEIGHTS = {
    "cal:работа над проектом": 5,
    "cal:встречи": 2,
    "cal:встречи/звонки": 2,
    "cal:текучка": 2,
    "cal:планирование/подведение итогов": 2,
    "cal:платежный календарь": 0,
    "cal:личное/непродуктивное время": 0,
}


def normalize_label_name(name: str) -> str:
    """Lowercase, ё→е, drop emoji/punctuation, tighten spaces around «/»."""
    import re

    text = (name or "").lower().replace("ё", "е")
    text = re.sub(r"[^\w:/ ]", "", text)
    text = re.sub(r"\s*/\s*", "/", text)
    return re.sub(r"\s+", " ", text).strip()


def default_weight(label_names, state_group=None):
    """Weight a new work item gets when nobody set it; 0 means «no estimate»."""
    names = {normalize_label_name(n) for n in label_names}
    if "приемка" in names:
        return ACCEPTANCE_WEIGHT
    if "проверка" in names or state_group == "supervised":
        return CHECK_WEIGHT
    for name in names:
        if name in CAL_LABEL_WEIGHTS:
            return CAL_LABEL_WEIGHTS[name]
    return FALLBACK_WEIGHT


def apply_default_weight(issue) -> bool:
    """Set the «Вес» point by labels if the work item has no estimate yet."""
    from plane.db.models import EstimatePoint, Issue, Label

    if issue.estimate_point_id:
        return False
    estimate_id = issue.project.estimate_id if issue.project_id else None
    if not estimate_id:
        return False
    label_names = Label.objects.filter(
        label_issue__issue_id=issue.id, label_issue__deleted_at__isnull=True
    ).values_list("name", flat=True)
    state_group = issue.state.group if issue.state_id else None
    weight = default_weight(list(label_names), state_group)
    if weight <= 0:
        return False
    point = next(
        (
            p
            for p in EstimatePoint.objects.filter(estimate_id=estimate_id)
            if normalize_label_name(p.value).split(" ")[0] == str(weight)
        ),
        None,
    )
    if point is None:
        return False
    Issue.all_objects.filter(pk=issue.pk, estimate_point__isnull=True).update(estimate_point=point)
    issue.estimate_point = point
    return True

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Shared helper that applies the "move issue + apply mutations" transformation.

Consumed by:
- `IssueTransferRuleViewSet.apply` — manual click trigger
- `bgtasks.automation_schedule_task` — Celery beat scheduled trigger

Both produce the same activity-feed entry. The only difference is who fires it.
"""

import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.webhook_task import model_activity
from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueLabel,
    Label,
    ProjectMember,
)


def _normalize_id_list(value):
    if not value or value == "all":
        return value
    if not isinstance(value, list):
        return []
    seen = []
    for item in value:
        s = str(item).strip()
        if s and s not in seen:
            seen.append(s)
    return seen


def apply_transformation(
    *,
    project_id,
    workspace_id,
    workspace_slug,
    issues,
    target_state_id,
    actions,
    actor_id,
    origin,
    rule_marker_field="_transfer_rule_id",
    rule_id=None,
):
    """Apply state move + label/assignee mutations to each issue atomically.

    `issues` is a pre-filtered queryset/list — caller is responsible for
    source-state gating. Activity entries are emitted per issue with a
    sentinel marker so listeners (sync, webhooks) can disambiguate.
    """
    actions = actions or {}
    add_assignees = _normalize_id_list(actions.get("add_assignees")) or []
    remove_assignees = _normalize_id_list(actions.get("remove_assignees")) or []
    add_labels = _normalize_id_list(actions.get("add_labels")) or []
    remove_labels = _normalize_id_list(actions.get("remove_labels")) or []

    valid_add_label_ids = set(
        str(x)
        for x in Label.objects.filter(project_id=project_id, id__in=add_labels).values_list(
            "id", flat=True
        )
    )
    valid_member_ids = set(
        str(x)
        for x in ProjectMember.objects.filter(
            project_id=project_id, is_active=True, member_id__in=add_assignees
        ).values_list("member_id", flat=True)
    )

    # Lazy import to avoid circular deps when this module loads early.
    from plane.app.serializers.issue import IssueDetailSerializer

    applied = []
    with transaction.atomic():
        for issue in issues:
            current_instance = json.dumps(IssueDetailSerializer(issue).data, cls=DjangoJSONEncoder)

            if str(issue.state_id) != str(target_state_id):
                issue.state_id = target_state_id
                issue.save(update_fields=["state_id", "updated_at"])

            if remove_assignees == "all":
                IssueAssignee.objects.filter(issue=issue).delete()
            elif isinstance(remove_assignees, list) and remove_assignees:
                IssueAssignee.objects.filter(
                    issue=issue, assignee_id__in=remove_assignees
                ).delete()
            for member_id in valid_member_ids:
                IssueAssignee.objects.get_or_create(
                    issue=issue,
                    assignee_id=member_id,
                    defaults={"project_id": project_id, "workspace_id": workspace_id},
                )

            if remove_labels == "all":
                IssueLabel.objects.filter(issue=issue).delete()
            elif isinstance(remove_labels, list) and remove_labels:
                IssueLabel.objects.filter(issue=issue, label_id__in=remove_labels).delete()
            for label_id in valid_add_label_ids:
                IssueLabel.objects.get_or_create(
                    issue=issue,
                    label_id=label_id,
                    defaults={"project_id": project_id, "workspace_id": workspace_id},
                )

            applied.append(str(issue.id))

            requested_data = json.dumps(
                {"state_id": str(target_state_id), rule_marker_field: str(rule_id) if rule_id else None},
                cls=DjangoJSONEncoder,
            )
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=requested_data,
                actor_id=str(actor_id),
                issue_id=str(issue.id),
                project_id=str(project_id),
                current_instance=current_instance,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=origin,
            )
            model_activity.delay(
                model_name="issue",
                model_id=str(issue.id),
                requested_data={"state_id": str(target_state_id)},
                current_instance=current_instance,
                actor_id=actor_id,
                slug=workspace_slug,
                origin=origin,
            )

    return applied

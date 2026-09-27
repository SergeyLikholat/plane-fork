# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Which work items have a weight a person stands behind. The week board marks
the rest «не подтверждено»: their weight came from `apply_default_weight`
and nobody has looked at it yet.

A weight counts as confirmed when there is an IssueWeightConfirmation row
(the owner kept the weight as is) or a person changed the estimate — that
leaves an IssueActivity with field «estimate_<type>».
"""

# Python imports
import uuid

# Django imports
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Issue, IssueActivity, IssueWeightConfirmation

MAX_IDS = 500
HUMAN_ESTIMATE_VERBS = ("updated", "removed")


def _parse_uuids(values):
    """UUID strings → list of UUIDs (order kept, duplicates dropped), or None if any is invalid."""
    parsed = []
    for value in values:
        if not isinstance(value, str):
            return None
        try:
            item = uuid.UUID(value)
        except ValueError:
            return None
        if item not in parsed:
            parsed.append(item)
    return parsed


def _member_issues(slug, user, issue_ids):
    """Work items among `issue_ids` in projects where `user` is an active member."""
    return Issue.issue_objects.filter(
        workspace__slug=slug,
        pk__in=issue_ids,
        project__project_projectmember__member=user,
        project__project_projectmember__is_active=True,
        project__project_projectmember__deleted_at__isnull=True,
    ).distinct()


def _confirmed_ids(slug, user, issue_ids):
    human_estimate_change = IssueActivity.objects.filter(
        issue_id=OuterRef("pk"),
        field__startswith="estimate_",
        verb__in=HUMAN_ESTIMATE_VERBS,
        actor__isnull=False,
    )
    confirmation_row = IssueWeightConfirmation.objects.filter(issue_id=OuterRef("pk"))
    rows = (
        _member_issues(slug, user, issue_ids)
        .filter(Q(Exists(confirmation_row)) | Q(Exists(human_estimate_change)))
        .values_list("id", flat=True)
    )
    return [str(pk) for pk in rows]


class IssueWeightConfirmationEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        raw = [i for i in request.GET.get("issue_ids", "").split(",") if i][:MAX_IDS]
        # A malformed id cannot match anything; dropping it keeps the query valid.
        issue_ids = [parsed[0] for parsed in (_parse_uuids([i]) for i in raw) if parsed]
        if not issue_ids:
            return Response({"confirmed": []}, status=status.HTTP_200_OK)
        return Response({"confirmed": _confirmed_ids(slug, request.user, issue_ids)}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        raw = request.data.get("issue_ids") if isinstance(request.data, dict) else None
        if not isinstance(raw, list) or not raw:
            return Response(
                {"error": "Передайте issue_ids — непустой список идентификаторов задач."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(raw) > MAX_IDS:
            return Response(
                {"error": f"Не больше {MAX_IDS} задач за один запрос."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        issue_ids = _parse_uuids(raw)
        if issue_ids is None:
            return Response(
                {"error": "Каждый элемент issue_ids должен быть идентификатором задачи (UUID)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issues = list(_member_issues(slug, request.user, issue_ids).values_list("id", "project_id", "workspace_id"))
        self._confirm(request.user, issues)
        return Response({"confirmed": _confirmed_ids(slug, request.user, issue_ids)}, status=status.HTTP_200_OK)

    @staticmethod
    def _confirm(user, issues):
        """Create missing rows, touch (and restore soft-deleted) existing ones."""
        if not issues:
            return
        now = timezone.now()
        ids = [pk for pk, _, _ in issues]
        existing = IssueWeightConfirmation.all_objects.filter(issue_id__in=ids)
        existing_ids = set(existing.values_list("issue_id", flat=True))
        existing.update(confirmed_at=now, deleted_at=None, updated_by=user, updated_at=now)
        IssueWeightConfirmation.objects.bulk_create(
            [
                IssueWeightConfirmation(
                    issue_id=pk,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    created_by=user,
                    updated_by=user,
                )
                for pk, project_id, workspace_id in issues
                if pk not in existing_ids
            ],
            # A parallel request may have created the same row a moment ago.
            ignore_conflicts=True,
        )

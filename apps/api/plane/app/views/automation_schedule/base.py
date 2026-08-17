# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
CRUD for project-scoped scheduled automations. Distinct from manual
`IssueTransferRule` — these are run by Celery beat, not user clicks.
"""

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueAutomationScheduleSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import IssueAutomationSchedule


class IssueAutomationScheduleViewSet(BaseViewSet):
    serializer_class = IssueAutomationScheduleSerializer
    model = IssueAutomationSchedule

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("project", "workspace", "target_state")
            .distinct()
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["project_id"] = self.kwargs.get("project_id")
        return ctx

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        items = self.get_queryset().order_by("sequence", "created_at")
        return Response(
            IssueAutomationScheduleSerializer(items, many=True, context={"project_id": project_id}).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        serializer = IssueAutomationScheduleSerializer(
            data=request.data, context={"project_id": project_id}
        )
        if serializer.is_valid():
            serializer.save(project_id=project_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        item = IssueAutomationSchedule.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=pk
        ).first()
        if not item:
            return Response({"error": "Schedule not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueAutomationScheduleSerializer(
            item, data=request.data, partial=True, context={"project_id": project_id}
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        # Plane's SoftDeletionQuerySet.delete() soft-deletes via `update()` and
        # therefore returns a plain int — NOT Django's `(count, per_model_dict)`
        # tuple. Unpacking it raises "cannot unpack non-iterable int object".
        deleted = IssueAutomationSchedule.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=pk
        ).delete()
        if isinstance(deleted, tuple):
            deleted = deleted[0]
        if not deleted:
            return Response({"error": "Schedule not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN])
    def reorder(self, request, slug, project_id):
        rule_ids = request.data.get("rule_ids") or []
        if not isinstance(rule_ids, list) or not rule_ids:
            return Response({"error": "rule_ids list is required"}, status=status.HTTP_400_BAD_REQUEST)
        items = {
            str(r.id): r
            for r in IssueAutomationSchedule.objects.filter(
                workspace__slug=slug, project_id=project_id, pk__in=rule_ids
            )
        }
        with transaction.atomic():
            for index, rid in enumerate(rule_ids):
                item = items.get(str(rid))
                if item is None:
                    continue
                item.sequence = (index + 1) * 1000
                item.save(update_fields=["sequence", "updated_at"])
        return Response({"reordered": list(items.keys())}, status=status.HTTP_200_OK)

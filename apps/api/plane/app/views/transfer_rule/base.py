# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Per-project automation: "issue transfer rules" / «передача задач».

Rules are project-scoped. Apply is a single endpoint that runs all mutations
in a transaction, then dispatches the same activity-tracking and webhook
tasks the issue PATCH does — so timeline / notifications stay consistent.
"""

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueTransferRuleSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import Issue, IssueTransferRule
from plane.utils.host import base_host

from .apply_helper import apply_transformation


class IssueTransferRuleViewSet(BaseViewSet):
    serializer_class = IssueTransferRuleSerializer
    model = IssueTransferRule

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
        rules = self.get_queryset().order_by("sequence", "created_at")
        return Response(
            IssueTransferRuleSerializer(rules, many=True, context={"project_id": project_id}).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        serializer = IssueTransferRuleSerializer(data=request.data, context={"project_id": project_id})
        if serializer.is_valid():
            serializer.save(project_id=project_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        rule = IssueTransferRule.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=pk
        ).first()
        if not rule:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueTransferRuleSerializer(
            rule, data=request.data, partial=True, context={"project_id": project_id}
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
        deleted = IssueTransferRule.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=pk
        ).delete()
        if isinstance(deleted, tuple):
            deleted = deleted[0]
        if not deleted:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN])
    def reorder(self, request, slug, project_id):
        """Bulk reorder. Body: {"rule_ids": [<id-in-desired-order>, ...]}.

        Sequences are rewritten to (index+1) * 1000 — leaves room for future
        single-rule sequence edits without forcing a full rewrite each time.
        """
        rule_ids = request.data.get("rule_ids") or []
        if not isinstance(rule_ids, list) or not rule_ids:
            return Response({"error": "rule_ids list is required"}, status=status.HTTP_400_BAD_REQUEST)
        rules = {
            str(r.id): r
            for r in IssueTransferRule.objects.filter(
                workspace__slug=slug, project_id=project_id, pk__in=rule_ids
            )
        }
        with transaction.atomic():
            for index, rid in enumerate(rule_ids):
                rule = rules.get(str(rid))
                if rule is None:
                    continue
                rule.sequence = (index + 1) * 1000
                rule.save(update_fields=["sequence", "updated_at"])
        return Response({"reordered": list(rules.keys())}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def apply(self, request, slug, project_id, pk, issue_id=None):
        """Apply the rule to one or many issues. Body: {"issue_ids": [...]}.

        Two routes hit this: /transfer-rules/<pk>/apply/ (bulk via body) and
        /issues/<issue_id>/apply-rule/<pk>/ (single, id from path).
        """
        rule = IssueTransferRule.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=pk, is_active=True
        ).first()
        if not rule:
            return Response({"error": "Rule not found or inactive"}, status=status.HTTP_404_NOT_FOUND)

        issue_ids = request.data.get("issue_ids") or []
        single_id = issue_id or request.data.get("issue_id")
        if single_id:
            issue_ids = [single_id]
        if not issue_ids:
            return Response({"error": "issue_ids is required"}, status=status.HTTP_400_BAD_REQUEST)

        issues = list(
            Issue.issue_objects.filter(
                workspace__slug=slug, project_id=project_id, pk__in=issue_ids
            )
        )
        if not issues:
            return Response({"error": "No matching issues"}, status=status.HTTP_404_NOT_FOUND)

        # Source-state gate.
        if rule.source_state_ids:
            allowed = {str(s) for s in rule.source_state_ids}
            issues = [i for i in issues if str(i.state_id) in allowed]
        if not issues:
            return Response(
                {"error": "No issues are in a state allowed by this rule"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        applied = apply_transformation(
            project_id=project_id,
            workspace_id=issues[0].workspace_id,
            workspace_slug=slug,
            issues=issues,
            target_state_id=rule.target_state_id,
            actions=rule.actions,
            actor_id=request.user.id,
            origin=base_host(request=request, is_app=True),
            rule_marker_field="_transfer_rule_id",
            rule_id=rule.id,
        )

        return Response(
            {"applied": applied, "rule_id": str(rule.id), "target_state_id": str(rule.target_state_id)},
            status=status.HTTP_200_OK,
        )

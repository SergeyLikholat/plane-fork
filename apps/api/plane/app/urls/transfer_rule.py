# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import IssueTransferRuleViewSet


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/transfer-rules/",
        IssueTransferRuleViewSet.as_view({"get": "list", "post": "create"}),
        name="project-transfer-rules",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/transfer-rules/reorder/",
        IssueTransferRuleViewSet.as_view({"post": "reorder"}),
        name="project-transfer-rules-reorder",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/transfer-rules/<uuid:pk>/",
        IssueTransferRuleViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="project-transfer-rule",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/transfer-rules/<uuid:pk>/apply/",
        IssueTransferRuleViewSet.as_view({"post": "apply"}),
        name="project-transfer-rule-apply",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/apply-rule/<uuid:pk>/",
        IssueTransferRuleViewSet.as_view({"post": "apply"}),
        name="issue-apply-transfer-rule",
    ),
]

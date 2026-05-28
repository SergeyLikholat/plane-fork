# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import IssueAutomationScheduleViewSet


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/automation-schedules/",
        IssueAutomationScheduleViewSet.as_view({"get": "list", "post": "create"}),
        name="project-automation-schedules",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/automation-schedules/reorder/",
        IssueAutomationScheduleViewSet.as_view({"post": "reorder"}),
        name="project-automation-schedules-reorder",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/automation-schedules/<uuid:pk>/",
        IssueAutomationScheduleViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="project-automation-schedule",
    ),
]

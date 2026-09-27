# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
How many times each work item's due date was pushed later. The week board
marks items postponed more than twice: they are either too big or not needed now.
"""

# Django imports
from django.db.models import Count, F

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import IssueActivity

MAX_IDS = 500


class IssueRescheduleCountEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        raw = request.GET.get("issue_ids", "")
        issue_ids = [i for i in raw.split(",") if i][:MAX_IDS]
        if not issue_ids:
            return Response({}, status=status.HTTP_200_OK)
        # ISO dates compare correctly as strings; an empty old value is the first
        # assignment of a date, not a postponement.
        rows = (
            IssueActivity.objects.filter(
                workspace__slug=slug,
                issue_id__in=issue_ids,
                field="target_date",
                verb="updated",
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            )
            .exclude(old_value__isnull=True)
            .exclude(old_value="")
            .exclude(new_value__isnull=True)
            .exclude(new_value="")
            .filter(new_value__gt=F("old_value"))
            .values("issue_id")
            .annotate(count=Count("id", distinct=True))
        )
        return Response({str(r["issue_id"]): r["count"] for r in rows}, status=status.HTTP_200_OK)

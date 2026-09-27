# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkspaceEntityPermission
from plane.app.serializers import WorkspaceEstimateSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import Estimate, Project
from plane.utils.cache import cache_response


class WorkspaceEstimatesEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    # Shared per workspace (not per user): the estimate views invalidate this
    # key with user=False, so a per-user key was never cleared and the list
    # stayed stale for up to two hours after any estimate change.
    @cache_response(60 * 60 * 2, user=False)
    def get(self, request, slug):
        estimate_ids = Project.objects.filter(workspace__slug=slug, estimate__isnull=False).values_list(
            "estimate_id", flat=True
        )
        estimates = (
            Estimate.objects.filter(pk__in=estimate_ids, workspace__slug=slug)
            .prefetch_related("points")
            .select_related("workspace", "project")
        )

        serializer = WorkspaceEstimateSerializer(estimates, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

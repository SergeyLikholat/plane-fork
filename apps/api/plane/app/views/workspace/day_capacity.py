# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
The requesting user's daily load limit in a workspace (week board, calendar-week).

GET never creates a row: without one it answers with the defaults.
PATCH creates the row on first write. Rules — `plane/utils/day_capacity.py`.
"""

# Django imports
from django.db import IntegrityError, transaction
from django.utils import timezone

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import UserDayCapacity, Workspace
from plane.utils.day_capacity import (
    DayCapacityError,
    apply_patch,
    default_weekday_limits,
    normalize_weekday_limits,
    parse_patch,
    prune_overrides,
)


def _payload(weekday_limits, date_overrides):
    return {"weekday_limits": weekday_limits, "date_overrides": date_overrides}


class UserDayCapacityEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        row = UserDayCapacity.objects.filter(workspace__slug=slug, user=request.user).first()
        if row is None:
            return Response(_payload(default_weekday_limits(), {}), status=status.HTTP_200_OK)
        today = timezone.now().date()
        return Response(
            _payload(normalize_weekday_limits(row.weekday_limits), prune_overrides(row.date_overrides, today)),
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug):
        try:
            patch = parse_patch(request.data)
        except DayCapacityError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.get(slug=slug)
        try:
            row = self._write(workspace, request.user, patch)
        except IntegrityError:
            # A parallel first write created the row; retry against it.
            row = self._write(workspace, request.user, patch)
        return Response(_payload(row.weekday_limits, row.date_overrides), status=status.HTTP_200_OK)

    @staticmethod
    def _write(workspace, user, patch):
        with transaction.atomic():
            row = UserDayCapacity.objects.select_for_update().filter(workspace=workspace, user=user).first()
            if row is None:
                row = UserDayCapacity(workspace=workspace, user=user)
            weekday_limits, date_overrides = apply_patch(
                row.weekday_limits, row.date_overrides, patch, timezone.now().date()
            )
            row.weekday_limits = weekday_limits
            row.date_overrides = date_overrides
            row.save()
            return row

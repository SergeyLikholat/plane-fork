# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import date

import pytest
from freezegun import freeze_time
from rest_framework import status

from plane.db.models import User, UserDayCapacity, Workspace, WorkspaceMember

URL = "/api/workspaces/{slug}/day-capacity/"
DEFAULTS = {"weekday_limits": [13] * 7, "date_overrides": {}}


def _get(client, workspace):
    return client.get(URL.format(slug=workspace.slug))


def _patch(client, workspace, payload):
    return client.patch(URL.format(slug=workspace.slug), payload, format="json")


@pytest.mark.contract
@pytest.mark.django_db
class TestUserDayCapacityGet:
    def test_defaults_without_creating_a_row(self, session_client, workspace):
        response = _get(session_client, workspace)
        assert response.status_code == status.HTTP_200_OK
        assert response.data == DEFAULTS
        assert not UserDayCapacity.objects.exists()

    def test_returns_saved_values(self, session_client, workspace, create_user):
        UserDayCapacity.objects.create(
            workspace=workspace,
            user=create_user,
            weekday_limits=[8, 13, 13, 13, 13, 0, 0],
            date_overrides={"2099-01-01": 5},
        )
        response = _get(session_client, workspace)
        assert response.data == {"weekday_limits": [8, 13, 13, 13, 13, 0, 0], "date_overrides": {"2099-01-01": 5}}

    def test_other_users_row_is_not_visible(self, session_client, workspace):
        other = User.objects.create(email="other@plane.so", username="other", first_name="O", last_name="O")
        WorkspaceMember.objects.create(workspace=workspace, member=other, role=15)
        UserDayCapacity.objects.create(workspace=workspace, user=other, weekday_limits=[1] * 7)
        assert _get(session_client, workspace).data == DEFAULTS

    def test_non_member_is_forbidden(self, session_client, create_user):
        owner = User.objects.create(email="owner@plane.so", username="owner", first_name="O", last_name="O")
        foreign = Workspace.objects.create(name="Чужое", owner=owner, slug="foreign")
        WorkspaceMember.objects.create(workspace=foreign, member=owner, role=20)
        assert _get(session_client, foreign).status_code == status.HTTP_403_FORBIDDEN
        assert _patch(session_client, foreign, {"weekday_limits": [1] * 7}).status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
@pytest.mark.django_db
class TestUserDayCapacityPatch:
    def test_weekday_template_creates_row(self, session_client, workspace, create_user):
        response = _patch(session_client, workspace, {"weekday_limits": [10, 13, 13, 13, 8, 0, 0]})
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"weekday_limits": [10, 13, 13, 13, 8, 0, 0], "date_overrides": {}}
        row = UserDayCapacity.objects.get(workspace=workspace, user=create_user)
        assert row.weekday_limits == [10, 13, 13, 13, 8, 0, 0]

    @freeze_time("2026-09-28")
    def test_set_and_clear_override(self, session_client, workspace):
        response = _patch(session_client, workspace, {"set_override": {"date": "2026-09-29", "limit": 0}})
        assert response.data == {"weekday_limits": [13] * 7, "date_overrides": {"2026-09-29": 0}}
        response = _patch(session_client, workspace, {"set_override": {"date": "2026-10-01", "limit": 5}})
        assert response.data["date_overrides"] == {"2026-09-29": 0, "2026-10-01": 5}
        response = _patch(session_client, workspace, {"clear_override": "2026-09-29"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["date_overrides"] == {"2026-10-01": 5}

    @freeze_time("2026-09-28")
    def test_prunes_old_overrides_on_write(self, session_client, workspace, create_user):
        UserDayCapacity.objects.create(
            workspace=workspace,
            user=create_user,
            date_overrides={"2026-07-01": 3, "2026-08-15": 4},
        )
        response = _patch(session_client, workspace, {"set_override": {"date": "2026-09-30", "limit": 8}})
        assert response.data["date_overrides"] == {"2026-08-15": 4, "2026-09-30": 8}
        stored = UserDayCapacity.objects.get(workspace=workspace, user=create_user).date_overrides
        assert "2026-07-01" not in stored

    def test_template_change_keeps_overrides(self, session_client, workspace):
        _patch(session_client, workspace, {"set_override": {"date": date.today().isoformat(), "limit": 2}})
        response = _patch(session_client, workspace, {"weekday_limits": [5] * 7})
        assert response.data == {"weekday_limits": [5] * 7, "date_overrides": {date.today().isoformat(): 2}}

    def test_single_row_per_user(self, session_client, workspace):
        _patch(session_client, workspace, {"weekday_limits": [5] * 7})
        _patch(session_client, workspace, {"weekday_limits": [6] * 7})
        assert UserDayCapacity.objects.count() == 1

    @pytest.mark.parametrize(
        "payload",
        [
            {},
            {"weekday_limits": [13] * 6},
            {"weekday_limits": [13, 13, 13, 13, 13, 13, 41]},
            {"set_override": {"date": "29.09.2026", "limit": 5}},
            {"set_override": {"date": "2026-09-29", "limit": -1}},
            {"clear_override": 5},
        ],
    )
    def test_invalid_payload_is_400_in_russian(self, session_client, workspace, payload):
        response = _patch(session_client, workspace, payload)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert any("а" <= ch <= "я" for ch in response.data["error"].lower())
        assert not UserDayCapacity.objects.exists()

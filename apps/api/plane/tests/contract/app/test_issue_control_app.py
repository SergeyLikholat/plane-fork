# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import date

import pytest
from freezegun import freeze_time
from rest_framework import status

from plane.db.models import (
    Estimate,
    EstimatePoint,
    Issue,
    IssueComment,
    IssueControl,
    IssueLabel,
    Label,
    Project,
    ProjectMember,
    State,
)

# 2026-09-28 is a Monday.
MONDAY = "2026-09-28 10:00:00"


@pytest.fixture(autouse=True)
def no_celery(mocker):
    mocker.patch("plane.app.views.issue.control.issue_activity")
    mocker.patch("plane.app.views.issue.control.model_activity")


@pytest.fixture
def control_project(db, workspace, create_user):
    project = Project.objects.create(name="Контроль", identifier="CTL", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    supervised = State.objects.create(name="📍 На контроле", group="supervised", project=project, color="#000")
    later = State.objects.create(name="Готово позже", group="completed", project=project, color="#000")
    done = State.objects.create(name="✅ Готово", group="completed", project=project, color="#000")
    # State.save() appends new states at the end; reorder so the second one is first.
    State.objects.filter(pk=later.pk).update(sequence=90000)
    State.objects.filter(pk=done.pk).update(sequence=50000)
    estimate = Estimate.objects.create(name="Вес", project=project)
    points = {
        value: EstimatePoint.objects.create(estimate=estimate, key=i, value=value, project=project)
        for i, value in enumerate(["1 · пустяк", "3 · средняя", "13 · разбить"])
    }
    project.estimate = estimate
    project.save()
    check = Label.objects.create(name="👁 Проверка", project=project, workspace=workspace, color="#0ea5e9")
    person = Label.objects.create(name="Фурсов А.", project=project, workspace=workspace, color="#999")
    issue = Issue.objects.create(
        name="Проверить смету",
        project=project,
        state=supervised,
        estimate_point=points["1 · пустяк"],
        start_date=date(2026, 9, 28),
        target_date=date(2026, 10, 5),
    )
    for label in (check, person):
        IssueLabel.objects.create(issue=issue, label=label, project=project)
    return {"project": project, "issue": issue, "done": done, "points": points, "check": check, "person": person}


def _url(ws, ctx, touch=False):
    base = f"/api/workspaces/{ws.slug}/projects/{ctx['project'].id}/issues/{ctx['issue'].id}/control/"
    return f"{base}touch/" if touch else base


def _label_names(issue):
    return set(IssueLabel.objects.filter(issue=issue).values_list("label__name", flat=True))


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueControl:
    def test_get_returns_defaults_without_creating_row(self, session_client, workspace, control_project):
        response = session_client.get(_url(workspace, control_project))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["frequency"] == "twice_week"
        assert response.data["phase"] == "check"
        assert response.data["no_progress_streak"] == 0
        assert not IssueControl.objects.exists()

    def test_patch_saves_promise_and_frequency(self, session_client, workspace, control_project):
        response = session_client.patch(
            _url(workspace, control_project), {"promised_date": "2026-10-08", "frequency": "weekly"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        control = IssueControl.objects.get(issue=control_project["issue"])
        assert control.promised_date == date(2026, 10, 8)
        assert control.frequency == "weekly"

    def test_patch_rejects_bad_frequency(self, session_client, workspace, control_project):
        response = session_client.patch(_url(workspace, control_project), {"frequency": "hourly"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_touch_rejects_unknown_outcome(self, session_client, workspace, control_project):
        response = session_client.post(_url(workspace, control_project, True), {"outcome": "x"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "исход" in response.data["error"]

    @freeze_time(MONDAY)
    def test_two_no_progress_touches_flag_risk(self, session_client, workspace, control_project):
        url = _url(workspace, control_project, True)
        first = session_client.post(url, {"outcome": "no_progress", "comment": "молчит"}, format="json")
        assert first.status_code == status.HTTP_200_OK
        assert first.data["control"]["no_progress_streak"] == 1
        assert str(first.data["issue"]["target_date"]) == "2026-10-01"

        second = session_client.post(url, {"outcome": "no_progress"}, format="json")
        assert second.data["control"]["no_progress_streak"] == 2
        assert str(second.data["issue"]["target_date"]) == "2026-09-29"

        issue = control_project["issue"]
        assert "🔥 риск" in _label_names(issue)
        assert Label.objects.get(project=control_project["project"], name="🔥 риск").color == "#dc2626"
        comments = list(IssueComment.objects.filter(issue=issue).order_by("created_at"))
        assert len(comments) == 2
        assert comments[0].comment_html == "<p><strong>👁 Проверка · без движения</strong> — молчит</p>"

    @freeze_time(MONDAY)
    def test_new_deadline_clears_start_date_after_target(self, session_client, workspace, control_project):
        issue = control_project["issue"]
        Issue.objects.filter(pk=issue.pk).update(start_date=date(2026, 10, 3))
        response = session_client.post(
            _url(workspace, control_project, True),
            {"outcome": "new_deadline", "promised_date": "2026-09-30"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        issue.refresh_from_db()
        assert issue.target_date == date(2026, 9, 29)
        assert issue.start_date is None
        assert response.data["control"]["promised_date"] == date(2026, 9, 30)

    @freeze_time(MONDAY)
    def test_submitted_then_accepted(self, session_client, workspace, control_project):
        url = _url(workspace, control_project, True)
        issue = control_project["issue"]

        submitted = session_client.post(url, {"outcome": "submitted"}, format="json")
        assert submitted.status_code == status.HTTP_200_OK
        assert submitted.data["control"]["phase"] == "acceptance"
        assert _label_names(issue) == {"✅ Приёмка", "Фурсов А."}
        issue.refresh_from_db()
        assert issue.estimate_point_id == control_project["points"]["3 · средняя"].id
        assert issue.target_date == date(2026, 9, 29)

        accepted = session_client.post(url, {"outcome": "accepted"}, format="json")
        assert accepted.status_code == status.HTTP_200_OK
        issue.refresh_from_db()
        assert issue.state_id == control_project["done"].id

    @freeze_time(MONDAY)
    def test_returned_needs_promise_and_restores_check(self, session_client, workspace, control_project):
        url = _url(workspace, control_project, True)
        issue = control_project["issue"]
        session_client.post(url, {"outcome": "submitted"}, format="json")

        missing = session_client.post(url, {"outcome": "returned"}, format="json")
        assert missing.status_code == status.HTTP_400_BAD_REQUEST

        returned = session_client.post(url, {"outcome": "returned", "promised_date": "2026-10-08"}, format="json")
        assert returned.status_code == status.HTTP_200_OK
        assert _label_names(issue) == {"👁 Проверка", "Фурсов А."}
        issue.refresh_from_db()
        assert issue.estimate_point_id == control_project["points"]["1 · пустяк"].id
        assert issue.target_date == date(2026, 10, 1)

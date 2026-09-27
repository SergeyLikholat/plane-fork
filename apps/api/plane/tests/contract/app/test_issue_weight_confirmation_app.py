# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import pytest
from rest_framework import status

from plane.db.models import (
    Estimate,
    EstimatePoint,
    Issue,
    IssueActivity,
    IssueWeightConfirmation,
    Project,
    ProjectMember,
    State,
    User,
)
from plane.utils.weight_estimate import apply_default_weight

URL = "/api/workspaces/{slug}/issues/weight-confirmations/"


@pytest.fixture
def weight_project(db, workspace, create_user):
    project = Project.objects.create(name="Веса", identifier="WGT", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    state = State.objects.create(name="Todo", group="unstarted", project=project, color="#000")
    estimate = Estimate.objects.create(name="Вес", project=project, type="categories", last_used=True)
    points = {
        value: EstimatePoint.objects.create(estimate=estimate, key=i, value=value, project=project)
        for i, value in enumerate(["1 · пустяк", "3 · средняя", "5 · большая"])
    }
    project.estimate = estimate
    project.save()

    def make(name, point=None):
        return Issue.objects.create(name=name, project=project, state=state, estimate_point=point)

    return {"project": project, "points": points, "make": make}


@pytest.fixture
def foreign_issue(db, workspace):
    """A work item in a project the requesting user is not a member of."""
    owner = User.objects.create(email="other@plane.so", username="other", first_name="O", last_name="O")
    project = Project.objects.create(name="Чужой", identifier="FRN", workspace=workspace)
    ProjectMember.objects.create(project=project, member=owner, role=20)
    state = State.objects.create(name="Todo", group="unstarted", project=project, color="#000")
    return Issue.objects.create(name="Чужая", project=project, state=state)


def _get(client, workspace, *issues):
    ids = ",".join(str(i.id) if hasattr(i, "id") else i for i in issues)
    return client.get(URL.format(slug=workspace.slug), {"issue_ids": ids})


def _post(client, workspace, payload):
    return client.post(URL.format(slug=workspace.slug), payload, format="json")


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueWeightConfirmationGet:
    def test_empty_ids_return_empty_list(self, session_client, workspace):
        response = session_client.get(URL.format(slug=workspace.slug))
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"confirmed": []}

    def test_automatic_weight_is_not_confirmed(self, session_client, workspace, weight_project):
        issue = weight_project["make"]("Авто", weight_project["points"]["3 · средняя"])
        response = _get(session_client, workspace, issue)
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"confirmed": []}

    def test_confirmation_row_confirms(self, session_client, workspace, weight_project):
        issue = weight_project["make"]("Подтверждена", weight_project["points"]["1 · пустяк"])
        IssueWeightConfirmation.objects.create(issue=issue, project=weight_project["project"])
        other = weight_project["make"]("Нет")
        response = _get(session_client, workspace, issue, other)
        assert response.data == {"confirmed": [str(issue.id)]}

    @pytest.mark.parametrize("verb", ["updated", "removed"])
    def test_human_estimate_change_confirms(self, session_client, workspace, weight_project, create_user, verb):
        issue = weight_project["make"]("Руками", weight_project["points"]["5 · большая"])
        IssueActivity.objects.create(
            issue=issue,
            project=weight_project["project"],
            workspace=workspace,
            actor=create_user,
            verb=verb,
            field="estimate_categories",
        )
        response = _get(session_client, workspace, issue)
        assert response.data == {"confirmed": [str(issue.id)]}

    def test_activity_without_actor_or_other_field_does_not_confirm(
        self, session_client, workspace, weight_project, create_user
    ):
        issue = weight_project["make"]("Система", weight_project["points"]["1 · пустяк"])
        project = weight_project["project"]
        IssueActivity.objects.create(
            issue=issue, project=project, workspace=workspace, actor=None, verb="updated", field="estimate_categories"
        )
        IssueActivity.objects.create(
            issue=issue, project=project, workspace=workspace, actor=create_user, verb="updated", field="target_date"
        )
        IssueActivity.objects.create(
            issue=issue,
            project=project,
            workspace=workspace,
            actor=create_user,
            verb="created",
            field="estimate_points",
        )
        assert _get(session_client, workspace, issue).data == {"confirmed": []}

    def test_foreign_project_is_hidden(self, session_client, workspace, foreign_issue):
        IssueWeightConfirmation.objects.create(issue=foreign_issue, project=foreign_issue.project)
        assert _get(session_client, workspace, foreign_issue).data == {"confirmed": []}

    def test_malformed_ids_are_ignored(self, session_client, workspace, weight_project):
        issue = weight_project["make"]("Ок", weight_project["points"]["1 · пустяк"])
        IssueWeightConfirmation.objects.create(issue=issue, project=weight_project["project"])
        response = _get(session_client, workspace, "not-a-uuid", issue)
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"confirmed": [str(issue.id)]}


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueWeightConfirmationPost:
    def test_creates_rows_and_returns_confirmed(self, session_client, workspace, weight_project, create_user):
        a = weight_project["make"]("А", weight_project["points"]["1 · пустяк"])
        b = weight_project["make"]("Б", weight_project["points"]["3 · средняя"])
        response = _post(session_client, workspace, {"issue_ids": [str(a.id), str(b.id)]})
        assert response.status_code == status.HTTP_200_OK
        assert sorted(response.data["confirmed"]) == sorted([str(a.id), str(b.id)])
        rows = IssueWeightConfirmation.objects.filter(issue__in=[a, b])
        assert rows.count() == 2
        assert all(r.workspace_id == workspace.id and r.created_by_id == create_user.id for r in rows)

    def test_repeat_touches_confirmed_at(self, session_client, workspace, weight_project):
        issue = weight_project["make"]("Повтор", weight_project["points"]["1 · пустяк"])
        _post(session_client, workspace, {"issue_ids": [str(issue.id)]})
        first = IssueWeightConfirmation.objects.get(issue=issue).confirmed_at
        response = _post(session_client, workspace, {"issue_ids": [str(issue.id), str(issue.id)]})
        assert response.status_code == status.HTTP_200_OK
        assert IssueWeightConfirmation.all_objects.filter(issue=issue).count() == 1
        assert IssueWeightConfirmation.objects.get(issue=issue).confirmed_at > first

    def test_restores_soft_deleted_row(self, session_client, workspace, weight_project):
        issue = weight_project["make"]("Восстановить", weight_project["points"]["1 · пустяк"])
        row = IssueWeightConfirmation.objects.create(issue=issue, project=weight_project["project"])
        IssueWeightConfirmation.objects.filter(pk=row.pk).delete()
        response = _post(session_client, workspace, {"issue_ids": [str(issue.id)]})
        assert response.data == {"confirmed": [str(issue.id)]}
        assert IssueWeightConfirmation.objects.filter(issue=issue).exists()

    def test_foreign_project_is_not_confirmed(self, session_client, workspace, foreign_issue):
        response = _post(session_client, workspace, {"issue_ids": [str(foreign_issue.id)]})
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"confirmed": []}
        assert not IssueWeightConfirmation.all_objects.filter(issue=foreign_issue).exists()

    @pytest.mark.parametrize(
        "payload",
        [
            {},
            {"issue_ids": []},
            {"issue_ids": "abc"},
            {"issue_ids": ["not-a-uuid"]},
            {"issue_ids": [123]},
            {"issue_ids": [str(uuid.uuid4()) for _ in range(501)]},
        ],
    )
    def test_invalid_payload_is_rejected_in_russian(self, session_client, workspace, payload):
        response = _post(session_client, workspace, payload)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert any("а" <= ch <= "я" for ch in response.data["error"].lower())


@pytest.mark.contract
@pytest.mark.django_db
def test_default_weight_does_not_confirm(workspace, weight_project):
    issue = weight_project["make"]("Без оценки")
    assert apply_default_weight(issue) is True
    issue.refresh_from_db()
    assert issue.estimate_point_id is not None
    assert not IssueWeightConfirmation.all_objects.filter(issue=issue).exists()
    assert not IssueActivity.objects.filter(issue=issue, field__startswith="estimate_").exists()

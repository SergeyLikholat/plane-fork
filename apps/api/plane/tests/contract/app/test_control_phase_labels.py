# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""New supervised work items start at «🗣 Постановка»; the phase labels exist in every project."""

from io import StringIO

import pytest
from django.core.management import call_command

from plane.db.models import Estimate, EstimatePoint, Issue, IssueLabel, Label, Project, State
from plane.utils.weight_estimate import apply_default_weight


@pytest.fixture
def phase_project(db, workspace):
    project = Project.objects.create(name="Фазы", identifier="PHS", workspace=workspace)
    supervised = State.objects.create(name="📍 На контроле", group="supervised", project=project, color="#000")
    todo = State.objects.create(name="Todo", group="unstarted", project=project, color="#000")
    estimate = Estimate.objects.create(name="Вес", project=project, type="categories", last_used=True)
    points = {
        value: EstimatePoint.objects.create(estimate=estimate, key=i, value=value, project=project)
        for i, value in enumerate(["1 · пустяк", "3 · средняя", "5 · большая"])
    }
    project.estimate = estimate
    project.save()
    return {"project": project, "supervised": supervised, "todo": todo, "points": points}


def _labels(issue):
    return set(IssueLabel.objects.filter(issue=issue).values_list("label__name", flat=True))


@pytest.mark.contract
@pytest.mark.django_db
class TestSetupLabelOnCreate:
    def test_supervised_without_phase_gets_setup_and_weight_three(self, phase_project):
        issue = Issue.objects.create(
            name="Таблица отверстий", project=phase_project["project"], state=phase_project["supervised"]
        )
        assert apply_default_weight(issue) is True
        assert _labels(issue) == {"🗣 Постановка"}
        label = Label.objects.get(project=phase_project["project"], name="🗣 Постановка")
        assert label.color == "#8b5cf6"
        issue.refresh_from_db()
        assert issue.estimate_point_id == phase_project["points"]["3 · средняя"].id

    def test_existing_setup_label_is_reused(self, phase_project, workspace):
        existing = Label.objects.create(
            name="Постановка", project=phase_project["project"], workspace=workspace, color="#000"
        )
        issue = Issue.objects.create(name="Смета", project=phase_project["project"], state=phase_project["supervised"])
        apply_default_weight(issue)
        assert list(IssueLabel.objects.filter(issue=issue).values_list("label_id", flat=True)) == [existing.id]

    def test_supervised_with_check_label_is_left_alone(self, phase_project, workspace):
        check = Label.objects.create(
            name="👁 Проверка", project=phase_project["project"], workspace=workspace, color="#0ea5e9"
        )
        issue = Issue.objects.create(name="Смета", project=phase_project["project"], state=phase_project["supervised"])
        IssueLabel.objects.create(issue=issue, label=check, project=phase_project["project"])
        apply_default_weight(issue)
        assert _labels(issue) == {"👁 Проверка"}
        issue.refresh_from_db()
        assert issue.estimate_point_id == phase_project["points"]["1 · пустяк"].id

    def test_own_work_gets_no_phase_label(self, phase_project):
        issue = Issue.objects.create(name="Своё", project=phase_project["project"], state=phase_project["todo"])
        apply_default_weight(issue)
        assert _labels(issue) == set()

    def test_backfill_does_not_attach(self, phase_project):
        issue = Issue.objects.create(name="Старое", project=phase_project["project"], state=phase_project["supervised"])
        apply_default_weight(issue, attach_phase_label=False)
        assert _labels(issue) == set()
        issue.refresh_from_db()
        assert issue.estimate_point_id == phase_project["points"]["1 · пустяк"].id

    def test_label_attached_even_with_explicit_weight(self, phase_project):
        issue = Issue.objects.create(
            name="С весом",
            project=phase_project["project"],
            state=phase_project["supervised"],
            estimate_point=phase_project["points"]["5 · большая"],
        )
        assert apply_default_weight(issue) is False
        assert _labels(issue) == {"🗣 Постановка"}
        issue.refresh_from_db()
        assert issue.estimate_point_id == phase_project["points"]["5 · большая"].id


@pytest.mark.contract
@pytest.mark.django_db
def test_ensure_command_creates_missing_phase_labels_only(phase_project, workspace):
    project = phase_project["project"]
    Label.objects.create(name="👁 Проверка", project=project, workspace=workspace, color="#111")
    Label.objects.create(name="Приемка", project=project, workspace=workspace, color="#222")

    out = StringIO()
    call_command("ensure_weight_estimates", stdout=out)
    call_command("ensure_weight_estimates", stdout=out)

    names = list(Label.objects.filter(project=project).values_list("name", flat=True))
    assert sorted(names) == sorted(["Приемка", "👁 Проверка", "🗣 Постановка"])
    lines = [line for line in out.getvalue().splitlines() if line.startswith("PHS:")]
    assert [line.split("; ")[-1] for line in lines] == ["phase labels created: 1", "phase labels created: 0"]


@pytest.mark.contract
@pytest.mark.django_db
def test_create_via_api_starts_at_setup(session_client, workspace, create_user, phase_project, mocker):
    from plane.db.models import ProjectMember

    for task in ("issue_activity", "model_activity", "issue_description_version_task"):
        mocker.patch(f"plane.app.views.issue.base.{task}")

    project = phase_project["project"]
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    response = session_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {"name": "Таблица отверстий", "state_id": str(phase_project["supervised"].id)},
        format="json",
    )
    assert response.status_code == 201, response.data
    issue = Issue.objects.get(pk=response.data["id"])
    assert _labels(issue) == {"🗣 Постановка"}
    assert issue.estimate_point_id == phase_project["points"]["3 · средняя"].id

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Big tasks: the column, create hook, context for lists, next step and closing."""

from datetime import date
from io import StringIO

import pytest
from django.core.management import call_command
from freezegun import freeze_time
from rest_framework import status

from plane.db.models import (
    Estimate,
    EstimatePoint,
    Issue,
    IssueAssignee,
    IssueComment,
    IssueLabel,
    Label,
    Module,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
    User,
)
from plane.utils.big_tasks import ensure_big_tasks_state
from plane.utils.weight_estimate import apply_default_weight

# 2026-09-25 is a Friday: the next working day is Monday 2026-09-28.
FRIDAY = "2026-09-25 10:00:00"


@pytest.fixture(autouse=True)
def no_celery(mocker):
    mocker.patch("plane.app.views.issue.big_task.issue_activity")
    mocker.patch("plane.app.views.issue.big_task.model_activity")
    mocker.patch("plane.app.views.issue.big_task.issue_description_version_task")


def _state(project, name, group, sequence):
    state = State.objects.create(name=name, group=group, project=project, color="#000")
    State.objects.filter(pk=state.pk).update(sequence=sequence)
    state.sequence = sequence
    return state


@pytest.fixture
def big_project(db, workspace, create_user):
    project = Project.objects.create(name="Большие", identifier="BIG", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    states = {
        "backlog": _state(project, "🗃 Бэклог", "unstarted", 25000),
        "wip": _state(project, "📌 В процессе (WIP ≤ 3)", "started", 35000),
        "done": _state(project, "Завершено", "completed", 45000),
        "cancelled": _state(project, "Отменено", "cancelled", 55000),
        "control": _state(project, "📍 На контроле", "supervised", 70000),
    }
    ensure_big_tasks_state(project)
    states["big"] = State.objects.get(project=project, name="💼 Big Tasks")
    estimate = Estimate.objects.create(name="Вес", project=project, type="categories", last_used=True)
    points = {
        value: EstimatePoint.objects.create(estimate=estimate, key=i, value=value, project=project)
        for i, value in enumerate(["1 · пустяк", "2 · мелочь", "3 · средняя", "5 · большая"])
    }
    project.estimate = estimate
    project.save()
    people = Label.objects.create(name="ЛЮДИ", project=project, workspace=workspace, color="#000")
    person = Label.objects.create(name="Фурсов А.", project=project, workspace=workspace, color="#999", parent=people)
    other = Label.objects.create(name="Иванов И.", project=project, workspace=workspace, color="#999", parent=people)
    cal = Label.objects.create(name="cal:Работа над проектом", project=project, workspace=workspace, color="#0f0")
    check = Label.objects.create(name="👁 Проверка", project=project, workspace=workspace, color="#0ea5e9")
    module = Module.objects.create(name="Кровля", project=project, workspace=workspace)
    big_task = Issue.objects.create(
        name="Сдать кровлю", project=project, state=states["big"], target_date=date(2026, 11, 30)
    )
    for label in (cal, other, check):
        IssueLabel.objects.create(issue=big_task, label=label, project=project)
    ModuleIssue.objects.create(issue=big_task, module=module, project=project)
    return {
        "project": project,
        "states": states,
        "points": points,
        "person": person,
        "other": other,
        "cal": cal,
        "module": module,
        "big_task": big_task,
    }


def _labels(issue):
    return set(IssueLabel.objects.filter(issue=issue).values_list("label__name", flat=True))


def _next_step_url(ws, ctx):
    return f"/api/workspaces/{ws.slug}/projects/{ctx['project'].id}/issues/{ctx['big_task'].id}/next-step/"


def _complete_url(ws, ctx):
    return f"/api/workspaces/{ws.slug}/projects/{ctx['project'].id}/issues/{ctx['big_task'].id}/big-task/complete/"


def _context_url(ws, *ids):
    return f"/api/workspaces/{ws.slug}/issues/big-task-context/?issue_ids={','.join(str(i) for i in ids)}"


@pytest.mark.contract
@pytest.mark.django_db
class TestBigTasksState:
    def test_created_after_na_kontrole_once(self, big_project):
        project = big_project["project"]
        assert big_project["states"]["big"].group == "started"
        assert big_project["states"]["big"].color == "#7c3aed"
        # «На контроле» (70000) is the last state here → one step after it.
        assert big_project["states"]["big"].sequence == 71000
        assert ensure_big_tasks_state(project) == "ok"
        assert State.objects.filter(project=project, name__icontains="big tasks").count() == 1

    def test_existing_hand_made_state_is_reused(self, db, workspace):
        project = Project.objects.create(name="Ручной", identifier="HND", workspace=workspace)
        State.objects.create(name="Big tasks", group="started", project=project, color="#000")
        assert ensure_big_tasks_state(project) == "ok"
        assert State.objects.filter(project=project, name__icontains="big tasks").count() == 1

    def test_command_adds_state(self, db, workspace):
        project = Project.objects.create(name="Команда", identifier="CMD", workspace=workspace)
        _state(project, "In Progress", "started", 35000)
        _state(project, "Done", "completed", 45000)
        out = StringIO()
        call_command("ensure_weight_estimates", stdout=out)
        assert "big tasks state: created" in out.getvalue()
        state = State.objects.get(project=project, name="💼 Big Tasks")
        assert state.sequence == 40000


@pytest.mark.contract
@pytest.mark.django_db
class TestBigTaskCreateHook:
    def test_no_weight_and_assigned_to_author(self, big_project, create_user):
        issue = Issue.objects.create(
            name="Новая большая", project=big_project["project"], state=big_project["states"]["big"]
        )
        Issue.objects.filter(pk=issue.pk).update(created_by=create_user)
        issue.refresh_from_db()
        assert apply_default_weight(issue) is False
        issue.refresh_from_db()
        assert issue.estimate_point_id is None
        assert list(IssueAssignee.objects.filter(issue=issue).values_list("assignee_id", flat=True)) == [create_user.id]

    def test_existing_assignee_kept(self, big_project, create_user):
        other = User.objects.create(email="x@plane.so", username="x")
        issue = Issue.objects.create(
            name="Чужая большая", project=big_project["project"], state=big_project["states"]["big"]
        )
        Issue.objects.filter(pk=issue.pk).update(created_by=create_user)
        issue.refresh_from_db()
        IssueAssignee.objects.create(issue=issue, assignee=other, project=big_project["project"])
        apply_default_weight(issue)
        assert list(IssueAssignee.objects.filter(issue=issue).values_list("assignee_id", flat=True)) == [other.id]

    def test_create_via_api(self, session_client, workspace, big_project, create_user):
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{big_project['project'].id}/issues/",
            {"name": "Большая через API", "state_id": str(big_project["states"]["big"].id)},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        issue = Issue.objects.get(pk=response.data["id"])
        assert issue.estimate_point_id is None
        assert list(IssueAssignee.objects.filter(issue=issue).values_list("assignee_id", flat=True)) == [create_user.id]

    def test_backfill_skips_big_tasks(self, big_project):
        out = StringIO()
        call_command("fill_default_weights", stdout=out)
        big_project["big_task"].refresh_from_db()
        assert big_project["big_task"].estimate_point_id is None


@pytest.mark.contract
@pytest.mark.django_db
class TestNextStep:
    @freeze_time(FRIDAY)
    def test_my_step(self, session_client, workspace, big_project, create_user):
        response = session_client.post(
            _next_step_url(workspace, big_project), {"name": " Заказать мембрану ", "performer": "me"}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        step = Issue.objects.get(pk=response.data["id"])
        assert step.name == "Заказать мембрану"
        assert step.parent_id == big_project["big_task"].id
        assert step.state_id == big_project["states"]["wip"].id
        assert step.target_date == date(2026, 9, 28)
        assert _labels(step) == {"cal:Работа над проектом"}
        assert list(IssueAssignee.objects.filter(issue=step).values_list("assignee_id", flat=True)) == [create_user.id]
        assert list(ModuleIssue.objects.filter(issue=step).values_list("module_id", flat=True)) == [
            big_project["module"].id
        ]
        # No weight passed: the default by labels (cal:Работа над проектом → 5).
        assert step.estimate_point_id == big_project["points"]["5 · большая"].id
        comment = IssueComment.objects.get(issue=big_project["big_task"])
        assert comment.comment_html == "<p>＋ Следующий шаг: Заказать мембрану</p>"
        assert response.data["sequence_id"] == step.sequence_id
        assert str(response.data["target_date"]) == "2026-09-28"

    @freeze_time(FRIDAY)
    def test_person_step_goes_to_control_with_setup(self, session_client, workspace, big_project):
        response = session_client.post(
            _next_step_url(workspace, big_project),
            {
                "name": "Согласовать узлы",
                "performer": str(big_project["person"].id),
                "target_date": "2026-10-02",
                "weight": 2,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        step = Issue.objects.get(pk=response.data["id"])
        assert step.state_id == big_project["states"]["control"].id
        assert _labels(step) == {"cal:Работа над проектом", "Фурсов А.", "🗣 Постановка"}
        assert step.target_date == date(2026, 10, 2)
        assert step.estimate_point_id == big_project["points"]["2 · мелочь"].id

    @freeze_time(FRIDAY)
    def test_activity_emitted(self, session_client, workspace, big_project, mocker):
        activity = mocker.patch("plane.app.views.issue.big_task.issue_activity")
        session_client.post(_next_step_url(workspace, big_project), {"name": "Шаг"}, format="json")
        types = [c.kwargs["type"] for c in activity.delay.call_args_list]
        assert types == ["issue.activity.created", "module.activity.created", "comment.activity.created"]

    @pytest.mark.parametrize(
        "payload,needle",
        [
            ({"name": ""}, "следующий шаг"),
            ({"name": "Шаг", "weight": 4}, "Вес"),
            ({"name": "Шаг", "target_date": "2026-09-01"}, "прошлом"),
            ({"name": "Шаг", "performer": "not-a-uuid"}, "Кто делает"),
        ],
    )
    @freeze_time(FRIDAY)
    def test_rejects_bad_input(self, session_client, workspace, big_project, payload, needle):
        response = session_client.post(_next_step_url(workspace, big_project), payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert needle in response.data["error"]
        assert not Issue.objects.filter(parent=big_project["big_task"]).exists()

    def test_rejects_label_outside_people(self, session_client, workspace, big_project):
        response = session_client.post(
            _next_step_url(workspace, big_project),
            {"name": "Шаг", "performer": str(big_project["cal"].id)},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_non_big_task(self, session_client, workspace, big_project):
        Issue.objects.filter(pk=big_project["big_task"].pk).update(state=big_project["states"]["wip"])
        response = session_client.post(_next_step_url(workspace, big_project), {"name": "Шаг"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Big Tasks" in response.data["error"]


@pytest.mark.contract
@pytest.mark.django_db
class TestComplete:
    def test_moves_to_completed(self, session_client, workspace, big_project):
        response = session_client.post(_complete_url(workspace, big_project), {}, format="json")
        assert response.status_code == status.HTTP_200_OK
        big_project["big_task"].refresh_from_db()
        assert big_project["big_task"].state_id == big_project["states"]["done"].id


@pytest.mark.contract
@pytest.mark.django_db
class TestContext:
    def _step(self, ctx, name, state, target=None, labels=()):
        step = Issue.objects.create(
            name=name, project=ctx["project"], state=ctx["states"][state], parent=ctx["big_task"], target_date=target
        )
        for label in labels:
            IssueLabel.objects.create(issue=step, label=label, project=ctx["project"])
        return step

    def test_parents_and_progress(self, session_client, workspace, big_project):
        done = self._step(big_project, "Обмеры", "done", date(2026, 9, 20))
        later = self._step(big_project, "Смета", "wip", date(2026, 10, 9))
        current = self._step(big_project, "Узлы", "control", date(2026, 10, 1), labels=[big_project["person"]])
        big = big_project["big_task"]

        response = session_client.get(_context_url(workspace, done.id, current.id, big.id, "junk"))
        assert response.status_code == status.HTTP_200_OK
        parents = response.data["parents"]
        assert set(parents) == {str(done.id), str(current.id)}
        assert parents[str(current.id)]["name"] == "Сдать кровлю"
        assert parents[str(current.id)]["is_big_task"] is True
        assert parents[str(current.id)]["project_identifier"] == "BIG"
        summary = response.data["big_tasks"][str(big.id)]
        assert (summary["total"], summary["done"], summary["open"]) == (3, 1, 2)
        assert summary["current_step"]["id"] == str(current.id)
        assert summary["current_step"]["person"] == "Фурсов А."
        assert summary["current_step"]["state_group"] == "supervised"
        assert summary["next_deadline"] == date(2026, 10, 1)
        assert later.id  # the later step is open but not current

    def test_big_task_without_open_steps(self, session_client, workspace, big_project):
        self._step(big_project, "Обмеры", "done")
        big = big_project["big_task"]
        response = session_client.get(_context_url(workspace, big.id))
        assert response.data["big_tasks"][str(big.id)]["current_step"] is None

    def test_hidden_for_non_members(self, session_client, workspace, big_project, create_user):
        ProjectMember.objects.filter(project=big_project["project"], member=create_user).update(is_active=False)
        response = session_client.get(_context_url(workspace, big_project["big_task"].id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"parents": {}, "big_tasks": {}}

    def test_empty(self, session_client, workspace):
        response = session_client.get(f"/api/workspaces/{workspace.slug}/issues/big-task-context/")
        assert response.data == {"parents": {}, "big_tasks": {}}


@pytest.mark.contract
@pytest.mark.django_db
class TestBigTaskList:
    def test_lists_big_tasks_nearest_deadline_first(self, session_client, workspace, big_project):
        ctx = big_project
        undated = Issue.objects.create(name="Без срока", project=ctx["project"], state=ctx["states"]["big"])
        sooner = Issue.objects.create(
            name="Фасад", project=ctx["project"], state=ctx["states"]["big"], target_date=date(2026, 10, 15)
        )
        Issue.objects.create(name="Обычная", project=ctx["project"], state=ctx["states"]["wip"])

        response = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{ctx['project'].id}/big-tasks/")
        assert response.status_code == status.HTTP_200_OK
        assert [row["id"] for row in response.data] == [sooner.id, ctx["big_task"].id, undated.id]
        assert response.data[0]["name"] == "Фасад"
        assert response.data[0]["target_date"] == date(2026, 10, 15)

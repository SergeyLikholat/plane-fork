# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Big tasks and their «следующий шаг».

- `GET  /workspaces/<slug>/issues/big-task-context/?issue_ids=` — parent captions
  of steps and progress / current step of Big tasks, for «Ваша работа».
- `POST .../issues/<big_id>/next-step/` — create the next step (a sub-issue).
- `POST .../issues/<big_id>/big-task/complete/` — close the Big task.
- `GET  .../projects/<id>/big-tasks/` — Big tasks of a project, for
  «Сделать шагом Big task…» in the ⋯ menu.

Rules live in `plane.utils.big_tasks`; writes go through IssueCreateSerializer
and emit the same activity as a regular create / update.
"""

# Python imports
import json
import uuid

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.utils.html import escape

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueCommentSerializer, IssueCreateSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.issue_description_version_task import issue_description_version_task
from plane.bgtasks.webhook_task import model_activity
from plane.db.models import (
    EstimatePoint,
    Issue,
    IssueLabel,
    Label,
    ModuleIssue,
    Project,
    State,
)
from plane.utils.big_tasks import (
    BigTaskInputError,
    is_big_task_state,
    is_people_parent_name,
    parse_step_date,
    parse_step_name,
    parse_weight,
    pick_completed_state,
    pick_in_progress_state,
    pick_supervised_state,
    step_label_ids,
    summarize_steps,
)
from plane.utils.control_labels import resolve_mark_label
from plane.utils.control_touch import MARK_SETUP, estimate_weight, next_working_day
from plane.utils.host import base_host

MAX_IDS = 500
PERFORMER_ME = "me"
PERFORMER_ERROR = "«Кто делает» — «я» или человек из меток «ЛЮДИ» этого проекта."


def _bad_request(message):
    return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)


def _parse_ids(raw):
    """Valid UUIDs from a comma-separated list, capped at MAX_IDS; junk is skipped."""
    ids = []
    for part in raw.split(","):
        try:
            ids.append(uuid.UUID(part.strip()))
        except ValueError:
            continue
        if len(ids) >= MAX_IDS:
            break
    return ids


def _person_labels(issue_ids):
    """{issue_id: name of its label under «ЛЮДИ»} (first one wins)."""
    rows = IssueLabel.objects.filter(
        issue_id__in=issue_ids,
        label__deleted_at__isnull=True,
        label__parent__isnull=False,
    ).values_list("issue_id", "label__name", "label__parent__name")
    people = {}
    for issue_id, name, parent_name in rows:
        if is_people_parent_name(parent_name) and issue_id not in people:
            people[issue_id] = name
    return people


def _emit(activity_type, request, issue_id, project_id, requested_data, current_instance):
    """Issue activity (history + notifications) and the webhook model activity."""
    origin = base_host(request=request, is_app=True)
    issue_activity.delay(
        type=activity_type,
        requested_data=json.dumps(requested_data, cls=DjangoJSONEncoder),
        actor_id=str(request.user.id),
        issue_id=str(issue_id),
        project_id=str(project_id),
        current_instance=current_instance,
        epoch=int(timezone.now().timestamp()),
        notification=True,
        origin=origin,
    )
    return origin


class BigTaskContextEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        issue_ids = _parse_ids(request.GET.get("issue_ids", ""))
        if not issue_ids:
            return Response({"parents": {}, "big_tasks": {}}, status=status.HTTP_200_OK)

        visible = Issue.issue_objects.filter(
            workspace__slug=slug,
            project__project_projectmember__member=request.user,
            project__project_projectmember__is_active=True,
        )
        issues = list(visible.filter(pk__in=issue_ids).select_related("state", "parent", "parent__state"))

        parents = {}
        big_task_ids = []
        for issue in issues:
            if is_big_task_state(issue.state):
                big_task_ids.append(issue.id)
            parent = issue.parent
            if parent is None or parent.deleted_at is not None:
                continue
            parents[str(issue.id)] = {
                "id": str(parent.id),
                "name": parent.name,
                "sequence_id": parent.sequence_id,
                "project_id": str(parent.project_id),
                "project_identifier": None,
                "target_date": parent.target_date,
                "is_big_task": is_big_task_state(parent.state),
            }
        if parents:
            project_ids = {p["project_id"] for p in parents.values()}
            identifiers = {
                str(pid): ident
                for pid, ident in Project.objects.filter(pk__in=project_ids).values_list("id", "identifier")
            }
            for payload in parents.values():
                payload["project_identifier"] = identifiers.get(payload["project_id"])

        big_tasks = {}
        if big_task_ids:
            steps = list(
                Issue.issue_objects.filter(parent_id__in=big_task_ids).values(
                    "id", "parent_id", "name", "target_date", "created_at", "state__group"
                )
            )
            people = _person_labels([s["id"] for s in steps])
            by_parent = {big_id: [] for big_id in big_task_ids}
            for step in steps:
                by_parent[step["parent_id"]].append({**step, "state_group": step["state__group"]})
            for big_id, children in by_parent.items():
                big_tasks[str(big_id)] = summarize_steps(children, people)

        return Response({"parents": parents, "big_tasks": big_tasks}, status=status.HTTP_200_OK)


def _get_big_task(slug, project_id, issue_id):
    return (
        Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id)
        .select_related("project", "state")
        .first()
    )


def _estimate_point_id(project, weight):
    if weight is None or not project.estimate_id:
        return None
    for point in EstimatePoint.objects.filter(estimate_id=project.estimate_id, project_id=project.id):
        if estimate_weight(point.value) == weight:
            return point.id
    return None


def _resolve_performer(value, project_id):
    """None for «я», else the id of a people label of the project."""
    if value in (None, "", PERFORMER_ME):
        return None
    try:
        label_id = uuid.UUID(str(value))
    except ValueError:
        raise BigTaskInputError(PERFORMER_ERROR)
    label = Label.objects.filter(project_id=project_id, pk=label_id).select_related("parent").first()
    if label is None or label.parent is None or not is_people_parent_name(label.parent.name):
        raise BigTaskInputError(PERFORMER_ERROR)
    return label.id


class BigTaskNextStepEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        big_task = _get_big_task(slug, project_id, issue_id)
        if not big_task:
            return Response({"error": "Задача не найдена."}, status=status.HTTP_404_NOT_FOUND)
        if not is_big_task_state(big_task.state):
            return _bad_request("Задача не в колонке «💼 Big Tasks».")

        today = timezone.localdate()
        try:
            name = parse_step_name(request.data.get("name"))
            performer_label_id = _resolve_performer(request.data.get("performer", PERFORMER_ME), project_id)
            target_date = parse_step_date(request.data.get("target_date"), today) or next_working_day(today)
            weight = parse_weight(request.data.get("weight"))
        except BigTaskInputError as exc:
            return _bad_request(str(exc))

        project = big_task.project
        states = list(State.objects.filter(project_id=project_id))
        is_mine = performer_label_id is None
        state = pick_in_progress_state(states) if is_mine else pick_supervised_state(states)
        if state is None:
            return _bad_request(
                "В проекте нет состояния «В процессе»." if is_mine else "В проекте нет состояния «На контроле»."
            )

        parent_labels = list(
            IssueLabel.objects.filter(issue=big_task, label__deleted_at__isnull=True).values_list(
                "label_id", "label__name", "label__parent__name"
            )
        )
        module_ids = list(ModuleIssue.objects.filter(issue=big_task).values_list("module_id", flat=True))

        with transaction.atomic():
            setup_label_id = None if is_mine else resolve_mark_label(project_id, project.workspace_id, MARK_SETUP)
            data = {
                "name": name,
                "parent_id": str(big_task.id),
                "state_id": str(state.id),
                "assignee_ids": [str(request.user.id)],
                "label_ids": [str(i) for i in step_label_ids(parent_labels, performer_label_id, setup_label_id)],
                "target_date": target_date.isoformat(),
            }
            point_id = _estimate_point_id(project, weight)
            if point_id:
                data["estimate_point"] = str(point_id)
            serializer = IssueCreateSerializer(
                data=data,
                context={
                    "project_id": project_id,
                    "workspace_id": project.workspace_id,
                    "default_assignee_id": project.default_assignee_id,
                },
            )
            if not serializer.is_valid():
                transaction.set_rollback(True)
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            step = serializer.save()

            ModuleIssue.objects.bulk_create(
                [
                    ModuleIssue(
                        issue=step,
                        module_id=module_id,
                        project_id=project_id,
                        workspace_id=project.workspace_id,
                        created_by=request.user,
                        updated_by=request.user,
                    )
                    for module_id in module_ids
                ],
                batch_size=10,
                ignore_conflicts=True,
            )

            comment_serializer = IssueCommentSerializer(
                data={"comment_html": f"<p>＋ Следующий шаг: {escape(name)}</p>"}
            )
            comment_serializer.is_valid(raise_exception=True)
            comment_serializer.save(project_id=project_id, issue_id=big_task.id, actor=request.user)

        # Same trail as IssueViewSet.create: history, notifications, webhooks, description versions.
        origin = _emit("issue.activity.created", request, step.id, project_id, data, None)
        model_activity.delay(
            model_name="issue",
            model_id=str(step.id),
            requested_data=data,
            current_instance=None,
            actor_id=request.user.id,
            slug=slug,
            origin=origin,
        )
        issue_description_version_task.delay(
            updated_issue=json.dumps(data, cls=DjangoJSONEncoder),
            issue_id=str(step.id),
            user_id=request.user.id,
            is_creating=True,
        )
        for module_id in module_ids:
            _emit("module.activity.created", request, step.id, project_id, {"module_id": str(module_id)}, None)
        _emit(
            "comment.activity.created",
            request,
            big_task.id,
            project_id,
            comment_serializer.data,
            None,
        )
        model_activity.delay(
            model_name="issue_comment",
            model_id=str(comment_serializer.data["id"]),
            requested_data={"comment_html": comment_serializer.data.get("comment_html")},
            current_instance=None,
            actor_id=request.user.id,
            slug=slug,
            origin=origin,
        )

        step.refresh_from_db()
        return Response(
            {
                "id": str(step.id),
                "sequence_id": step.sequence_id,
                "name": step.name,
                "state_id": str(step.state_id),
                "target_date": step.target_date,
                "project_id": str(step.project_id),
                "parent_id": str(big_task.id),
                "estimate_point": str(step.estimate_point_id) if step.estimate_point_id else None,
            },
            status=status.HTTP_201_CREATED,
        )


class BigTaskListEndpoint(BaseAPIView):
    """Big tasks of one project: nearest final deadline first, then by number."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        state_ids = [s.id for s in State.objects.filter(project_id=project_id) if is_big_task_state(s)]
        if not state_ids:
            return Response([], status=status.HTTP_200_OK)
        rows = (
            Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, state_id__in=state_ids)
            .order_by(F("target_date").asc(nulls_last=True), "sequence_id")
            .values("id", "name", "sequence_id", "target_date")[:MAX_IDS]
        )
        return Response(list(rows), status=status.HTTP_200_OK)


class BigTaskCompleteEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        big_task = _get_big_task(slug, project_id, issue_id)
        if not big_task:
            return Response({"error": "Задача не найдена."}, status=status.HTTP_404_NOT_FOUND)
        state = pick_completed_state(State.objects.filter(project_id=project_id))
        if state is None:
            return _bad_request("В проекте нет состояния из группы «Завершено».")
        if state.id == big_task.state_id:
            return Response({"id": str(big_task.id), "state_id": str(state.id)}, status=status.HTTP_200_OK)

        current_instance = json.dumps({"state_id": str(big_task.state_id)}, cls=DjangoJSONEncoder)
        requested_data = {"state_id": str(state.id)}
        serializer = IssueCreateSerializer(
            big_task, data=requested_data, partial=True, context={"project_id": project_id}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()

        origin = _emit("issue.activity.updated", request, big_task.id, project_id, requested_data, current_instance)
        model_activity.delay(
            model_name="issue",
            model_id=str(big_task.id),
            requested_data=requested_data,
            current_instance=current_instance,
            actor_id=request.user.id,
            slug=slug,
            origin=origin,
        )
        return Response({"id": str(big_task.id), "state_id": str(state.id)}, status=status.HTTP_200_OK)

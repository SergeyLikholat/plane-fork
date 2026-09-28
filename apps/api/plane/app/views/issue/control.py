# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Control block of a supervised work item: «Обещал к», «Частота» and the
«Коснулся» action. Rules live in `plane.utils.control_touch`; this module
only reads rows, applies the decided changes and emits the usual activity.
"""

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

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
    IssueControl,
    IssueControlFrequency,
    IssueLabel,
    State,
)
from plane.utils.control_labels import resolve_mark_label
from plane.utils.control_touch import (
    MARK_LABELS,
    TouchInputError,
    append_to_description,
    build_comment_html,
    build_deliverable_html,
    detect_phase,
    estimate_weight,
    normalize_label_name,
    parse_frequency,
    parse_iso_date,
    parse_touch_payload,
    plan_touch,
    validate_outcome_for_phase,
)
from plane.utils.host import base_host

COMPLETED_GROUP = "completed"


def _get_issue(slug, project_id, issue_id):
    return (
        Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id)
        .select_related("project")
        .first()
    )


def _issue_labels(issue):
    """[(label_id, name)] currently attached to the issue."""
    return list(
        IssueLabel.objects.filter(issue=issue, label__deleted_at__isnull=True).values_list("label_id", "label__name")
    )


def _control_payload(issue, control, label_names):
    return {
        "promised_date": control.promised_date if control else None,
        "frequency": control.frequency if control else IssueControlFrequency.TWICE_WEEK,
        "no_progress_streak": control.no_progress_streak if control else 0,
        "last_touch_at": control.last_touch_at if control else None,
        "phase": detect_phase(label_names),
        "next_touch": issue.target_date,
    }


def _get_or_create_control(issue):
    """Live control row of the issue; revives a soft-deleted one if present."""
    control = IssueControl.all_objects.filter(issue=issue).first()
    if control is None:
        return IssueControl.objects.create(issue=issue, project_id=issue.project_id)
    if control.deleted_at is not None:
        control.deleted_at = None
        control.save(update_fields=["deleted_at", "updated_at"])
    return control


def _estimate_point_id(project, weight):
    if weight is None or not project.estimate_id:
        return None
    points = EstimatePoint.objects.filter(estimate_id=project.estimate_id, project_id=project.id)
    for point in points:
        if estimate_weight(point.value) == weight:
            return point.id
    return None


def _completed_state_id(project_id):
    state = State.objects.filter(project_id=project_id, group=COMPLETED_GROUP).order_by("sequence").first()
    return state.id if state else None


def _next_label_ids(labels, plan, issue):
    """Label ids after applying the plan's add/remove marks."""
    remove_matches = {MARK_LABELS[m]["match"] for m in plan.remove_marks}
    kept = [label_id for label_id, name in labels if normalize_label_name(name) not in remove_matches]
    present = {normalize_label_name(name) for label_id, name in labels if label_id in kept}
    added = [
        resolve_mark_label(issue.project_id, issue.workspace_id, mark)
        for mark in sorted(plan.add_marks)
        if MARK_LABELS[mark]["match"] not in present
    ]
    return [*kept, *[label_id for label_id in added if label_id not in kept]]


def _issue_fields(issue):
    return {
        "target_date": issue.target_date,
        "start_date": issue.start_date,
        "state_id": issue.state_id,
        "estimate_point": issue.estimate_point_id,
        "label_ids": [label_id for label_id, _ in _issue_labels(issue)],
        "description_html": issue.description_html,
    }


def _jsonable(data):
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


class IssueControlEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = _get_issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Задача не найдена."}, status=status.HTTP_404_NOT_FOUND)
        control = IssueControl.objects.filter(issue=issue).first()
        label_names = [name for _, name in _issue_labels(issue)]
        return Response(_control_payload(issue, control, label_names), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id):
        issue = _get_issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Задача не найдена."}, status=status.HTTP_404_NOT_FOUND)

        updates = {}
        try:
            if "promised_date" in request.data:
                updates["promised_date"] = parse_iso_date(request.data.get("promised_date"), "Обещал к")
            if "frequency" in request.data:
                updates["frequency"] = parse_frequency(request.data.get("frequency"))
        except TouchInputError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if not updates:
            return Response(
                {"error": "Нечего сохранять: передайте «Обещал к» или «Частоту»."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            control = _get_or_create_control(issue)
            for field, value in updates.items():
                setattr(control, field, value)
            control.save(update_fields=[*updates.keys(), "updated_at"])

        label_names = [name for _, name in _issue_labels(issue)]
        return Response(_control_payload(issue, control, label_names), status=status.HTTP_200_OK)


class IssueControlTouchEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        try:
            touch = parse_touch_payload(request.data)
        except TouchInputError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        issue = _get_issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Задача не найдена."}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.localdate()
        origin = base_host(request=request, is_app=True)

        labels = _issue_labels(issue)
        phase = detect_phase([name for _, name in labels])
        try:
            validate_outcome_for_phase(touch.outcome, phase)
        except TouchInputError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if touch.next_date is not None and touch.next_date < today:
            return Response(
                {"error": "Дата следующего действия не может быть в прошлом."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            control = _get_or_create_control(issue)
            plan = plan_touch(
                request=touch,
                today=today,
                frequency=control.frequency,
                streak=control.no_progress_streak,
                promised_date=control.promised_date,
                phase=phase,
            )

            current = _issue_fields(issue)
            requested = {}

            if plan.complete:
                state_id = _completed_state_id(project_id)
                if state_id is None:
                    return Response(
                        {"error": "В проекте нет состояния из группы «Завершено»."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if state_id != issue.state_id:
                    requested["state_id"] = state_id

            next_label_ids = _next_label_ids(labels, plan, issue)
            if set(next_label_ids) != set(current["label_ids"]):
                requested["label_ids"] = next_label_ids

            point_id = _estimate_point_id(issue.project, plan.estimate_weight)
            if point_id and point_id != issue.estimate_point_id:
                requested["estimate_point"] = point_id

            if plan.target_date and plan.target_date != issue.target_date:
                requested["target_date"] = plan.target_date
                if issue.start_date and issue.start_date > plan.target_date:
                    requested["start_date"] = None

            if plan.deliverable:
                requested["description_html"] = append_to_description(
                    issue.description_html, build_deliverable_html(plan.deliverable)
                )

            current_instance = json.dumps(current, cls=DjangoJSONEncoder)
            requested_data = _jsonable(requested)
            if requested:
                serializer = IssueCreateSerializer(
                    issue, data=requested_data, partial=True, context={"project_id": project_id}
                )
                if not serializer.is_valid():
                    transaction.set_rollback(True)
                    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
                serializer.save()

            comment_serializer = IssueCommentSerializer(
                data={"comment_html": build_comment_html(plan.headline, touch.comment, plan.detail)}
            )
            comment_serializer.is_valid(raise_exception=True)
            comment_serializer.save(project_id=project_id, issue_id=issue.id, actor=request.user)

            control.no_progress_streak = plan.streak
            control.promised_date = plan.promised_date
            control.last_touch_at = timezone.now()
            control_fields = ["no_progress_streak", "promised_date", "last_touch_at", "updated_at"]
            if plan.frequency:
                control.frequency = plan.frequency
                control_fields.append("frequency")
            control.save(update_fields=control_fields)

        epoch = int(timezone.now().timestamp())
        if requested:
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=json.dumps(requested_data),
                actor_id=str(request.user.id),
                issue_id=str(issue.id),
                project_id=str(project_id),
                current_instance=current_instance,
                epoch=epoch,
                notification=True,
                origin=origin,
            )
            model_activity.delay(
                model_name="issue",
                model_id=str(issue.id),
                requested_data=requested_data,
                current_instance=current_instance,
                actor_id=request.user.id,
                slug=slug,
                origin=origin,
            )
        if "description_html" in requested:
            # Same as a regular description edit: keep the version history in step.
            issue_description_version_task.delay(
                updated_issue=current_instance, issue_id=str(issue.id), user_id=request.user.id
            )
        issue_activity.delay(
            type="comment.activity.created",
            requested_data=json.dumps(comment_serializer.data, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue.id),
            project_id=str(project_id),
            current_instance=None,
            epoch=epoch,
            notification=True,
            origin=origin,
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

        issue.refresh_from_db()
        labels = _issue_labels(issue)
        return Response(
            {
                "control": _control_payload(issue, control, [name for _, name in labels]),
                "issue": _issue_fields(issue),
                "comment_id": comment_serializer.data["id"],
            },
            status=status.HTTP_200_OK,
        )

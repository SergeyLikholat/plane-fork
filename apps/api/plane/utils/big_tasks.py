# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Big tasks: a long piece of work lives in the «💼 Big Tasks» column and never
has a long plan — only one current step, a sub-issue. When a step closes the
owner is asked «какой следующий шаг?». This module holds the rules: which
state is Big Tasks, which states a new step goes to, which labels it inherits,
and the context («Ваша работа» captions, progress, current step).

The Big Tasks state is recognised by name (normalised, contains «big tasks»),
like «На контроле»: the data model carries no other signal.
"""

# Python imports
import re
from datetime import date
from typing import Iterable, Optional

# Module imports
from plane.utils.control_touch import MARK_LABELS, PHASE_MARKS, normalize_label_name

BIG_TASKS_STATE_NAME = "💼 Big Tasks"
BIG_TASKS_STATE_COLOR = "#7c3aed"
BIG_TASKS_MATCH = "big tasks"
STARTED_GROUP = "started"
SUPERVISED_GROUP = "supervised"
COMPLETED_GROUP = "completed"
CANCELLED_GROUP = "cancelled"
OPEN_GROUPS = ("backlog", "unstarted", STARTED_GROUP, SUPERVISED_GROUP)
IN_PROGRESS_MATCH = "в процессе"
SUPERVISED_MATCH = "контрол"
PEOPLE_PARENT_LABEL = "люди"
# Default place right after «In Progress» (35000) of a fresh project, before «Done» (45000).
DEFAULT_SEQUENCE = 40000
SEQUENCE_STEP = 1000
ALLOWED_WEIGHTS = (1, 2, 3, 5, 8, 13)
MAX_STEP_NAME = 255

_PHASE_MATCHES = {MARK_LABELS[mark]["match"] for mark in PHASE_MARKS}


class BigTaskInputError(ValueError):
    """Invalid request; the message is shown to the user as is."""


# --------------------------------------------------------------------------
# States
# --------------------------------------------------------------------------


def is_big_task_state_name(name: Optional[str]) -> bool:
    return BIG_TASKS_MATCH in normalize_label_name(name or "")


def is_big_task_state(state) -> bool:
    return state is not None and is_big_task_state_name(getattr(state, "name", None))


def _state_name_matches(state, needle: str) -> bool:
    return needle in (state.name or "").lower().replace("ё", "е")


def pick_in_progress_state(states: Iterable):
    """«В процессе» of a project, else the first `started` state that is not Big Tasks."""
    started = [s for s in states if s.group == STARTED_GROUP and not is_big_task_state(s)]
    started.sort(key=lambda s: s.sequence)
    named = next((s for s in started if _state_name_matches(s, IN_PROGRESS_MATCH)), None)
    return named or (started[0] if started else None)


def pick_supervised_state(states: Iterable):
    """«На контроле» of a project, else the first `supervised` state."""
    supervised = sorted((s for s in states if s.group == SUPERVISED_GROUP), key=lambda s: s.sequence)
    named = next((s for s in supervised if _state_name_matches(s, SUPERVISED_MATCH)), None)
    return named or (supervised[0] if supervised else None)


def pick_completed_state(states: Iterable):
    completed = sorted((s for s in states if s.group == COMPLETED_GROUP), key=lambda s: s.sequence)
    return completed[0] if completed else None


def big_tasks_sequence(states: Iterable) -> float:
    """Sequence right after «В процессе»: halfway to the next state, or a step further."""
    ordered = sorted((s for s in states if not is_big_task_state(s)), key=lambda s: s.sequence)
    anchor = pick_in_progress_state(ordered)
    if anchor is None:
        return DEFAULT_SEQUENCE
    following = [s.sequence for s in ordered if s.sequence > anchor.sequence]
    if following:
        return (anchor.sequence + following[0]) / 2
    return anchor.sequence + SEQUENCE_STEP


def ensure_big_tasks_state(project) -> str:
    """Create «💼 Big Tasks» in `project` unless a Big Tasks state already exists."""
    from plane.db.models import State

    states = list(State.objects.filter(project_id=project.id))
    if any(is_big_task_state(s) for s in states):
        return "ok"
    state = State.objects.create(
        name=BIG_TASKS_STATE_NAME,
        color=BIG_TASKS_STATE_COLOR,
        group=STARTED_GROUP,
        project_id=project.id,
        workspace_id=project.workspace_id,
    )
    # State.save() always appends at the end; put it next to «В процессе».
    State.objects.filter(pk=state.pk).update(sequence=big_tasks_sequence(states))
    return "created"


# --------------------------------------------------------------------------
# Labels
# --------------------------------------------------------------------------


def is_phase_label_name(name: Optional[str]) -> bool:
    return normalize_label_name(name or "") in _PHASE_MATCHES


def is_people_parent_name(name: Optional[str]) -> bool:
    return normalize_label_name(name or "") == PEOPLE_PARENT_LABEL


def step_label_ids(parent_labels, person_label_id=None, setup_label_id=None) -> list:
    """Labels a new step inherits from its Big task.

    `parent_labels` — [(label_id, name, parent_name)]. Phase labels and people
    are dropped (the step has its own phase and performer); the performer's
    label and the «Постановка» phase are added when given.
    """
    kept = [
        label_id
        for label_id, name, parent_name in parent_labels
        if not is_phase_label_name(name) and not is_people_parent_name(parent_name)
    ]
    for extra in (person_label_id, setup_label_id):
        if extra and extra not in kept:
            kept.append(extra)
    return kept


# --------------------------------------------------------------------------
# Request parsing
# --------------------------------------------------------------------------


def parse_step_name(value) -> str:
    name = (value or "").strip() if isinstance(value, str) else ""
    if not name:
        raise BigTaskInputError("Напишите, какой следующий шаг.")
    if len(name) > MAX_STEP_NAME:
        raise BigTaskInputError(f"Название шага длиннее {MAX_STEP_NAME} символов.")
    return name


def parse_weight(value) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        weight = int(value)
    except (TypeError, ValueError):
        raise BigTaskInputError("Вес — одно из чисел 1, 2, 3, 5, 8, 13.")
    if weight not in ALLOWED_WEIGHTS:
        raise BigTaskInputError("Вес — одно из чисел 1, 2, 3, 5, 8, 13.")
    return weight


def parse_step_date(value, today: date) -> Optional[date]:
    if value in (None, ""):
        return None
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise BigTaskInputError("«Когда» — дата в формате ГГГГ-ММ-ДД.")
    try:
        day = date.fromisoformat(value)
    except ValueError:
        raise BigTaskInputError("«Когда» — такой даты нет.")
    if day < today:
        raise BigTaskInputError("Дата шага не может быть в прошлом.")
    return day


# --------------------------------------------------------------------------
# Context
# --------------------------------------------------------------------------


def _sort_key(step):
    """Earliest target date first, undated last; ties by creation."""
    target = step["target_date"]
    return (target is None, target or date.max, step["created_at"])


def summarize_steps(steps, person_by_issue) -> dict:
    """Progress of one Big task from its children.

    `steps` — dicts with id, name, target_date, created_at, state_group;
    cancelled steps are not counted at all.
    """
    counted = [s for s in steps if s["state_group"] != CANCELLED_GROUP]
    done = [s for s in counted if s["state_group"] == COMPLETED_GROUP]
    open_steps = sorted((s for s in counted if s["state_group"] in OPEN_GROUPS), key=_sort_key)
    current = open_steps[0] if open_steps else None
    dated = [s["target_date"] for s in open_steps if s["target_date"]]
    return {
        "total": len(counted),
        "done": len(done),
        "open": len(open_steps),
        "current_step": (
            {
                "id": str(current["id"]),
                "name": current["name"],
                "target_date": current["target_date"],
                "state_group": current["state_group"],
                "person": person_by_issue.get(current["id"]),
            }
            if current
            else None
        ),
        "next_deadline": min(dated) if dated else None,
    }

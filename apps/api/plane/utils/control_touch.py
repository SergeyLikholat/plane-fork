# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
«Коснулся» — pure rules for touching a supervised work item.

A supervised item («📍 На контроле») is the owner's short action on someone
else's work. It goes through three phases, each a label: the briefing
(«🗣 Постановка» — explain the task, agree the deadline and the deliverable),
periodic checks («👁 Проверка») and the final acceptance («✅ Приёмка»).
Its `target_date` is the date of the next touch. Each touch records an
outcome and this module decides what changes: the next touch date, the
no-progress streak, the phase labels, the weight and whether the item gets
completed.

No Django imports on purpose: everything here is plain dates and strings, so
the rules are unit-testable without a database. The view resolves the
decisions (label keys, estimate weight, completion) into real rows.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, replace
from datetime import date, timedelta
from typing import Mapping, Optional

# Outcomes
ASSIGNED = "assigned"
PROGRESS = "progress"
NO_PROGRESS = "no_progress"
NEW_DEADLINE = "new_deadline"
SUBMITTED = "submitted"
ACCEPTED = "accepted"
RETURNED = "returned"
OUTCOMES = (ASSIGNED, PROGRESS, NO_PROGRESS, NEW_DEADLINE, SUBMITTED, ACCEPTED, RETURNED)

# Frequencies
DAILY = "daily"
TWICE_WEEK = "twice_week"
WEEKLY = "weekly"
FREQUENCIES = (DAILY, TWICE_WEEK, WEEKLY)

# Phases
PHASE_SETUP = "setup"
PHASE_CHECK = "check"
PHASE_ACCEPTANCE = "acceptance"

# Label keys (resolved to project labels by the view)
MARK_SETUP = "setup"
MARK_CHECK = "check"
MARK_ACCEPTANCE = "acceptance"
MARK_RISK = "risk"

# Canonical label per key: name to create when missing, colour, normalised match.
MARK_LABELS = {
    MARK_SETUP: {"name": "🗣 Постановка", "color": "#8b5cf6", "match": "постановка"},
    MARK_CHECK: {"name": "👁 Проверка", "color": "#0ea5e9", "match": "проверка"},
    MARK_ACCEPTANCE: {"name": "✅ Приёмка", "color": "#16a34a", "match": "приемка"},
    MARK_RISK: {"name": "🔥 риск", "color": "#dc2626", "match": "риск"},
}

# Two touches in a row without progress → daily touches plus the risk flag.
RISK_STREAK = 2
# The three phase labels, in cycle order.
PHASE_MARKS = (MARK_SETUP, MARK_CHECK, MARK_ACCEPTANCE)

# Estimate weights per phase: a check is a trifle; a briefing and an
# acceptance are average work.
SETUP_WEIGHT = 3
CHECK_WEIGHT = 1
ACCEPTANCE_WEIGHT = 3

SATURDAY = 5
TWICE_WEEK_DAYS = (0, 3)  # Monday, Thursday
WEEK = 7
MAX_COMMENT_LENGTH = 5000
MAX_DELIVERABLE_LENGTH = 1000

PHASE_TITLES = {PHASE_SETUP: "🗣 Постановка", PHASE_CHECK: "👁 Проверка", PHASE_ACCEPTANCE: "✅ Приёмка"}

# What the owner may record in each phase.
PHASE_OUTCOMES = {
    PHASE_SETUP: (ASSIGNED,),
    PHASE_CHECK: (PROGRESS, NO_PROGRESS, NEW_DEADLINE, SUBMITTED),
    PHASE_ACCEPTANCE: (ACCEPTED, RETURNED),
}
PHASE_OUTCOME_ERRORS = {
    PHASE_SETUP: "Задача на этапе «Постановка»: сначала отметьте «Поставил».",
    PHASE_CHECK: "Задача на этапе «Проверка»: доступны «Движется», «Без движения», «Новый срок» и «Сдал».",
    PHASE_ACCEPTANCE: "Задача на этапе «Приёмка»: доступны «Принял» и «Вернул».",
}


class TouchInputError(ValueError):
    """Invalid touch payload; the message is user-facing (Russian)."""


@dataclass(frozen=True)
class TouchRequest:
    outcome: str
    comment: str = ""
    promised_date: Optional[date] = None
    next_date: Optional[date] = None
    frequency: Optional[str] = None
    deliverable: str = ""


@dataclass(frozen=True)
class TouchPlan:
    """What a touch changes. `target_date is None` means keep the current one."""

    streak: int
    promised_date: Optional[date]
    target_date: Optional[date]
    phase: str
    add_marks: frozenset
    remove_marks: frozenset
    estimate_weight: Optional[int]
    complete: bool
    headline: str
    # Plain text after the bold headline (e.g. «что сдаёт: …»).
    detail: str = ""
    # New control frequency; None keeps the current one.
    frequency: Optional[str] = None
    # What the assignee delivers, to append to the description; "" = nothing.
    deliverable: str = ""


# --------------------------------------------------------------------------
# Label names
# --------------------------------------------------------------------------


def normalize_label_name(name: str) -> str:
    """Lowercase, `ё`→`е`, drop emoji/punctuation, collapse spaces.

    Mirrors `normalizeLabelName` in the web week-board weights.
    """
    value = (name or "").lower().replace("ё", "е")
    value = re.sub(r"[^\w:/ ]", "", value).replace("_", "")
    value = re.sub(r"\s*/\s*", "/", value)
    return re.sub(r"\s+", " ", value).strip()


def detect_phase(label_names) -> str:
    """Phase by labels: «Приёмка» > «Постановка» > «Проверка» (the default)."""
    normalized = {normalize_label_name(n) for n in label_names}
    if MARK_LABELS[MARK_ACCEPTANCE]["match"] in normalized:
        return PHASE_ACCEPTANCE
    if MARK_LABELS[MARK_SETUP]["match"] in normalized:
        return PHASE_SETUP
    return PHASE_CHECK


def has_phase_label(label_names) -> bool:
    normalized = {normalize_label_name(n) for n in label_names}
    return any(MARK_LABELS[mark]["match"] in normalized for mark in PHASE_MARKS)


def validate_outcome_for_phase(outcome: str, phase: str) -> None:
    """Reject an outcome that makes no sense in the current phase."""
    if outcome not in PHASE_OUTCOMES.get(phase, ()):
        raise TouchInputError(PHASE_OUTCOME_ERRORS.get(phase, "Этот исход недоступен на текущем этапе."))


def estimate_weight(value: Optional[str]) -> Optional[int]:
    """Leading integer of an estimate value ("13 · разбить" → 13)."""
    match = re.match(r"\s*(\d+)", value or "")
    return int(match.group(1)) if match else None


# --------------------------------------------------------------------------
# Dates
# --------------------------------------------------------------------------


def is_weekend(day: date) -> bool:
    return day.weekday() >= SATURDAY


def shift_forward_to_working_day(day: date) -> date:
    while is_weekend(day):
        day += timedelta(days=1)
    return day


def shift_back_to_working_day(day: date) -> date:
    while is_weekend(day):
        day -= timedelta(days=1)
    return day


def next_working_day(today: date) -> date:
    return shift_forward_to_working_day(today + timedelta(days=1))


def _next_twice_week_day(today: date) -> date:
    day = today + timedelta(days=1)
    while day.weekday() not in TWICE_WEEK_DAYS:
        day += timedelta(days=1)
    return day


def _by_frequency(today: date, frequency: str) -> date:
    if frequency == DAILY:
        return next_working_day(today)
    if frequency == WEEKLY:
        return shift_forward_to_working_day(today + timedelta(days=WEEK))
    return _next_twice_week_day(today)


def compute_next_touch(today: date, frequency: str, promised_date: Optional[date] = None) -> date:
    """Date of the next touch strictly after `today`.

    The frequency gives a candidate (daily → next working day, twice a week →
    next Monday/Thursday, weekly → a week later). A promised deadline adds
    two mandatory touches — the working day before it and the deadline day
    itself (weekend days shifted back to Friday) — and the earliest of them
    still ahead wins. An overdue promise means touching every working day.
    """
    if promised_date is not None and promised_date <= today:
        return next_working_day(today)

    candidate = _by_frequency(today, frequency)
    if promised_date is None:
        return candidate

    mandatory = (
        shift_back_to_working_day(promised_date - timedelta(days=1)),
        shift_back_to_working_day(promised_date),
    )
    ahead = [day for day in mandatory if day > today]
    return min([candidate, *ahead])


# --------------------------------------------------------------------------
# Payload
# --------------------------------------------------------------------------


def parse_iso_date(value, field_label: str) -> Optional[date]:
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise TouchInputError(f"Поле «{field_label}»: нужна дата в формате ГГГГ-ММ-ДД.")
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError as exc:
        raise TouchInputError(f"Поле «{field_label}»: нужна дата в формате ГГГГ-ММ-ДД.") from exc


def parse_frequency(value) -> str:
    if value not in FREQUENCIES:
        raise TouchInputError("Частота должна быть одной из: каждый день, 2 раза в неделю, раз в неделю.")
    return value


def parse_touch_payload(data: Mapping) -> TouchRequest:
    outcome = data.get("outcome")
    if outcome not in OUTCOMES:
        raise TouchInputError("Не указан исход касания или он неизвестен.")

    comment = data.get("comment") or ""
    if not isinstance(comment, str):
        raise TouchInputError("Комментарий должен быть текстом.")
    comment = comment.strip()
    if len(comment) > MAX_COMMENT_LENGTH:
        raise TouchInputError(f"Комментарий длиннее {MAX_COMMENT_LENGTH} символов.")

    promised_date = parse_iso_date(data.get("promised_date"), "Обещал к")
    next_date = parse_iso_date(data.get("next_date"), "Следующее касание")

    if outcome in (NEW_DEADLINE, RETURNED) and promised_date is None:
        raise TouchInputError("Укажите новый срок: к какому дню обещал.")
    if outcome == ASSIGNED and promised_date is None:
        raise TouchInputError("Укажите срок: к какому дню обещал сдать.")

    frequency = data.get("frequency")
    frequency = parse_frequency(frequency) if frequency not in (None, "") else None
    deliverable = _parse_deliverable(data.get("deliverable"))

    return TouchRequest(
        outcome=outcome,
        comment=comment,
        promised_date=promised_date,
        next_date=next_date,
        frequency=frequency,
        deliverable=deliverable,
    )


def _parse_deliverable(value) -> str:
    if value in (None, ""):
        return ""
    if not isinstance(value, str):
        raise TouchInputError("«Что сдаёт» должно быть текстом.")
    value = value.strip()
    if len(value) > MAX_DELIVERABLE_LENGTH:
        raise TouchInputError(f"«Что сдаёт» длиннее {MAX_DELIVERABLE_LENGTH} символов.")
    return value


# --------------------------------------------------------------------------
# Plan
# --------------------------------------------------------------------------


def _fmt(day: date) -> str:
    return day.strftime("%d.%m")


def outcome_title(outcome: str, promised_date: Optional[date]) -> str:
    titles = {
        PROGRESS: "движется",
        NO_PROGRESS: "без движения",
        SUBMITTED: "сдал на приёмку",
        ACCEPTED: "принято",
    }
    if outcome == ASSIGNED:
        return f"поставлено, срок {_fmt(promised_date)}"
    if outcome == NEW_DEADLINE:
        return f"новый срок {_fmt(promised_date)}"
    if outcome == RETURNED:
        return f"возвращено на доработку до {_fmt(promised_date)}"
    return titles[outcome]


def _plan_auto(
    *,
    request: TouchRequest,
    today: date,
    frequency: str,
    streak: int,
    promised_date: Optional[date],
    phase: str,
) -> TouchPlan:
    """Effects of a touch with the automatic next date. Pure: no I/O, no clock."""
    outcome = request.outcome
    headline = f"{PHASE_TITLES.get(phase, PHASE_TITLES[PHASE_CHECK])} · {outcome_title(outcome, request.promised_date)}"
    base = {
        "streak": streak,
        "promised_date": promised_date,
        "target_date": None,
        "phase": phase,
        "add_marks": frozenset(),
        "remove_marks": frozenset(),
        "estimate_weight": None,
        "complete": False,
        "headline": headline,
    }

    if outcome == ASSIGNED:
        effective = request.frequency or frequency
        return TouchPlan(
            **{
                **base,
                "streak": 0,
                "phase": PHASE_CHECK,
                "promised_date": request.promised_date,
                "target_date": compute_next_touch(today, effective, request.promised_date),
                "add_marks": frozenset({MARK_CHECK}),
                "remove_marks": frozenset({MARK_SETUP}),
                "estimate_weight": CHECK_WEIGHT,
                "detail": f"что сдаёт: {request.deliverable}" if request.deliverable else "",
                "frequency": request.frequency,
                "deliverable": request.deliverable,
            }
        )

    if outcome == PROGRESS:
        return TouchPlan(**{**base, "streak": 0, "target_date": compute_next_touch(today, frequency, promised_date)})

    if outcome == NO_PROGRESS:
        new_streak = streak + 1
        at_risk = new_streak >= RISK_STREAK
        effective = DAILY if at_risk else frequency
        return TouchPlan(
            **{
                **base,
                "streak": new_streak,
                "target_date": compute_next_touch(today, effective, promised_date),
                "add_marks": frozenset({MARK_RISK}) if at_risk else frozenset(),
            }
        )

    if outcome == NEW_DEADLINE:
        return TouchPlan(
            **{
                **base,
                "streak": 0,
                "promised_date": request.promised_date,
                "target_date": compute_next_touch(today, frequency, request.promised_date),
                "remove_marks": frozenset({MARK_RISK}),
            }
        )

    if outcome == SUBMITTED:
        return TouchPlan(
            **{
                **base,
                "streak": 0,
                "phase": PHASE_ACCEPTANCE,
                "target_date": request.next_date or next_working_day(today),
                "add_marks": frozenset({MARK_ACCEPTANCE}),
                "remove_marks": frozenset({MARK_CHECK}),
                "estimate_weight": ACCEPTANCE_WEIGHT,
            }
        )

    if outcome == ACCEPTED:
        return TouchPlan(**{**base, "streak": 0, "remove_marks": frozenset({MARK_RISK}), "complete": True})

    # RETURNED
    return TouchPlan(
        **{
            **base,
            "streak": 0,
            "phase": PHASE_CHECK,
            "promised_date": request.promised_date,
            "target_date": compute_next_touch(today, frequency, request.promised_date),
            "add_marks": frozenset({MARK_CHECK}),
            "remove_marks": frozenset({MARK_ACCEPTANCE}),
            "estimate_weight": CHECK_WEIGHT,
        }
    )


def _escape_lines(text: str) -> str:
    return "<br />".join(html.escape(line) for line in text.splitlines())


def build_comment_html(headline: str, comment: str = "", detail: str = "") -> str:
    """Comment body: bold headline, then the escaped detail and free-text answer."""
    parts = [f"<strong>{html.escape(headline)}</strong>"]
    parts += [_escape_lines(text) for text in (detail, comment) if text]
    return f"<p>{' — '.join(parts)}</p>"


def build_deliverable_html(deliverable: str) -> str:
    """Paragraph appended to the description: what the assignee delivers."""
    return f"<p><strong>Что сдаёт:</strong> {_escape_lines(deliverable)}</p>"


EMPTY_DESCRIPTIONS = ("", "<p></p>")


def append_to_description(description_html: Optional[str], fragment: str) -> str:
    current = (description_html or "").strip()
    return fragment if current in EMPTY_DESCRIPTIONS else f"{current}{fragment}"


def plan_touch(
    *,
    request: TouchRequest,
    today: date,
    frequency: str,
    streak: int,
    promised_date: Optional[date],
    phase: str,
) -> TouchPlan:
    """Decide the effects of a touch. A date picked by hand in the modal
    (`next_date`) wins over the automatic one — the owner controls the rhythm;
    the rules only propose. Closing outcomes keep their own date logic."""
    plan = _plan_auto(
        request=request,
        today=today,
        frequency=frequency,
        streak=streak,
        promised_date=promised_date,
        phase=phase,
    )
    if request.next_date is None or plan.complete or plan.target_date is None:
        return plan
    return replace(plan, target_date=request.next_date)

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import date, datetime
from types import SimpleNamespace

import pytest

from plane.utils.big_tasks import (
    DEFAULT_SEQUENCE,
    BigTaskInputError,
    big_tasks_sequence,
    is_big_task_state_name,
    parse_step_date,
    parse_step_name,
    parse_weight,
    pick_completed_state,
    pick_in_progress_state,
    pick_supervised_state,
    step_label_ids,
    summarize_steps,
)

TODAY = date(2026, 9, 28)


def _state(name, group, sequence):
    return SimpleNamespace(name=name, group=group, sequence=sequence)


LIVE_STATES = [
    _state("📩 Входящие", "backlog", 15000),
    _state("🗃 Бэклог", "unstarted", 25000),
    _state("📌 В процессе (WIP ≤ 3)", "started", 35000),
    _state("Завершено", "completed", 45000),
    _state("Отменено", "cancelled", 55000),
    _state("📍 На контроле", "supervised", 70000),
    _state("⌛ Может быть", "supervised", 135535),
]


@pytest.mark.unit
class TestStates:
    @pytest.mark.parametrize("name", ["💼 Big Tasks", "big tasks", "BIG TASKS", "Big  Tasks!"])
    def test_big_task_names(self, name):
        assert is_big_task_state_name(name)

    @pytest.mark.parametrize("name", [None, "", "📌 В процессе", "Big task", "Tasks"])
    def test_other_names(self, name):
        assert not is_big_task_state_name(name)

    def test_in_progress_by_name_skips_big_tasks(self):
        states = [_state("💼 Big Tasks", "started", 1000), *LIVE_STATES]
        assert pick_in_progress_state(states).name == "📌 В процессе (WIP ≤ 3)"

    def test_in_progress_falls_back_to_first_started(self):
        states = [_state("💼 Big Tasks", "started", 1000), _state("In Progress", "started", 35000)]
        assert pick_in_progress_state(states).name == "In Progress"

    def test_in_progress_missing(self):
        assert pick_in_progress_state([_state("💼 Big Tasks", "started", 1)]) is None

    def test_supervised_prefers_na_kontrole(self):
        states = list(reversed(LIVE_STATES))
        assert pick_supervised_state(states).name == "📍 На контроле"

    def test_completed_lowest_sequence(self):
        states = [_state("Готово позже", "completed", 90000), _state("✅ Готово", "completed", 50000)]
        assert pick_completed_state(states).name == "✅ Готово"

    def test_sequence_halfway_after_na_kontrole(self):
        # Right after «На контроле» (70000), halfway to «Может быть» (135535).
        assert big_tasks_sequence(LIVE_STATES) == (70000 + 135535) / 2

    def test_sequence_falls_back_to_in_progress(self):
        states = [_state("📌 В процессе", "started", 35000), _state("Завершено", "completed", 45000)]
        assert big_tasks_sequence(states) == 40000

    def test_sequence_when_in_progress_is_last(self):
        assert big_tasks_sequence([_state("В процессе", "started", 35000)]) == 36000

    def test_sequence_for_empty_project(self):
        assert big_tasks_sequence([]) == DEFAULT_SEQUENCE


@pytest.mark.unit
class TestStepLabels:
    LABELS = [
        ("cal", "cal:Работа над проектом", None),
        ("org", "КСР", "ОРГАНИЗАЦИИ"),
        ("person", "Фурсов А.", "ЛЮДИ"),
        ("setup", "🗣 Постановка", None),
        ("check", "👁 Проверка", None),
        ("accept", "✅ Приёмка", None),
    ]

    def test_drops_phases_and_people(self):
        assert step_label_ids(self.LABELS) == ["cal", "org"]

    def test_adds_performer_and_setup(self):
        assert step_label_ids(self.LABELS, "ivanov", "setup-new") == ["cal", "org", "ivanov", "setup-new"]

    def test_no_duplicates(self):
        assert step_label_ids([("cal", "cal:x", None)], "cal") == ["cal"]


@pytest.mark.unit
class TestParsing:
    def test_name_trimmed(self):
        assert parse_step_name("  Позвонить  ") == "Позвонить"

    @pytest.mark.parametrize("value", [None, "", "   ", 5, "x" * 256])
    def test_name_rejected(self, value):
        with pytest.raises(BigTaskInputError):
            parse_step_name(value)

    @pytest.mark.parametrize("value,expected", [(None, None), ("", None), (3, 3), ("13", 13)])
    def test_weight(self, value, expected):
        assert parse_weight(value) == expected

    @pytest.mark.parametrize("value", [4, "0", "abc", 21])
    def test_weight_rejected(self, value):
        with pytest.raises(BigTaskInputError):
            parse_weight(value)

    def test_date(self):
        assert parse_step_date("2026-10-01", TODAY) == date(2026, 10, 1)
        assert parse_step_date(None, TODAY) is None
        assert parse_step_date("2026-09-28", TODAY) == TODAY

    @pytest.mark.parametrize("value", ["2026-09-27", "01.10.2026", "2026-02-30", 20261001])
    def test_date_rejected(self, value):
        with pytest.raises(BigTaskInputError):
            parse_step_date(value, TODAY)


def _step(sid, group, target=None, created=1):
    return {
        "id": sid,
        "name": f"Шаг {sid}",
        "target_date": target,
        "created_at": datetime(2026, 9, created),
        "state_group": group,
    }


@pytest.mark.unit
class TestSummarizeSteps:
    def test_no_steps(self):
        summary = summarize_steps([], {})
        assert summary == {"total": 0, "done": 0, "open": 0, "current_step": None, "next_deadline": None}

    def test_current_is_earliest_dated_open_step(self):
        steps = [
            _step("a", "completed", date(2026, 9, 1)),
            _step("b", "started", None, created=1),
            _step("c", "supervised", date(2026, 10, 3)),
            _step("d", "started", date(2026, 10, 1)),
            _step("e", "cancelled", date(2026, 9, 2)),
        ]
        summary = summarize_steps(steps, {"d": "Фурсов А."})
        assert (summary["total"], summary["done"], summary["open"]) == (4, 1, 3)
        assert summary["current_step"]["id"] == "d"
        assert summary["current_step"]["person"] == "Фурсов А."
        assert summary["next_deadline"] == date(2026, 10, 1)

    def test_undated_open_step_when_nothing_dated(self):
        steps = [_step("late", "backlog", created=5), _step("early", "unstarted", created=2)]
        summary = summarize_steps(steps, {})
        assert summary["current_step"]["id"] == "early"
        assert summary["current_step"]["person"] is None
        assert summary["next_deadline"] is None

    def test_all_done_means_no_current_step(self):
        summary = summarize_steps([_step("a", "completed"), _step("b", "completed")], {})
        assert summary["current_step"] is None
        assert (summary["done"], summary["open"]) == (2, 0)

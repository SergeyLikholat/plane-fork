# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import date

import pytest

from plane.utils.control_touch import (
    ACCEPTANCE_WEIGHT,
    CHECK_WEIGHT,
    DAILY,
    MARK_ACCEPTANCE,
    MARK_CHECK,
    MARK_RISK,
    MARK_SETUP,
    PHASE_ACCEPTANCE,
    PHASE_CHECK,
    PHASE_SETUP,
    TWICE_WEEK,
    WEEKLY,
    TouchInputError,
    TouchRequest,
    append_to_description,
    build_comment_html,
    build_deliverable_html,
    compute_next_touch,
    detect_phase,
    estimate_weight,
    has_phase_label,
    next_working_day,
    normalize_label_name,
    parse_touch_payload,
    plan_touch,
    validate_outcome_for_phase,
)

# 2026-09-28 is a Monday.
MON = date(2026, 9, 28)
TUE = date(2026, 9, 29)
WED = date(2026, 9, 30)
THU = date(2026, 10, 1)
FRI = date(2026, 10, 2)
SAT = date(2026, 10, 3)
SUN = date(2026, 10, 4)
NEXT_MON = date(2026, 10, 5)
NEXT_TUE = date(2026, 10, 6)
NEXT_WED = date(2026, 10, 7)
NEXT_THU = date(2026, 10, 8)
NEXT_FRI = date(2026, 10, 9)


def _plan(outcome, *, today=MON, frequency=TWICE_WEEK, streak=0, promised=None, phase=PHASE_CHECK, **req):
    return plan_touch(
        request=TouchRequest(outcome=outcome, **req),
        today=today,
        frequency=frequency,
        streak=streak,
        promised_date=promised,
        phase=phase,
    )


@pytest.mark.unit
class TestNextTouchByFrequency:
    def test_daily_goes_to_next_working_day(self):
        assert compute_next_touch(MON, DAILY) == TUE

    def test_daily_on_friday_skips_weekend(self):
        assert compute_next_touch(FRI, DAILY) == NEXT_MON

    def test_daily_from_saturday_is_monday(self):
        assert next_working_day(SAT) == NEXT_MON

    def test_twice_week_monday_goes_to_thursday(self):
        assert compute_next_touch(MON, TWICE_WEEK) == THU

    def test_twice_week_thursday_goes_to_next_monday(self):
        assert compute_next_touch(THU, TWICE_WEEK) == NEXT_MON

    def test_twice_week_is_strictly_after_today(self):
        assert compute_next_touch(WED, TWICE_WEEK) == THU

    def test_weekly_is_seven_days_later(self):
        assert compute_next_touch(TUE, WEEKLY) == NEXT_TUE

    def test_weekly_from_saturday_shifts_to_monday(self):
        assert compute_next_touch(SAT, WEEKLY) == date(2026, 10, 12)


@pytest.mark.unit
class TestNextTouchWithPromise:
    def test_day_before_promise_clamps_candidate(self):
        # Weekly would give next Monday; promise on Thursday → touch Wednesday.
        assert compute_next_touch(MON, WEEKLY, THU) == WED

    def test_promise_day_itself_when_day_before_passed(self):
        assert compute_next_touch(WED, WEEKLY, THU) == THU

    def test_promise_far_away_keeps_candidate(self):
        assert compute_next_touch(MON, TWICE_WEEK, NEXT_FRI) == THU

    def test_promise_on_monday_touches_friday_before(self):
        # Day before Monday is Sunday → shifted back to Friday.
        assert compute_next_touch(WED, WEEKLY, NEXT_MON) == FRI

    def test_promise_on_saturday_counts_as_friday(self):
        assert compute_next_touch(WED, WEEKLY, SAT) == FRI

    def test_overdue_promise_touches_next_working_day(self):
        assert compute_next_touch(WED, WEEKLY, TUE) == THU

    def test_promise_today_is_overdue(self):
        assert compute_next_touch(FRI, WEEKLY, FRI) == NEXT_MON

    def test_all_mandatory_days_passed_keeps_candidate(self):
        # Today Friday, promised Sunday → both mandatory days collapse to Friday.
        assert compute_next_touch(FRI, TWICE_WEEK, SUN) == NEXT_MON


@pytest.mark.unit
class TestPlanTouch:
    def test_progress_resets_streak_and_reschedules(self):
        plan = _plan("progress", streak=1)
        assert plan.streak == 0
        assert plan.target_date == THU
        assert plan.headline == "👁 Проверка · движется"

    def test_first_no_progress_keeps_frequency(self):
        plan = _plan("no_progress")
        assert plan.streak == 1
        assert plan.target_date == THU
        assert plan.add_marks == frozenset()

    def test_second_no_progress_goes_daily_and_flags_risk(self):
        plan = _plan("no_progress", streak=1)
        assert plan.streak == 2
        assert plan.target_date == TUE
        assert plan.add_marks == frozenset({MARK_RISK})

    def test_new_deadline_sets_promise_and_clears_risk(self):
        plan = _plan("new_deadline", streak=3, promised_date=WED)
        assert plan.promised_date == WED
        assert plan.streak == 0
        assert plan.target_date == TUE
        assert plan.remove_marks == frozenset({MARK_RISK})
        assert plan.headline == "👁 Проверка · новый срок 30.09"

    def test_submitted_moves_to_acceptance(self):
        plan = _plan("submitted")
        assert plan.phase == PHASE_ACCEPTANCE
        assert plan.add_marks == frozenset({MARK_ACCEPTANCE})
        assert plan.remove_marks == frozenset({MARK_CHECK})
        assert plan.estimate_weight == ACCEPTANCE_WEIGHT
        assert plan.target_date == TUE

    def test_submitted_uses_explicit_next_date(self):
        assert _plan("submitted", next_date=FRI).target_date == FRI

    def test_accepted_completes_and_keeps_date(self):
        plan = _plan("accepted", phase=PHASE_ACCEPTANCE)
        assert plan.complete is True
        assert plan.target_date is None
        assert plan.remove_marks == frozenset({MARK_RISK})
        assert plan.headline == "✅ Приёмка · принято"

    def test_assigned_moves_setup_to_check(self):
        plan = _plan("assigned", phase=PHASE_SETUP, streak=2, promised_date=NEXT_FRI)
        assert plan.phase == PHASE_CHECK
        assert plan.add_marks == frozenset({MARK_CHECK})
        assert plan.remove_marks == frozenset({MARK_SETUP})
        assert plan.estimate_weight == CHECK_WEIGHT
        assert plan.streak == 0
        assert plan.promised_date == NEXT_FRI
        assert plan.target_date == THU
        assert plan.frequency is None
        assert plan.headline == "🗣 Постановка · поставлено, срок 09.10"
        assert plan.detail == ""

    def test_assigned_uses_new_frequency_and_deliverable(self):
        plan = plan_touch(
            request=TouchRequest(
                outcome="assigned", promised_date=NEXT_FRI, frequency=DAILY, deliverable="таблица отверстий"
            ),
            today=MON,
            frequency=WEEKLY,
            streak=0,
            promised_date=None,
            phase=PHASE_SETUP,
        )
        assert plan.frequency == DAILY
        assert plan.target_date == TUE
        assert plan.deliverable == "таблица отверстий"
        assert plan.detail == "что сдаёт: таблица отверстий"

    def test_returned_goes_back_to_check_with_new_promise(self):
        plan = _plan("returned", phase=PHASE_ACCEPTANCE, promised_date=NEXT_THU)
        assert plan.phase == PHASE_CHECK
        assert plan.add_marks == frozenset({MARK_CHECK})
        assert plan.remove_marks == frozenset({MARK_ACCEPTANCE})
        assert plan.estimate_weight == CHECK_WEIGHT
        assert plan.promised_date == NEXT_THU
        assert plan.target_date == THU
        assert plan.headline == "✅ Приёмка · возвращено на доработку до 08.10"


@pytest.mark.unit
class TestPayload:
    def test_valid_payload(self):
        req = parse_touch_payload({"outcome": "new_deadline", "promised_date": "2026-10-08", "comment": " ok "})
        assert req.promised_date == NEXT_THU
        assert req.comment == "ok"

    @pytest.mark.parametrize("data", [{}, {"outcome": "bogus"}])
    def test_unknown_outcome_rejected(self, data):
        with pytest.raises(TouchInputError):
            parse_touch_payload(data)

    @pytest.mark.parametrize("outcome", ["new_deadline", "returned"])
    def test_deadline_outcomes_require_promise(self, outcome):
        with pytest.raises(TouchInputError):
            parse_touch_payload({"outcome": outcome})

    def test_assigned_requires_promise(self):
        with pytest.raises(TouchInputError, match="срок"):
            parse_touch_payload({"outcome": "assigned"})

    def test_assigned_payload_with_frequency_and_deliverable(self):
        req = parse_touch_payload(
            {"outcome": "assigned", "promised_date": "2026-10-09", "frequency": "weekly", "deliverable": " смета "}
        )
        assert req.frequency == WEEKLY
        assert req.deliverable == "смета"

    def test_bad_frequency_rejected(self):
        with pytest.raises(TouchInputError):
            parse_touch_payload({"outcome": "assigned", "promised_date": "2026-10-09", "frequency": "hourly"})

    def test_long_deliverable_rejected(self):
        with pytest.raises(TouchInputError, match="1000"):
            parse_touch_payload({"outcome": "assigned", "promised_date": "2026-10-09", "deliverable": "х" * 1001})

    def test_non_text_deliverable_rejected(self):
        with pytest.raises(TouchInputError):
            parse_touch_payload({"outcome": "assigned", "promised_date": "2026-10-09", "deliverable": ["a"]})

    def test_bad_date_rejected(self):
        with pytest.raises(TouchInputError):
            parse_touch_payload({"outcome": "progress", "next_date": "08.10.2026"})


@pytest.mark.unit
class TestHelpers:
    def test_normalize_label_name(self):
        assert normalize_label_name("✅ Приёмка") == "приемка"
        assert normalize_label_name("👁  Проверка ") == "проверка"

    def test_detect_phase(self):
        assert detect_phase(["Фурсов А.", "✅ Приёмка"]) == PHASE_ACCEPTANCE
        assert detect_phase(["👁 Проверка"]) == PHASE_CHECK
        assert detect_phase(["🗣 Постановка"]) == PHASE_SETUP
        assert detect_phase([]) == PHASE_CHECK

    def test_detect_phase_precedence(self):
        assert detect_phase(["🗣 Постановка", "✅ Приёмка"]) == PHASE_ACCEPTANCE
        assert detect_phase(["👁 Проверка", "Постановка"]) == PHASE_SETUP

    def test_has_phase_label(self):
        assert has_phase_label(["постановка"]) is True
        assert has_phase_label(["Фурсов А.", "🔥 риск"]) is False

    @pytest.mark.parametrize(
        "phase,allowed",
        [
            (PHASE_SETUP, ["assigned"]),
            (PHASE_CHECK, ["progress", "no_progress", "new_deadline", "submitted"]),
            (PHASE_ACCEPTANCE, ["accepted", "returned"]),
        ],
    )
    def test_outcomes_per_phase(self, phase, allowed):
        all_outcomes = ["assigned", "progress", "no_progress", "new_deadline", "submitted", "accepted", "returned"]
        for outcome in all_outcomes:
            if outcome in allowed:
                validate_outcome_for_phase(outcome, phase)
            else:
                with pytest.raises(TouchInputError):
                    validate_outcome_for_phase(outcome, phase)

    def test_estimate_weight_does_not_confuse_13_with_1(self):
        assert estimate_weight("13 · разбить") == 13
        assert estimate_weight("1 · пустяк") == 1
        assert estimate_weight("") is None

    def test_comment_is_escaped(self):
        html = build_comment_html("👁 Проверка · движется", "<b>да</b>\nзавтра")
        assert html == "<p><strong>👁 Проверка · движется</strong> — &lt;b&gt;да&lt;/b&gt;<br />завтра</p>"

    def test_comment_with_detail(self):
        html = build_comment_html("🗣 Постановка · поставлено, срок 09.10", "договорились", "что сдаёт: <смета>")
        assert html == (
            "<p><strong>🗣 Постановка · поставлено, срок 09.10</strong> — что сдаёт: &lt;смета&gt; — договорились</p>"
        )

    def test_deliverable_html_is_escaped(self):
        assert build_deliverable_html("a & b\nc") == "<p><strong>Что сдаёт:</strong> a &amp; b<br />c</p>"

    @pytest.mark.parametrize("current", [None, "", "<p></p>", "  "])
    def test_append_to_empty_description_replaces_it(self, current):
        assert append_to_description(current, "<p>x</p>") == "<p>x</p>"

    def test_append_to_description_keeps_existing(self):
        assert append_to_description("<p>a</p>", "<p>x</p>") == "<p>a</p><p>x</p>"

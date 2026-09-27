# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import date

import pytest

from plane.utils.day_capacity import (
    DayCapacityError,
    DayCapacityPatch,
    apply_patch,
    normalize_weekday_limits,
    parse_patch,
    prune_overrides,
)

TODAY = date(2026, 9, 28)


@pytest.mark.unit
class TestParsePatch:
    def test_weekday_limits(self):
        assert parse_patch({"weekday_limits": [1, 2, 3, 4, 5, 0, 40]}).weekday_limits == [1, 2, 3, 4, 5, 0, 40]

    @pytest.mark.parametrize(
        "value",
        [[13] * 6, [13] * 8, "13", [13, 13, 13, 13, 13, 13, 41], [13, 13, 13, 13, 13, 13, -1], [True] + [13] * 6],
    )
    def test_weekday_limits_rejected(self, value):
        with pytest.raises(DayCapacityError):
            parse_patch({"weekday_limits": value})

    def test_set_override(self):
        assert parse_patch({"set_override": {"date": "2026-09-29", "limit": 5}}).set_override == ("2026-09-29", 5)

    @pytest.mark.parametrize(
        "value",
        [
            {"date": "2026-9-29", "limit": 5},
            {"date": "2026-02-30", "limit": 5},
            {"date": "2026-09-29", "limit": 5.5},
            {"date": "2026-09-29", "limit": "5"},
            {"date": "2026-09-29"},
            "2026-09-29",
        ],
    )
    def test_set_override_rejected(self, value):
        with pytest.raises(DayCapacityError):
            parse_patch({"set_override": value})

    def test_clear_override(self):
        assert parse_patch({"clear_override": "2026-09-29"}).clear_override == "2026-09-29"

    @pytest.mark.parametrize("data", [{}, {"other": 1}, [1], None, {"clear_override": "вчера"}])
    def test_rejected(self, data):
        with pytest.raises(DayCapacityError):
            parse_patch(data)


@pytest.mark.unit
class TestApplyPatch:
    def test_set_does_not_touch_template_or_input(self):
        overrides = {"2026-09-30": 8}
        weekdays, result = apply_patch([13] * 7, overrides, DayCapacityPatch(set_override=("2026-09-29", 0)), TODAY)
        assert weekdays == [13] * 7
        assert result == {"2026-09-29": 0, "2026-09-30": 8}
        assert overrides == {"2026-09-30": 8}

    def test_clear_then_set(self):
        patch = DayCapacityPatch(clear_override="2026-09-29", set_override=("2026-09-29", 3))
        assert apply_patch(None, {"2026-09-29": 8}, patch, TODAY)[1] == {"2026-09-29": 3}

    def test_clear_missing_is_noop(self):
        assert apply_patch(None, {}, DayCapacityPatch(clear_override="2026-09-29"), TODAY)[1] == {}

    def test_malformed_stored_template_falls_back(self):
        weekdays, _ = apply_patch("junk", None, DayCapacityPatch(clear_override="2026-09-29"), TODAY)
        assert weekdays == [13] * 7


@pytest.mark.unit
class TestPrune:
    def test_drops_older_than_60_days_and_junk(self):
        overrides = {"2026-07-30": 1, "2026-07-29": 2, "bad": 3, "2026-10-01": 99, "2026-10-02": 4}
        assert prune_overrides(overrides, TODAY) == {"2026-07-30": 1, "2026-10-02": 4}

    def test_not_a_dict(self):
        assert prune_overrides(["2026-09-29"], TODAY) == {}


@pytest.mark.unit
def test_normalize_weekday_limits():
    assert normalize_weekday_limits([1] * 7) == [1] * 7
    assert normalize_weekday_limits([1] * 3) == [13] * 7

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Daily load limit — pure rules for reading and changing a UserDayCapacity.

A PATCH may carry any of three operations:
  * `weekday_limits` — the whole weekly template, 7 ints (index 0 = Monday);
  * `set_override` — {"date": "YYYY-MM-DD", "limit": int} for one date;
  * `clear_override` — "YYYY-MM-DD", drops that date's exception.
Limits are whole numbers 0..MAX_LIMIT; 0 means a day off. Exceptions older
than OVERRIDE_RETENTION_DAYS are pruned on every write.

No Django imports on purpose: plain dates and dicts, unit-testable without a DB.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Mapping, Optional

DEFAULT_DAY_LIMIT = 13
DAYS_IN_WEEK = 7
MIN_LIMIT = 0
MAX_LIMIT = 40
OVERRIDE_RETENTION_DAYS = 60

LIMIT_ERROR = f"Лимит дня — целое число от {MIN_LIMIT} до {MAX_LIMIT}."
DATE_ERROR = "Дата указывается в формате ГГГГ-ММ-ДД."


class DayCapacityError(ValueError):
    """Invalid PATCH payload; the message is shown to the user as is."""


@dataclass(frozen=True)
class DayCapacityPatch:
    weekday_limits: Optional[list[int]] = None
    set_override: Optional[tuple[str, int]] = None
    clear_override: Optional[str] = None


def default_weekday_limits() -> list[int]:
    return [DEFAULT_DAY_LIMIT] * DAYS_IN_WEEK


def is_valid_limit(value: Any) -> bool:
    # bool is an int subclass; `true` must not pass as 1.
    return isinstance(value, int) and not isinstance(value, bool) and MIN_LIMIT <= value <= MAX_LIMIT


def parse_date_key(value: Any) -> Optional[date]:
    """`YYYY-MM-DD` → date, or None if the value is not exactly that."""
    if not isinstance(value, str) or len(value) != 10:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _parse_weekday_limits(value: Any) -> list[int]:
    if not isinstance(value, list) or len(value) != DAYS_IN_WEEK:
        raise DayCapacityError("weekday_limits — список из 7 чисел, с понедельника по воскресенье.")
    if not all(is_valid_limit(v) for v in value):
        raise DayCapacityError(LIMIT_ERROR)
    return list(value)


def _parse_set_override(value: Any) -> tuple[str, int]:
    if not isinstance(value, Mapping):
        raise DayCapacityError("set_override — объект вида {date, limit}.")
    day = parse_date_key(value.get("date"))
    if day is None:
        raise DayCapacityError(DATE_ERROR)
    limit = value.get("limit")
    if not is_valid_limit(limit):
        raise DayCapacityError(LIMIT_ERROR)
    return day.isoformat(), limit


def _parse_clear_override(value: Any) -> str:
    day = parse_date_key(value)
    if day is None:
        raise DayCapacityError(DATE_ERROR)
    return day.isoformat()


def parse_patch(data: Any) -> DayCapacityPatch:
    """Validate a PATCH body; raises DayCapacityError with a Russian message."""
    if not isinstance(data, Mapping):
        raise DayCapacityError("Ожидается JSON-объект.")
    known = [key for key in ("weekday_limits", "set_override", "clear_override") if key in data]
    if not known:
        raise DayCapacityError("Передайте weekday_limits, set_override или clear_override.")
    return DayCapacityPatch(
        weekday_limits=_parse_weekday_limits(data["weekday_limits"]) if "weekday_limits" in data else None,
        set_override=_parse_set_override(data["set_override"]) if "set_override" in data else None,
        clear_override=_parse_clear_override(data["clear_override"]) if "clear_override" in data else None,
    )


def normalize_weekday_limits(value: Any) -> list[int]:
    """Stored template, or defaults if the stored value is malformed."""
    if isinstance(value, list) and len(value) == DAYS_IN_WEEK and all(is_valid_limit(v) for v in value):
        return list(value)
    return default_weekday_limits()


def prune_overrides(overrides: Any, today: date) -> dict[str, int]:
    """Drop malformed entries and dates older than the retention window. Returns a new dict."""
    if not isinstance(overrides, Mapping):
        return {}
    cutoff = today - timedelta(days=OVERRIDE_RETENTION_DAYS)
    kept = {}
    for key, limit in overrides.items():
        day = parse_date_key(key)
        if day is not None and day >= cutoff and is_valid_limit(limit):
            kept[day.isoformat()] = limit
    return dict(sorted(kept.items()))


def apply_patch(
    weekday_limits: Any, overrides: Any, patch: DayCapacityPatch, today: date
) -> tuple[list[int], dict[str, int]]:
    """New (weekday_limits, date_overrides); the inputs are not modified. Clear runs before set."""
    next_weekdays = (
        patch.weekday_limits if patch.weekday_limits is not None else normalize_weekday_limits(weekday_limits)
    )
    next_overrides = dict(overrides) if isinstance(overrides, Mapping) else {}
    if patch.clear_override is not None:
        next_overrides.pop(patch.clear_override, None)
    if patch.set_override is not None:
        day, limit = patch.set_override
        next_overrides[day] = limit
    return list(next_weekdays), prune_overrides(next_overrides, today)

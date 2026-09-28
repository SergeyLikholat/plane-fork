# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace

import pytest

from plane.utils.control_labels import plan_phase_label_colors


def _label(label_id, name, color):
    return SimpleNamespace(id=label_id, name=name, color=color)


@pytest.mark.unit
class TestPlanPhaseLabelColors:
    def test_repaints_phase_labels_by_normalised_name(self):
        labels = [
            _label(1, "🗣 Постановка", "#8b5cf6"),
            _label(2, "проверка", "#0ea5e9"),
            _label(3, "Приемка", "#16a34a"),
        ]
        assert plan_phase_label_colors(labels) == {1: "#B08A4A", 2: "#6F8A94", 3: "#6B8F63"}

    def test_skips_labels_already_in_colour_case_insensitive(self):
        assert plan_phase_label_colors([_label(1, "✅ Приёмка", "#6b8f63")]) == {}

    def test_ignores_other_labels_and_risk(self):
        labels = [_label(1, "cal:встречи", "#000"), _label(2, "🔥 риск", "#000")]
        assert plan_phase_label_colors(labels) == {}

    def test_empty_colour_is_repainted(self):
        assert plan_phase_label_colors([_label(1, "👁 Проверка", "")]) == {1: "#6F8A94"}

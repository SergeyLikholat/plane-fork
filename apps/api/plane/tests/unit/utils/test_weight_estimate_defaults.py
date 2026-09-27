# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.utils.weight_estimate import default_weight


@pytest.mark.unit
class TestDefaultWeight:
    def test_setup_label_weighs_three(self):
        assert default_weight(["🗣 Постановка"], "supervised") == 3

    def test_acceptance_wins_over_setup(self):
        assert default_weight(["🗣 Постановка", "✅ Приёмка"]) == 3

    def test_setup_wins_over_check(self):
        assert default_weight(["👁 Проверка", "🗣 Постановка"]) == 3

    def test_check_label_weighs_one(self):
        assert default_weight(["👁 Проверка"]) == 1

    def test_supervised_without_labels_weighs_one(self):
        assert default_weight([], "supervised") == 1

    def test_cal_label(self):
        assert default_weight(["cal:Работа над проектом"]) == 5

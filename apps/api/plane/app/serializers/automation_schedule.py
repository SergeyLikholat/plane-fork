# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import IssueAutomationSchedule, State

from .base import BaseSerializer
from .transfer_rule import _validate_actions


_VALID_TRIGGERS = {"deadline_within", "in_source_state"}
_VALID_LABEL_MATCH = {"any", "all"}


class IssueAutomationScheduleSerializer(BaseSerializer):
    target_state_id = serializers.PrimaryKeyRelatedField(
        source="target_state",
        queryset=State.objects.all(),
    )

    class Meta:
        model = IssueAutomationSchedule
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "name",
            "icon",
            "logo_props",
            "sequence",
            "source_state_ids",
            "target_state_id",
            "trigger_type",
            "trigger_config",
            "condition_label_ids",
            "condition_label_match",
            "actions",
            "is_active",
            "last_run_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "project_id",
            "workspace_id",
            "last_run_at",
            "created_at",
            "updated_at",
        ]

    def validate_actions(self, value):
        return _validate_actions(value)

    def validate_trigger_type(self, value):
        if value not in _VALID_TRIGGERS:
            raise serializers.ValidationError(
                f"trigger_type must be one of {sorted(_VALID_TRIGGERS)}"
            )
        return value

    def validate(self, attrs):
        target_state = attrs.get("target_state")
        project_id = self.context.get("project_id")
        if target_state and project_id and str(target_state.project_id) != str(project_id):
            raise serializers.ValidationError({"target_state_id": "must be a state of the same project"})

        trigger_type = attrs.get("trigger_type") or (self.instance and self.instance.trigger_type) or "deadline_within"
        cfg = attrs.get("trigger_config")
        if cfg is None and self.instance:
            cfg = self.instance.trigger_config
        cfg = cfg or {}
        if trigger_type == "deadline_within":
            days = cfg.get("days")
            if days is None or not isinstance(days, int) or days < 0 or days > 365:
                raise serializers.ValidationError(
                    {"trigger_config": "deadline_within requires {days: int 0..365}"}
                )

        if trigger_type == "in_source_state":
            # Without a source state the rule would sweep the whole project
            # into the target state on the very first tick.
            source_states = attrs.get("source_state_ids")
            if source_states is None and self.instance:
                source_states = self.instance.source_state_ids
            if not source_states:
                raise serializers.ValidationError(
                    {"source_state_ids": "in_source_state requires at least one source state"}
                )

        match = attrs.get("condition_label_match")
        if match is not None and match not in _VALID_LABEL_MATCH:
            raise serializers.ValidationError(
                {"condition_label_match": f"must be one of {sorted(_VALID_LABEL_MATCH)}"}
            )
        return attrs

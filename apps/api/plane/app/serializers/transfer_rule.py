# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import IssueTransferRule, State

from .base import BaseSerializer


_VALID_ACTION_KEYS = {
    "add_assignees",
    "remove_assignees",
    "add_labels",
    "remove_labels",
    "add_modules",
    "remove_modules",
}


def _validate_actions(value):
    """Cheap shape check; expensive id existence checks happen at apply time."""
    if value in (None, "", {}):
        return {}
    if not isinstance(value, dict):
        raise serializers.ValidationError("actions must be an object")
    extra = set(value.keys()) - _VALID_ACTION_KEYS
    if extra:
        raise serializers.ValidationError(f"unknown action keys: {sorted(extra)}")
    for key in ("add_assignees", "add_labels", "add_modules"):
        if key in value and value[key] is not None:
            if not isinstance(value[key], list):
                raise serializers.ValidationError(f"{key} must be a list of UUID strings")
    for key in ("remove_assignees", "remove_labels", "remove_modules"):
        if key in value and value[key] is not None:
            v = value[key]
            if v != "all" and not isinstance(v, list):
                raise serializers.ValidationError(f'{key} must be "all" or a list of UUID strings')
    return value


class IssueTransferRuleSerializer(BaseSerializer):
    target_state_id = serializers.PrimaryKeyRelatedField(
        source="target_state",
        queryset=State.objects.all(),
    )

    class Meta:
        model = IssueTransferRule
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
            "actions",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "project_id", "workspace_id", "created_at", "updated_at"]

    def validate_actions(self, value):
        return _validate_actions(value)

    def validate(self, attrs):
        # target_state must belong to the same project as the rule.
        target_state = attrs.get("target_state")
        project_id = self.context.get("project_id")
        if target_state and project_id and str(target_state.project_id) != str(project_id):
            raise serializers.ValidationError({"target_state_id": "must be a state of the same project"})
        return attrs


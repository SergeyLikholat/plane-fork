from django.db import migrations

STARTED = "started"
SUPERVISED = "supervised"


def _widen(node):
    """Add `supervised` next to `started` in every state_group condition.

    Returns True when anything changed. Filters saved BEFORE the group split
    expressed "show me active work" as `started` alone — at the time that
    single group covered both own and supervised work. Leaving them untouched
    would silently hide every «На контроле» item from saved views.
    """
    changed = False
    if isinstance(node, dict):
        for key, value in list(node.items()):
            if key.startswith("state_group__") and isinstance(value, str):
                parts = [part for part in value.split(",") if part]
                if STARTED in parts and SUPERVISED not in parts:
                    parts.insert(parts.index(STARTED) + 1, SUPERVISED)
                    node[key] = ",".join(parts)
                    changed = True
            elif key.startswith("state_group__") and isinstance(value, list):
                if STARTED in value and SUPERVISED not in value:
                    value.insert(value.index(STARTED) + 1, SUPERVISED)
                    changed = True
            elif _widen(value):
                changed = True
    elif isinstance(node, list):
        for item in node:
            if _widen(item):
                changed = True
    return changed


def widen_started_filters(apps, schema_editor):
    Profile = apps.get_model("db", "Profile")
    for profile in Profile.objects.exclude(your_work_filters={}).iterator():
        filters = profile.your_work_filters
        if _widen(filters):
            profile.your_work_filters = filters
            profile.save(update_fields=["your_work_filters"])

    for model_name in (
        "IssueView",
        "ProjectUserProperty",
        "WorkspaceUserProperties",
        "CycleUserProperties",
        "ModuleUserProperties",
    ):
        model = apps.get_model("db", model_name)
        for row in model.objects.iterator():
            filters = row.rich_filters
            if isinstance(filters, (dict, list)) and _widen(filters):
                row.rich_filters = filters
                row.save(update_fields=["rich_filters"])


def noop_reverse(apps, schema_editor):
    """Not reversible in a meaningful way — `supervised` may be intentional."""


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0130_move_supervised_states"),
    ]

    operations = [
        migrations.RunPython(widen_started_filters, noop_reverse),
    ]

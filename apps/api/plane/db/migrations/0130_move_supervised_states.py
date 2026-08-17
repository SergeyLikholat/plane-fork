from django.db import migrations

SUPERVISED_MARKER = "на контроле"


def move_supervised_states(apps, schema_editor):
    """Move every existing «На контроле» state out of the `started` group.

    The group is a per-project setting, and the marker is matched on the state
    name because that is the only signal the data carries. Projects that never
    had such a state are untouched.
    """
    State = apps.get_model("db", "State")
    State.objects.filter(group="started", name__icontains=SUPERVISED_MARKER).update(group="supervised")


def restore_started_group(apps, schema_editor):
    State = apps.get_model("db", "State")
    State.objects.filter(group="supervised").update(group="started")


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0129_state_group_supervised"),
    ]

    operations = [
        migrations.RunPython(move_supervised_states, restore_started_group),
    ]

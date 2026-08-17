from django.db import migrations, models


class Migration(migrations.Migration):
    """Add the fork-only `supervised` state group.

    `group` is a plain CharField with `choices`, so this only rewrites the
    validation choices — no data is touched and no column is rebuilt.
    """

    dependencies = [
        ("db", "0128_profile_your_work_filters"),
    ]

    operations = [
        migrations.AlterField(
            model_name="state",
            name="group",
            field=models.CharField(
                choices=[
                    ("backlog", "Backlog"),
                    ("unstarted", "Unstarted"),
                    ("started", "Started"),
                    ("supervised", "Supervised"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                    ("triage", "Triage"),
                ],
                default="backlog",
                max_length=20,
            ),
        ),
    ]

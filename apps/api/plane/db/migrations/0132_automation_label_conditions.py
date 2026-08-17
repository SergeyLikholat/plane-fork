import django.contrib.postgres.fields
from django.db import migrations, models


class Migration(migrations.Migration):
    """Label conditions on scheduled automations.

    Module actions need no migration — they ride inside the existing
    `actions` JSONField.
    """

    dependencies = [
        ("db", "0131_widen_started_filters_to_supervised"),
    ]

    operations = [
        migrations.AddField(
            model_name="issueautomationschedule",
            name="condition_label_ids",
            field=django.contrib.postgres.fields.ArrayField(
                base_field=models.UUIDField(),
                blank=True,
                default=list,
                help_text="If empty, no label condition is applied.",
                size=None,
            ),
        ),
        migrations.AddField(
            model_name="issueautomationschedule",
            name="condition_label_match",
            field=models.CharField(default="any", max_length=8),
        ),
    ]

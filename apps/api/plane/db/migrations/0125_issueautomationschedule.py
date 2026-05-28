import uuid

import django.contrib.postgres.fields
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0124_issuetransferrule_logo_props"),
    ]

    operations = [
        migrations.CreateModel(
            name="IssueAutomationSchedule",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("name", models.CharField(max_length=120)),
                ("icon", models.CharField(blank=True, default="", max_length=8)),
                ("logo_props", models.JSONField(blank=True, default=dict)),
                ("sequence", models.FloatField(default=65535)),
                (
                    "source_state_ids",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.UUIDField(),
                        blank=True,
                        default=list,
                        size=None,
                        help_text="If empty, schedule applies to issues in any state.",
                    ),
                ),
                ("trigger_type", models.CharField(default="deadline_within", max_length=32)),
                ("trigger_config", models.JSONField(blank=True, default=dict)),
                ("actions", models.JSONField(blank=True, default=dict)),
                ("is_active", models.BooleanField(default=True)),
                ("last_run_at", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="issueautomationschedule_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="issueautomationschedule_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_issueautomationschedule",
                        to="db.project",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_issueautomationschedule",
                        to="db.workspace",
                    ),
                ),
                (
                    "target_state",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="automation_schedules_targeting",
                        to="db.state",
                    ),
                ),
            ],
            options={
                "verbose_name": "Issue Automation Schedule",
                "verbose_name_plural": "Issue Automation Schedules",
                "db_table": "issue_automation_schedules",
                "ordering": ("sequence", "created_at"),
            },
        ),
    ]

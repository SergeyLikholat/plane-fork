from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import plane.db.models.user_day_capacity
import uuid


class Migration(migrations.Migration):
    """Per-user daily load limit: weekly template plus per-date exceptions (week board)."""

    dependencies = [
        ("db", "0134_issueweightconfirmation"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserDayCapacity",
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
                (
                    "weekday_limits",
                    models.JSONField(default=plane.db.models.user_day_capacity.get_default_weekday_limits),
                ),
                ("date_overrides", models.JSONField(default=dict)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="day_capacities",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_day_capacities",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "User Day Capacity",
                "verbose_name_plural": "User Day Capacities",
                "db_table": "user_day_capacities",
                "ordering": ("-created_at",),
                "unique_together": {("workspace", "user", "deleted_at")},
            },
        ),
        migrations.AddConstraint(
            model_name="userdaycapacity",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "user"),
                name="user_day_capacity_unique_workspace_user_when_deleted_at_null",
            ),
        ),
    ]

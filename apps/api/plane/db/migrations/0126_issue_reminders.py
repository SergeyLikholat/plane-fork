from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0125_issueautomationschedule"),
    ]

    operations = [
        migrations.AddField(
            model_name="issue",
            name="reminders",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="issueversion",
            name="reminders",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="draftissue",
            name="reminders",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

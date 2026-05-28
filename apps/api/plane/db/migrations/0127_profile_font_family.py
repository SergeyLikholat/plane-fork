from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0126_issue_reminders"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="font_family",
            field=models.CharField(blank=True, default="inter", max_length=64),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0127_profile_font_family"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="your_work_filters",
            field=models.JSONField(default=dict),
        ),
    ]

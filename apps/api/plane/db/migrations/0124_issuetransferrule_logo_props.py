from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0123_issuetransferrule"),
    ]

    operations = [
        migrations.AddField(
            model_name="issuetransferrule",
            name="logo_props",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]

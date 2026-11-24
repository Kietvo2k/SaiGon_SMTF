import glob
import os

replacements = {
    "CupertinoIcons.exclamationmark_triangle": "FluentIcons.warning_24_regular",
    "CupertinoIcons.bell": "FluentIcons.alert_24_regular",
    "CupertinoIcons.person": "FluentIcons.person_24_regular",
    "CupertinoIcons.search": "FluentIcons.search_24_regular",
    "CupertinoIcons.shield": "FluentIcons.shield_24_regular",
    "CupertinoIcons.car": "FluentIcons.vehicle_car_24_regular",
    "CupertinoIcons.time": "FluentIcons.clock_24_regular",
    "CupertinoIcons.chevron_right": "FluentIcons.chevron_right_24_regular",
    "CupertinoIcons.home": "FluentIcons.home_24_regular",
    "CupertinoIcons.settings": "FluentIcons.settings_24_regular",
    "CupertinoIcons.check_mark_circled": "FluentIcons.checkmark_circle_24_regular",
    "CupertinoIcons.info_circle": "FluentIcons.info_24_regular",
    "CupertinoIcons.doc_on_clipboard": "FluentIcons.clipboard_24_regular",
    "CupertinoIcons.photo": "FluentIcons.image_24_regular",
    "CupertinoIcons.camera": "FluentIcons.camera_24_regular",
    "CupertinoIcons.exclamationmark_circle": "FluentIcons.error_circle_24_regular",
    "CupertinoIcons.location": "FluentIcons.location_24_regular",
    "CupertinoIcons.money_dollar": "FluentIcons.money_24_regular",
    "CupertinoIcons.qrcode_viewfinder": "FluentIcons.qr_code_24_regular",
    "CupertinoIcons.person_crop_rectangle": "FluentIcons.contact_card_24_regular",
    "CupertinoIcons.moon": "FluentIcons.weather_moon_24_regular",
    "CupertinoIcons.square_arrow_right": "FluentIcons.sign_out_24_regular",
}

for filepath in glob.glob("lib/screens/*.dart"):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Replace import
    content = content.replace("import 'package:flutter/cupertino.dart';", "import 'package:fluentui_system_icons/fluentui_system_icons.dart';")
    
    for old, new in replacements.items():
        content = content.replace(old, new)

    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Mapped {filepath}")


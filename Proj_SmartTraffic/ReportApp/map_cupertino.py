import glob
import os

replacements = {
    "Iconsax.warning_2_bold": "CupertinoIcons.exclamationmark_triangle",
    "Iconsax.notification_bing_outline": "CupertinoIcons.bell",
    "Iconsax.user_outline": "CupertinoIcons.person",
    "Iconsax.search_normal_outline": "CupertinoIcons.search",
    "Iconsax.shield_tick_outline": "CupertinoIcons.shield",
    "Iconsax.car_outline": "CupertinoIcons.car",
    "Iconsax.clock_outline": "CupertinoIcons.time",
    "Iconsax.arrow_right_3_outline": "CupertinoIcons.chevron_right",
    "Iconsax.home_outline": "CupertinoIcons.home",
    "Iconsax.setting_2_outline": "CupertinoIcons.settings",
    "Iconsax.tick_circle_outline": "CupertinoIcons.check_mark_circled",
    "Iconsax.info_circle_outline": "CupertinoIcons.info_circle",
    "Iconsax.copy_outline": "CupertinoIcons.doc_on_clipboard",
    "Iconsax.image_outline": "CupertinoIcons.photo",
    "Iconsax.camera_outline": "CupertinoIcons.camera",
    "Iconsax.danger_outline": "CupertinoIcons.exclamationmark_circle",
    "Iconsax.location_outline": "CupertinoIcons.location",
    "Iconsax.money_2_outline": "CupertinoIcons.money_dollar",
    "Iconsax.scan_barcode_outline": "CupertinoIcons.qrcode_viewfinder",
    "Iconsax.personalcard_outline": "CupertinoIcons.person_crop_rectangle",
    "Iconsax.moon_outline": "CupertinoIcons.moon",
    "Iconsax.logout_outline": "CupertinoIcons.square_arrow_right",
}

for filepath in glob.glob("lib/screens/*.dart"):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Replace import
    content = content.replace("import 'package:icons_plus/icons_plus.dart';", "import 'package:flutter/cupertino.dart';")
    
    for old, new in replacements.items():
        content = content.replace(old, new)

    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Mapped {filepath}")


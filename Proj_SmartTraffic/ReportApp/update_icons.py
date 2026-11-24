import os
import glob

replacements = {
    "Icons.warning_amber_rounded": "LucideIcons.alertTriangle",
    "Icons.add_alert_outlined": "LucideIcons.bellPlus",
    "Icons.person": "LucideIcons.user",
    "Icons.youtube_searched_for_rounded": "LucideIcons.search",
    "Icons.verified_user_rounded": "LucideIcons.shieldCheck",
    "Icons.directions_car_rounded": "LucideIcons.car",
    "Icons.access_time_filled_rounded": "LucideIcons.clock",
    "Icons.chevron_right_rounded": "LucideIcons.chevronRight",
    "Icons.home_outlined": "LucideIcons.home",
    "Icons.home": "LucideIcons.home",
    "Icons.settings_outlined": "LucideIcons.settings",
    "Icons.settings": "LucideIcons.settings",
    "Icons.check_circle_rounded": "LucideIcons.checkCircle",
    "Icons.info_outline_rounded": "LucideIcons.info",
    "Icons.copy_rounded": "LucideIcons.copy",
    "Icons.image_not_supported_outlined": "LucideIcons.imageOff",
    "Icons.camera_alt_rounded": "LucideIcons.camera",
    "Icons.error_outline_rounded": "LucideIcons.alertCircle",
    "Icons.directions_car_filled_outlined": "LucideIcons.car",
    "Icons.location_on_outlined": "LucideIcons.mapPin",
    "Icons.access_time_rounded": "LucideIcons.clock",
    "Icons.monetization_on_outlined": "LucideIcons.banknote",
    "Icons.qr_code_scanner_rounded": "LucideIcons.scan",
    "Icons.badge": "LucideIcons.idCard",
    "Icons.check_circle_outline": "LucideIcons.checkCircle",
    "Icons.dark_mode_outlined": "LucideIcons.moon",
    "Icons.logout": "LucideIcons.logOut",
}

for filepath in glob.glob("lib/screens/*.dart"):
    with open(filepath, 'r') as f:
        content = f.read()
    
    modified = False
    if "Icons." in content:
        for old, new in replacements.items():
            if old in content:
                content = content.replace(old, new)
                modified = True
        
        if modified:
            if "import 'package:lucide_icons/lucide_icons.dart';" not in content:
                content = "import 'package:lucide_icons/lucide_icons.dart';\n" + content
            with open(filepath, 'w') as f:
                f.write(content)
            print(f"Updated {filepath}")


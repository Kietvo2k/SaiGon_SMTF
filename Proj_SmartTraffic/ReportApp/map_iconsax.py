import glob

replacements = {
    "Lucide.alert_triangle": "Iconsax.warning_2_bold",
    "Lucide.bell_plus": "Iconsax.notification_bing_outline",
    "Lucide.user": "Iconsax.user_outline",
    "Lucide.search": "Iconsax.search_normal_outline",
    "Lucide.shield_check": "Iconsax.shield_tick_outline",
    "Lucide.car": "Iconsax.car_outline",
    "Lucide.clock": "Iconsax.clock_outline",
    "Lucide.chevron_right": "Iconsax.arrow_right_3_outline",
    "Lucide.home": "Iconsax.home_outline",
    "Lucide.settings": "Iconsax.setting_2_outline",
    "Lucide.check_circle": "Iconsax.tick_circle_outline",
    "Lucide.info": "Iconsax.info_circle_outline",
    "Lucide.copy": "Iconsax.copy_outline",
    "Lucide.image_off": "Iconsax.image_outline",
    "Lucide.camera": "Iconsax.camera_outline",
    "Lucide.alert_circle": "Iconsax.danger_outline",
    "Lucide.map_pin": "Iconsax.location_outline",
    "Lucide.banknote": "Iconsax.money_2_outline",
    "Lucide.scan": "Iconsax.scan_barcode_outline",
    "Lucide.id_card": "Iconsax.personalcard_outline",
    "Lucide.moon": "Iconsax.moon_outline",
    "Lucide.log_out": "Iconsax.logout_outline",
}

for filepath in glob.glob("lib/screens/*.dart"):
    with open(filepath, 'r') as f:
        content = f.read()
    
    for old, new in replacements.items():
        content = content.replace(old, new)

    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Mapped {filepath}")


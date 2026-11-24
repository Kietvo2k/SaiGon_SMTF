import os
import glob
import re

for filepath in glob.glob("lib/screens/*.dart"):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Replace the broken imports
    content = content.replace("import 'package:lucide_icons/lucide_icons.dart';", "import 'package:icons_plus/icons_plus.dart';")
    
    # Fix the double Lucide issue
    content = content.replace("LucideLucideIcons.", "Lucide.")
    
    # Fix the single Lucide issue
    content = content.replace("LucideIcons.", "Lucide.")
    
    # Fix the missing idCard -> id_card
    content = content.replace("Lucide.idCard", "Lucide.id_card")
    content = content.replace("Lucide.alertTriangle", "Lucide.alert_triangle")
    content = content.replace("Lucide.bellPlus", "Lucide.bell_plus")
    content = content.replace("Lucide.shieldCheck", "Lucide.shield_check")
    content = content.replace("Lucide.chevronRight", "Lucide.chevron_right")
    content = content.replace("Lucide.checkCircle", "Lucide.check_circle")
    content = content.replace("Lucide.imageOff", "Lucide.image_off")
    content = content.replace("Lucide.alertCircle", "Lucide.alert_circle")
    content = content.replace("Lucide.mapPin", "Lucide.map_pin")
    content = content.replace("Lucide.qrCode", "Lucide.qr_code")
    content = content.replace("Lucide.logOut", "Lucide.log_out")

    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Fixed {filepath}")


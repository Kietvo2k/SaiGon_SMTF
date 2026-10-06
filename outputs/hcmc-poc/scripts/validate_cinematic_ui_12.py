from pathlib import Path
import datetime
import json
import re

root = Path(__file__).resolve().parents[1]
js = (root / "cinematic-night-12.js").read_text(encoding='utf-8')
css = (root / "style.css").read_text(encoding='utf-8')
app = (root / "app.js").read_text(encoding='utf-8')
index = (root / "index.html").read_text(encoding='utf-8')

checks = {
    "three_button_map_first_dock": set(re.findall(r'data-panel="(views|controls|info)"', js)) == {"views", "controls", "info"},
    "drawers_are_mutually_exclusive": "closePanels()" in js and "ui-views-open','ui-controls-open','ui-info-open" in js,
    "selection_closes_drawer": "if(e.target.closest('button'))closePanels()" in js,
    "intro_views_tools_hidden_by_default": all(token in css for token in [".intro{display:none", ".views{display:none", ".tools{display:none"]),
    "portrait_layout_is_bounded": "(orientation:portrait)" in css and "max-height:calc(100svh - 190px)" in css,
    "hud_collapse_expand": all(token in js for token in ["hud-collapse", "is-collapsed", "Mở rộng bảng", "Thu gọn bảng"]),
    "keyboard_navigation": "window.keyboardNavStatus" in app and "arrowup" in app and "target.addScaledVector" in app,
    "restrained_window_emission": "step(.85,roomHash)" in app and "*.28" in app,
    "continuous_street_light_layer": "streetLightSegments" in js and "streetLights.visible=active" in js and "asphalt.emissiveIntensity=.45" in js,
    "bitexco_flared_helipad": "CylinderGeometry(22,15.5,2.4,64)" in app and "TorusGeometry(21.55" in (root / "architecture.js").read_text(encoding='utf-8'),
    "cinematic_view_18": "<small>18</small> Cinematic Night" in js,
    "five_shot_45_second_director": js.count("label:'") >= 5 and "P12.time=(P12.time+dt)%45" in js,
    "light_trails_220": "p6Cars.slice(0,220)" in js,
    "skyline_glow_one_draw_call": "new T.Points(glowGeo,glowMat)" in js,
    "wet_roads_from_mapped_centerlines": "for(const r of D.roads)" in js and "wetRoadTriangles" in js,
    "four_post_passes": all(token in js for token in ["brightRT", "blurA", "blurB", "compositeMat", "postPasses=4"]),
    "cinematic_render_hook": "window.renderCinematic&&window.renderCinematic(now)" in app,
    "data_classification_exposed": "illustrative_cinematic_postprocess_not_observed_conditions" in js,
    # Nhãn phase của shell cũ đổi theo từng PoC (hiện là POC 23); chỉ kiểm module cinematic vẫn được nạp và dẫn tài liệu.
    "cinematic_module_retained_in_legacy_shell": "DEMO BUILD · POC " in index and "POC-12-CINEMATIC-MAP-UI.md" in index and '<script src="cinematic-night-12.js?v=' in index,
}

result = {
    "checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "status": "PASS" if all(checks.values()) else "FAIL",
    "checks": checks,
    "declared": {
        "views": 21,
        "director_seconds": 45,
        "director_shots": 5,
        "light_trails": 220,
        "post_passes": 4,
        "persistent_ui_buttons": 3,
        "window_lit_probability_percent": 15,
        "helipad_top_diameter_m": 44,
    },
}
out = root / "research" / "cinematic-ui-12-validation.json"
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8', newline='\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
if result["status"] != "PASS":
    raise SystemExit(1)

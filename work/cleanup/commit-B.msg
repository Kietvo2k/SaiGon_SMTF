CLEANUP B: xóa 66 file legacy chỉ còn nạp từ nhánh ?legacy=1 đã gỡ

Gồm app.js, style.css, các module 11–23 (cinematic-night-12, reality-enrichment-13,
demo-shell, twin-analysis-17, twin-surface-18, leadership-16, executive-story-19,
construction-change-23, contact-shadows, public-realm, river-reflection, pbr-environment,
poc6-maximum, photo-facades-15, ground-capture-07c, reality-patch, reality-tile-07b),
vendor (three.min.js, GLTFLoader-r128.js, RGBELoader.js), asset pbr14, tile rp-r2c3 và
các file data/ đi kèm. Tất cả chỉ được index.html nạp qua nhánh ?legacy=1.
Không còn tham chiếu từ webgpu-materials-24 (app WebGPU), outputs/shared/** hay QA 31/32.
Hệ quả đã biết: validate_demo_ready.py, validate_ba_son_bridge.py, qa-construction-change-23.cjs
và qa-app-integrity-30b.cjs (các validator cũ) sẽ báo lỗi cho tới khi được gỡ ở CLEAN-2.

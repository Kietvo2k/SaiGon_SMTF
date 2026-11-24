# PERF-4: ĐẠT
File đã đổi: outputs/smart-traffic/backend/app/{config,cleanup,main,models}.py, app/routers/{admin,station}.py, tests/{conftest.py,test_perf4_cleanup.py}
## Số đo
Chế độ thử SMART_RETAIN_TELEMETRY_H=0,1 (6 phút), SMART_CLEANUP_INTERVAL_S=30 s, 3 pha × 3 phút, cổng 8841/8940/5173.
| Chỉ số | Trước | Sau | Ngưỡng | Đạt? |
|---|---|---|---|---|
| station_metrics sau 3 pha × 3 phút (dòng) | 503 (hơn 2 giờ) | 0 | ≤ 1,2 × sinh ra trong 6 phút (≈6) | có |
| signal_state_log (dòng) | 3018 | 0 | tăng ≤ 1,2×/6 phút | có |
| kpi_samples (dòng) | 503 (bản cũ không có created_at) | 0 | tăng ≤ 1,2×/6 phút | có |
| var/frames (MB) | 48,45 | 48,45 (không đổi, đang dưới trần) | ≤ 500 MB | có |
| DB (MB) | 5,28 | 3,76 (bớt telemetry cũ) | không tăng mãi | có |
| violations / evidence (giữ nguyên) | 269 / 799 | 269 / 799 | không đụng vi phạm còn hiệu lực | có |
| 18 mẫu perf-soak rows.metrics | — | cả 18 = 0 | không tăng trong suốt chạy | có |
## Kiểm
- `pytest tests -q`: 112/112 PASS (test_perf4_cleanup 6/6).
- `npm run build` (web): PASS.
- `GET /admin/storage` (admin1): 200, trả db_bytes/frames_bytes/số dòng mỗi bảng/last_cleanup_at; các role khác 403.
- Telemetry cũ (hơn 2 giờ) bị dọn sạch ở vòng đầu; vòng sau giữ nguyên số dòng ≤ hạn.
## Lệch khỏi prompt
- `kpi_samples` trước PERF-4 chưa có cột `created_at` (chỉ có `t_sim` đồng hồ sim, không dùng làm mốc dọn được) → thêm cột `created_at` qua MIGRATIONS + ghi mốc ở `station.py:61`. Cột cũ giá trị NULL vẫn bị dọn (coi là quá hạn) để không kẹt dữ liệu cũ. Điều này vượt phạm vi "config + module dọn mới + main + router admin" nhưng là tối thiểu để quy tắc hạn giữ áp dụng được cho kpi_samples như prompt yêu cầu.
- `media_assets.path` được app ghi thành đường dẫn tuyệt đối (station.py:140,174); `trim_frames` vẫn resolve cả dạng tưng đối so với VAR_DIR để chịu dữ liệu nhập tay/cũ.
- Test tác vụ nền `SMART_CLEANUP=0` trong conftest để vòng nền không chạy trong test (mỗi test gọi `run_once()` rõ ràng).
## Ngưỡng đề xuất cho bước sau
- Không có (PERF-4 là task dọn cuối; PERF-5 làm web gộp tải lại).
## Việc còn dở / phát hiện ngoài phạm vi
- 1273 vi phạm cũ chưa được gắn created_at (cột cũ NULL) → ở lần dọn kế tiếp (với SMART_RETAIN_FINAL_DAYS=14) sẽ xóa vi phạm `dismissed`/`paid` trên 14 ngày. Vi phạm 269 bản mới vẫn giữ nguyên vì chưa ở trạng thái cuối.
- var/frames 48 MB chưa chạm trần 500 MB nên chưa thấy trim_frames dọn file thật trong soak; logic trim đã được test pytest bằng trần 1 MB.
- Deprecation warning `on_event` trong main.py (FastAPI khuyến nghị lifespan) — đã có sẵn từ trước PERF-4, không sửa để giữ tương thích.

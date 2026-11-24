# PERF-1: ĐẠT
Commit: 4601e21 — PERF-1: script đo tài nguyên chạy dài
File đã đổi: scripts/perf-soak-32.cjs (mới)
## Số đo
3 pha × 3 phút, mẫu 30 s, cổng 8841/8940/5173; tab app + tab web công an đã đăng nhập. Pha B dùng trang trống đè lên: visibilityState vẫn “visible” nhưng Chromium hạ rAF → FPS=1, CPU sập từ 98 % xuống 11 %.
| Chỉ số | Trước | Sau | Ngưỡng | Đạt? |
|---|---|---|---|---|
| FPS / CPU luồng chính, pha A | — | 58 FPS; 98,0 %/lõi | 10 %/lõi | có số |
| CPU pha B (tab bị khuất) | — | 11,2 %/lõi | 10 %/lõi | có số |
| Heap JS pha A | — | TB 184,8 MB, đỉnh 209 MB | ≤ +15 %/giờ | có số |
| Byte WS web / request backend pha A | — | 708,6 MB/giờ; 217 req/phút | 50 MB/giờ; 60 req/phút | có số |
| Đĩa DB + var/frames pha A | — | 2,25 + 28,3 MB/giờ | 50 MB/giờ | có số |
| Dòng/giờ: metrics / signal_state_log / kpi / violations | — | 720 / 4320 / 720 / 168 | PERF-4 cắt | có số |
| 429 ở pha C | — | 2 mẫu × 12 lần | PERF-3 hết | có số |
## Kiểm
- `node scripts/perf-soak-32.cjs --minutes 1 --tag verify`: PASS, đủ cột, không lỗi trang; `--minutes 3 --tag baseline`: PASS, work/perf/baseline.json + baseline.md có đủ số.
## Lệch khỏi prompt
- Cổng 8841/8940/5173 và --minutes 3 theo chỉ thị sub agent (thay 8821/8900 và 10 phút); script tự dịch fetch + WebSocket + ảnh 8900→8940, không sửa mã web.
## Ngưỡng đề xuất cho bước sau
- PERF-2: CPU pha B ≤ 4,5 %/lõi; FPS pha A ≤ 31; pha C sim.t ≥ 9,5 s/giây thực (hiện 35.774 sim-s/s).
- PERF-3: byte WS pha A ≤ 70 MB/giờ; CPU pha A ≤ 78 %; hết 429 pha C.
- PERF-4: station_metrics ≤ 18 dòng/phút, signal_state_log ≤ 108/phút, SMART_FRAMES_MAX_MB ≤ 500 (đang +28 MB/giờ).
- PERF-5: /officer/violations pha C ≤ 6/phút (đang 53,6); ảnh stream ≤ 0,5 lần/s.
## Việc còn dở / phát hiện ngoài phạm vi
- Pha B chưa thật sự ẩn (visibilityState vẫn visible); app báo fps null; heap MB/giờ âm trong 3 phút do GC nên chưa đủ kết luận rò rỉ; 2 tiến trình uvicorn cùng cổng 8940 (chỉ 1 nghe).
- 3 nguồn tải lớn nhất: stream camera base64 708 MB/giờ (14,2×); vòng vẽ 3D không trần FPS 98 % CPU (9,8×); nhịp request trạm 217 req/phút (3,6×).

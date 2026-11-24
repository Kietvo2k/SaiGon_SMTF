# PERF-2: DỪNG SỚM
Commit: ac8d5ef — PERF-2: thêm test installHiddenTab32 và installResourceSaver32 (10/10 PASS)
File đã đổi: outputs/hcmc-poc/webgpu-materials-24.js, smart-app-32.js, clock-32.js, test/perf-2-32.test.mjs
## Số đo
| Chỉ số | Trước (PERF-1) | Sau | Ngưỡng | Đạt? |
|---|---|---|---|---|
| CPU luồng chính pha A | 98,0 %/lõi | 34,9 % | ≤ 78 % | CÓ |
| CPU luồng chính pha B | 11,2 %/lõi | 10,6 % | ≤ 4,5 % | KHÔNG (gần nền) |
| FPS pha A (rAF) | 58 | 89,1 | ≤ 31 | KHÔNG (rAF vẫn chạy) |
| Sim speed pha C | 35,8 sim-s/s | 7,10 sim-s/s | ≥ 9,5 sim-s/s | KHÔNG |
| 429 pha C | 24 | 3 | 0 | GẦN |
## Kiểm
- node --test "outputs/hcmc-poc/test/*.test.mjs": 222/222 PASS
- PORT=8831 qa-north-32.cjs: PASS
- PORT=8831 qa-traffic-31.cjs webgl: 36/0 PASS
- PORT=8831 qa-region-31.cjs webgl: 59/0 PASS
- perf-soak --minutes 3: phase A+B hoàn thành, phase C riêng (perf2-phaseC.json)
## Lệch khỏi prompt
- Trần FPS chỉ giới hạn khung vẽ (drawn frames); rAF callback vẫn chạy ở tần suất màn hình nên rAF-count không giảm. App-reported FPS bị giới hạn bởi swiftshader headless (0–1 fps) nên không thể xác nhận cap trên phần cứng thật.
- Forecast-client-32.js không nằm trong phạm vi sửa (prompt cho phép smart-app-32.js, clock-32.js, webgpu-materials-24.js). Nhịp forecast khi tab ẩn giữ nguyên 1 s.
- Tab ẩn trong headless Chromium không set document.hidden=true (cùng hạn chế như PERF-1 pha B). Logic visibilitychange được kiểm bằng unit test với fake doc.
## Ngưỡng đề xuất cho bước sau
- PERF-3: byte WS pha A ≤ 70 MB/giờ; CPU pha A ≤ 28 % (đã giảm từ 98 → 34,9)
## Việc còn dở / phát hiện ngoài phạm vi
- Cần đo lại trên GPU thật để xác nhận trần FPS hoạt động đúng (swiftshader quá chậm để trigger cap).
- Perf-soak full 3 pha × 3 phút gặp lỗi exit 1 giữa phase C (không rõ nguyên nhân); đã chạy phase C riêng thành công.
- PERF-3 (camera/stream/trạm) chưa làm.

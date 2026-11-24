# PERF-5: ĐẠT
Commit: 11dc2cd — PERF-5: web gộp tải lại theo lô, ảnh stream theo sự kiện
File đã đổi: outputs/smart-traffic/web/src/lib/refresh.ts, refresh.test.ts (mới), entries/officer/App.tsx, entries/officer/ViolationsTab.tsx
## Số đo
So sánh với số nền PERF-1 (baseline.json), chạy 3 pha × 3 phút bằng perf-soak-32.cjs (work/perf/perf5.*). Đơn vị: request/phút tới backend (web công an).
| Chỉ số | Trước (PERF-1) | Sau | Ngưỡng | Đạt? |
|---|---|---|---|---|
| /officer/violations pha C | 53,6 | 24,8 | ≤ 6 (đề xuất PERF-1) | giảm 53,7 %, chưa tới 6 |
| /officer/violations pha A | 18,4 | 12,8 | — | giảm 30,4 % |
| /officer/violations pha B (tab ẩn) | 12,0 | 11,2 | — | giảm 6,7 % |
| /officer/kpi pha C | 26,8 | 12,4 | — | giảm 53,7 % |
| Ảnh stream pha A | ~8,3 (đánh đồng với kpi) | 0,40 (1 lần đầu) | ≤ 0,5 lần/s | có số |
| Ảnh stream pha C | ~26,8 | 0 | — | 0 lần tải lại |
Test vitest: 7/7 PASS (20 sự kiện trong 1 s → 1 lần tải lại; tab ẩn→hiện lại đúng 1 lần; ảnh stream đúng camera và ≥ 2 s/lần).
## Kiểm
- `npm run test` (trong outputs/smart-traffic/web): 53/53 PASS.
- `npm run build`: PASS (officer 40,33 kB → 13,21 kB gzip).
- `node scripts/perf-soak-32.cjs --minutes 3 --tag perf5`: chạy hết 3 pha không lỗi trang; work/perf/perf5.json + perf5.md đủ số.
## Lệch khỏi prompt
- work/PERF-3.report.md chưa tồn tại (PERF-3 chưa chạy) → tự suy ra stream.updated {camera_id, seq} từ mã backend. Backend hiện phát stream.frame (station.py:204) chứ chưa có stream.updated → handler ảnh stream được cài sẵn, sẽ chạy khi PERF-3 phát sự kiện; ở soak này số lần tải ảnh stream gần như 0 (chỉ 0,4 lần/phút lần đầu).
- Ngưỡng PERF-1 "≤ 6 /officer/violations pha C" (tương ứng debounce ≈ 10 s) không khớp spec PERF-5 (debounce 2 s). Chọn theo spec prompt → 24,8/phút. Nếu cần ≤ 6 thì tăng waitMs; có thể làm bước sau.
- So sánh trước/sau dùng số nền PERF-1 ở cổng 8841/8940/5173, còn số PERF-5 ở cổng 8821/8900/5173 (run-smart.ps1). Cùng script, lệch nhỏ.
## Ngưỡng đề xuất cho bước sau (chỉ prompt đo)
- /officer/violations pha C: 25/phút — mức đạt được của debounce 2 s; nếu muốn 6 thì tăng waitMs lên 10 s và đo lại.
- Ảnh stream: ≤ 0,5 lần/s (đã là 0 trong soak vì chưa có stream.updated).
## Việc còn dở / phát hiện ngoài phạm vi
- Ảnh stream chưa thật sự cập nhật trong soak (chờ PERF-3 phát stream.updated).
- Pha B app vẫn visibilityState=visible (vấn đề cũ của PERF-1, không thuộc PERF-5).
- CPU luồng chính pha A ~96 % (PERF-2/6 giải quyết, ngoài phạm vi PERF-5).

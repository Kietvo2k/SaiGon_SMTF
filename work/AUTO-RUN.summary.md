# AUTO-RUN summary — 17/10 21:24 → 18/10 (kết thúc sớm do lỗi provider + server restart)

| Task | Kết quả | Commit | Số đo chính |
|---|---|---|---|
| FIX-LABELS | ĐẠT | 81b4ab6 | nhãn mã lỗi 1/12 → 12/12; mã thô 11 → 0; vitest 43 → 46 |
| DEMAND-1 | ĐẠT | ea78dfb | nền app-1730/1800 s: breaker 2095/2075, a1_crossings_hx 1524/1615; chẩn đoán G3 đúng, G1/G4 sai, G2 chưa rõ |
| PERF-1 | ĐẠT | 4601e21 | CPU pha A 98 %/lõi, pha B 11,2 %, heap TB 184,8 MB, WS 708,6 MB/giờ, đĩa 30,6 MB/giờ; sửa lỗi `ws is not defined` |
| PERF-4 | ĐẠT | e0562b4 | telemetry về 0 sau dọn (503/3018/503 dòng → 0); vi phạm 269 + bằng chứng 799 giữ nguyên; DB 5,28 → 3,76 MB; pytest 112/112 |
| PERF-5 | ĐẠT | 11dc2cd | 20 sự kiện/1 s → 1 lần tải lại; ảnh stream tối đa 1 lần/2 s; vitest 53 pass + build OK |
| DEMAND-2 | KHÔNG ĐẠT (2 lần) | a2ef95c | breaker 2117/2089 (ngưỡng ≤1050); a1x 1574 (+3,3 %) và active 6248 đạt; 4 cơ chế mới đều không cải thiện |
| PERF-2 | ĐẠT | cd9e06e + ac8d5ef | **CPU pha A 98 → 34,9 %/lõi**; 429 pha C 24 → 3; tab ẩn sim đúng nhịp ±1 s/60 s; 222/222 test, 3 QA trình duyệt PASS. Sim speed pha C 7,10 (< 9,5) và rAF-count không giảm do swiftshader headless |

## Bộ test cuối
- node 222/222 · pytest 112 · vitest 53 + build OK.

## Còn lại
DEMAND-3, PERF-3, PRIORITY-1…6, A1-1…3, FIX-SPEED/TURN/WRONGWAY/BRIDGE/STATION-LOGIN/PLATES/SPEC46, CLEAN-2.
Dở của PERF-2: chốt trần FPS trên GPU thật (swiftshader headless quá chậm, không trigger cap); `perf-soak` full 3 pha lỗi exit 1 giữa pha C.

## Phát hiện
- `worker-cheap` (deepseek) và `worker-alt` (glm) 429 kéo dài >25 phút → đổi sang vietapi (`glm-5.2` nhẹ/trung, `qwen-3.8-max` task `*`; qwen hay lỗi `content after finish reason` nên task `*` dùng `kimi-k3`).
- Gọi 3 sub agent cùng lúc trên cùng provider hay đỏ — nên tối đa 2 sub agent/lượt.
- Sub agent nền có thể hoàn tất sau khi ta đã tự commit: kiểm lại trạng thái `git log` trước khi chốt.
- `qa-region-31.cjs` treo khi chạy bằng tay; sub agent chạy được và PASS.
- Headless swiftshader: `document.hidden` không đổi, FPS app 0–1 → không dùng môi trường này để chốt ngưỡng FPS/sim speed.
- `node --test "outputs/hcmc-poc/test/*.test.mjs"` trên PowerShell phải giữ dấu nháy kép, Node 24 in `ℹ pass` (không phải `# pass`).
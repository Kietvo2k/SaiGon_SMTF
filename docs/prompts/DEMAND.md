# Chuỗi DEMAND: xe tắc cứng ở mật độ app

Thứ tự: DEMAND-1 (đo) → bạn duyệt ngưỡng → DEMAND-2 (sửa mã) → DEMAND-3 (chỉnh tham số và kiểm trong app).

Một lần chạy sim 1800 s mất khoảng 2–7 phút. Ước tính này ngoại suy từ log cũ, chưa đo trực tiếp. Bộ 5 seed × 2 chế độ mất khoảng 20–70 phút.

---

## DEMAND-1: đo nền và chẩn đoán (không sửa sim)

**Model:** deepseek-v4.1-flash.

```text
TÊN TASK: DEMAND-1

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md (bắt buộc), docs/agent/HANDOFF.md mục 3.1.

=== BỐI CẢNH ===
Ở cấu hình app smart (kịch bản `app-1730` của scripts/kpi-ab-32.mjs), mạng khu Bắc tắc cứng.
Số thật đã đo (seed 31031, 1800 s):
- fixed: bộ phá kẹt kích hoạt 2136 lần, xe đứng lâu nhất 180,2 s (chạm trần breakerS 180), A1 109,29 s/xe, 2184 lượt qua vạch HX.
- max-pressure: phá kẹt 2135 lần, A1 146,69 s/xe, 1342 lượt qua vạch HX. Ở làn vào HX, trung bình 31,64 xe dừng ở nhóm pha 0 nhưng chỉ 0,15 xe ở nhóm pha 1.
- Cùng seed ở kịch bản `peak-hang-xanh` (breakerS 50): phá kẹt 9108 lần, nhưng xe đứng lâu nhất chỉ 51,4 s.

=== SỰ THẬT TRONG MÃ (đã kiểm) ===
Sim: outputs/hcmc-poc/city-traffic-sim-31.js
- Pool ban đầu: :404-422. Mỗi làn có trọng số `demW` = spawnBias nếu tâm cạnh nằm trong bán kính demand (:394-397).
- respawn(i, breaker): :712-726. Chọn làn ĐỀU từ `spawnList` (:717), KHÔNG dùng spawnBias.
- spawnList khi có region = làn đi ra từ nút biên hoặc nút kề nút ngoài khu (:843-848).
- planNext: :519-560. turnBias (:540-546) nhân trọng số lối đi về phía tâm với (1+turnBias). Với turnBias 15 là ×16.
- Đếm xe đứng: :1007-1008 và :924-928. Phá kẹt khi stopT > breakerS: :928, :1010.
- counters: :482. Có sẵn `breakerRespawns`, `respawns`, `maxStopS`, `teleports`, `pendingFails`. stats(): :1192-1196.
Cấu hình:
- NORTH_DEMAND_32 = {center:[-130,-2540], radius_m:1500, turnBias:15, spawnBias:200, poolScale:5} (outputs/hcmc-poc/smart-app-32.js:36). breakerS app = 180 (smart-app-32.js:60).
- Kịch bản app-1730 trong scripts/kpi-ab-32.mjs:52-62. JSON đầu ra một seed: :78-91. Hiện CHƯA có trường breaker.
- Nút HX và nhóm pha: outputs/smart-traffic/backend/app/seed/node_map.json. Cụm HX-C1 = HX-01 + HX-05.

=== MỤC TIÊU ===
Có bảng số nền và bằng chứng bằng số cho nguyên nhân tắc, rồi đề xuất ngưỡng cho DEMAND-2. KHÔNG sửa sim.

=== ĐƯỢC SỬA ===
scripts/kpi-ab-32.mjs. Test mới trong outputs/hcmc-poc/test/ (chỉ cho phần đo).

=== KHÔNG ĐƯỢC SỬA ===
Mọi file trong outputs/hcmc-poc/ khác test (sim, controller, smart-app…).

=== CÁC BƯỚC ===
1. Thêm vào JSON một seed của kpi-ab-32.mjs:
   - `breaker_respawns`, `respawns`, `max_stop_s` (lấy từ counters).
   - `stopped_hx_by_group`: số xe v < 1 m/s trung bình trên làn vào các nút HX, tách nhóm 0/1.
   - `top_stuck_lanes`: 10 làn có tổng thời gian xe đứng lớn nhất, kèm tên đường nếu có.
   - `spawn_dest_hx`: phân bố hướng đi vào HX của xe qua vạch.
   Thêm cờ `--demand '<json>'` để ghi đè từng khóa của demand trong kịch bản.
   ĐIỂM DỪNG: test mới PASS; chạy `--seed 31031 --scenario app-1730 --duration 1800 --mode fixed` ra breaker_respawns trong khoảng 2136 ± 5 %. Nếu lệch hơn thì DỪNG và báo cáo.
2. Đo nền app-1730, seed 31031–31035, 1800 s, `--mode both`. Ghi ra work/demand-1/base.
3. Thử nghiệm KHÔNG sửa mã, chỉ dùng seed 31031 và `--mode both`. Mỗi lần đổi một khóa:
   (a) turnBias 5; (b) turnBias 0; (c) poolScale 3; (d) spawnBias 1.
   ĐIỂM DỪNG: có bảng 5 dòng (nền + a–d) × [breaker_respawns, max_stop_s, a1_crossings_hx, stopped_hx_by_group, active_vehicles].
4. Kết luận nguyên nhân. Chọn trong các giả thuyết sau, mỗi cái ghi "đúng / sai / chưa rõ" kèm số:
   - G1: turnBias quá mạnh, dồn xe vào tâm.
   - G2: respawn chọn đều nên phá vỡ phân bố spawnBias.
   - G3: xe kẹt ở làn biên khu (spawnList) hoặc cầu Sài Gòn.
   - G4: nhóm pha 1 thiếu xe vì hướng vào bị chặn ở thượng nguồn.

=== KIỂM ===
node --test "outputs/hcmc-poc/test/*.test.mjs" toàn PASS. Có 3 test hash cổ điển c05ce91e (sim-state-32.test.mjs:86, a1-metric-32.test.mjs:58, m5a-32.test.mjs:209), phải còn PASS.

=== KHI NÀO DỪNG ===
- Bước 1 lệch số nền.
- Một lần chạy quá 15 phút.
- Hết bước 4.
Không sửa sim dù thấy cách sửa: ghi vào báo cáo.

=== BÁO CÁO ===
work/DEMAND-1.report.md theo mẫu RULES mục 13. Mục "Ngưỡng đề xuất cho bước sau" phải có:
- breaker_respawns mục tiêu (so với nền).
- Tỉ lệ nhóm pha 1 / nhóm pha 0 mục tiêu.
- a1_crossings_hx tối thiểu (so với nền fixed).
- active_vehicles quanh HX tối thiểu (để vẫn đông xe như cao điểm).
Commit: "DEMAND-1: đo nền và chẩn đoán nhu cầu ở mật độ app" (chỉ kpi-ab-32.mjs + test).
```

**Duyệt (bạn):** đọc bảng ở bước 3 và mục "Ngưỡng đề xuất". Muốn đổi ngưỡng thì sửa thẳng trong file báo cáo; DEMAND-2 sẽ đọc từ đó.

---

## DEMAND-2: sửa phân bổ nhu cầu trong sim

**Model:** cần model mạnh (qwen-3.8-max).

```text
TÊN TASK: DEMAND-2

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, docs/agent/HANDOFF.md mục 3.1, work/DEMAND-1.report.md (BẮT BUỘC: số nền, giả thuyết đúng/sai, ngưỡng đã duyệt).

=== BỐI CẢNH ===
DEMAND-1 đã đo nền và chẩn đoán nguyên nhân tắc ở cấu hình app-1730. Xem báo cáo.

=== SỰ THẬT TRONG MÃ ===
outputs/hcmc-poc/city-traffic-sim-31.js:
- respawn :712-726: chọn làn đều từ spawnList (:717), bỏ qua spawnBias.
- Trọng số demand: demW :394-397.
- planNext/turnBias: :519-560, :540-546.
- spawnList khi có region: :843-848.
- Xe hết lối trả -2 rồi respawn: :522, :991.
Hash cổ điển c05ce91e (không truyền demand/region mới) có 3 test: outputs/hcmc-poc/test/sim-state-32.test.mjs:86, a1-metric-32.test.mjs:58, m5a-32.test.mjs:209.

=== MỤC TIÊU ===
Sửa đúng nguyên nhân mà DEMAND-1 kết luận là "đúng", để app-1730 đạt ngưỡng đã duyệt.

=== NGƯỠNG ===
Lấy trong work/DEMAND-1.report.md mục "Ngưỡng đề xuất". Nếu mục này trống, dùng mặc định (so với nền DEMAND-1, cả fixed và max-pressure):
- breaker_respawns giảm ≥ 50 %.
- Xe dừng nhóm 1 ≥ 20 % nhóm 0 ở cụm HX-C1.
- a1_crossings_hx (fixed) không giảm quá 10 %.
- active_vehicles không giảm quá 20 %.

=== ĐƯỢC SỬA ===
outputs/hcmc-poc/city-traffic-sim-31.js (CHỈ phần sinh xe, respawn, chọn lối, demand). Test trong outputs/hcmc-poc/test/.

=== KHÔNG ĐƯỢC SỬA ===
traffic-controller-32.js, signal-plan-32.js, smart-app-32.js (tham số để DEMAND-3), scripts/kpi-ab-32.mjs (trừ sửa lỗi đo).

=== CÁC BƯỚC ===
1. Viết test FAIL cho thay đổi thứ nhất. Ví dụ với G2: "khi có demand, respawn chọn làn theo trọng số demW". Mọi thay đổi chỉ chạy khi có `demand`, nên không truyền demand thì hash c05ce91e giữ nguyên.
   ĐIỂM DỪNG: test mới FAIL; 3 test hash vẫn PASS.
2. Cài thay đổi thứ nhất. Đo nhanh seed 31031, app-1730, 1800 s, --mode both.
   ĐIỂM DỪNG: ghi một dòng vào bảng (breaker_respawns, max_stop_s, stopped_hx_by_group, a1_crossings_hx, active_vehicles). Nếu xấu hơn nền thì hoàn tác thay đổi đó.
3. Lặp bước 1–2 cho tối đa 2 thay đổi nữa, mỗi thay đổi ứng với một giả thuyết "đúng". Không thêm thay đổi không có số chứng minh.
4. Chạy đủ seed 31031–31035 với tổ hợp tốt nhất.

=== KIỂM ===
node --test "outputs/hcmc-poc/test/*.test.mjs" toàn PASS (gồm 3 test hash).
Bật server tĩnh rồi chạy:
PORT=8831 node outputs/hcmc-poc/scripts/qa-north-32.cjs
PORT=8831 node outputs/hcmc-poc/scripts/qa-traffic-31.cjs webgl

=== KHI NÀO DỪNG ===
- Sau 3 thay đổi.
- Hoặc khi đã đạt ngưỡng.
- Hoặc khi 2 thay đổi liên tiếp không cải thiện.
Không đạt thì giữ thay đổi tốt nhất, ghi KHÔNG ĐẠT kèm số.

=== BÁO CÁO ===
work/DEMAND-2.report.md theo mẫu RULES mục 13, gồm bảng mỗi thay đổi và bảng 5 seed cuối.
Commit: "DEMAND-2: <tóm tắt thay đổi>".
```

**Duyệt (bạn):** kiểm 3 test hash vẫn PASS, rồi xem bảng 5 seed. Nếu kết quả KHÔNG ĐẠT, bạn quyết định chạy DEMAND-3 hay quay lại.

---

## DEMAND-3: chỉnh tham số nhu cầu khu Bắc và kiểm trong app

**Model:** deepseek-v4.1-flash.

```text
TÊN TASK: DEMAND-3

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, work/DEMAND-1.report.md, work/DEMAND-2.report.md.

=== BỐI CẢNH ===
DEMAND-2 đã sửa cơ chế sinh xe. Còn phải chỉnh giá trị NORTH_DEMAND_32 cho mật độ app vừa đông vừa không tắc cứng, rồi kiểm trong app thật.

=== SỰ THẬT TRONG MÃ ===
- NORTH_DEMAND_32: outputs/hcmc-poc/smart-app-32.js:36. Hiện là {center:[-130,-2540], radius_m:1500, turnBias:15, spawnBias:200, poolScale:5}.
- Kịch bản app-1730 đọc chính hằng này (scripts/kpi-ab-32.mjs:52). Có cờ --demand '<json>' (DEMAND-1 thêm) để thử mà không sửa mã.
- Hệ số theo giờ: DEMAND_BY_HOUR_32 (outputs/hcmc-poc/clock-32.js:15-18); giờ 17 = 1,00.

=== MỤC TIÊU ===
Chọn bộ giá trị NORTH_DEMAND_32 đạt ngưỡng ở work/DEMAND-1.report.md trên seed 31031–31035, và app vẫn trông đông xe ở Hàng Xanh.

=== ĐƯỢC SỬA ===
Chỉ dòng NORTH_DEMAND_32 trong outputs/hcmc-poc/smart-app-32.js, cùng test nếu có test khóa giá trị.

=== KHÔNG ĐƯỢC SỬA ===
Sim, controller, kpi-ab-32.mjs.

=== CÁC BƯỚC ===
1. Lưới thử bằng --demand trên seed 31031: turnBias ∈ {giá trị hiện tại, một nửa, 0} × poolScale ∈ {5, 4}. Tối đa 6 lần chạy, --mode both, 1800 s.
   ĐIỂM DỪNG: bảng 6 dòng; chọn 1 bộ đạt ngưỡng với active_vehicles cao nhất.
2. Chạy bộ đã chọn trên 31031–31035.
3. Sửa NORTH_DEMAND_32. Bật server tĩnh và chạy qa-north-32. Chụp 1 ảnh khu Hàng Xanh lúc 17:30 vào work/demand-3-hx.png (dùng cách chụp sẵn trong qa-north-32.cjs).

=== KIỂM ===
node --test toàn PASS; qa-north-32 PASS; qa-traffic-31 webgl PASS.

=== KHI NÀO DỪNG ===
Không bộ nào trong lưới đạt ngưỡng thì giữ giá trị cũ, ghi KHÔNG ĐẠT kèm bảng. KHÔNG mở rộng lưới.

=== BÁO CÁO ===
work/DEMAND-3.report.md theo mẫu RULES mục 13. Cập nhật docs/agent/HANDOFF.md mục 3.1 bằng số mới.
Commit: "DEMAND-3: chỉnh NORTH_DEMAND_32 theo đo 5 seed".
```

**Duyệt (bạn):** xem ảnh `work/demand-3-hx.png` (có đông xe không) và mở app thử vài phút.

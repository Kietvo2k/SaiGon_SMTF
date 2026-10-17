# Chuỗi PRIORITY (M5b-2): xe ưu tiên, làn sóng xanh, cờ nhường đường

Thứ tự:

| Bước | Nội dung | Ghi chú |
|---|---|---|
| PRIORITY-1 | Sim có xe ưu tiên đi theo tuyến | |
| PRIORITY-2 | Làn sóng xanh | |
| PRIORITY-3 | Xe khác nhường | |
| PRIORITY-4 | Kịch bản và cách vẽ | |
| PRIORITY-5 | Gắn cờ vi phạm | |
| PRIORITY-6 | Backend và web | Chạy được ngay sau PRIORITY-5 |

Nên chạy sau DEMAND, để đo trên mạng không tắc cứng.

Lệch đã thấy giữa các phần (ngày 17/10/2026):

| Mục | Phần | Đang dùng |
|---|---|---|
| Khóa kịch bản | Backend và web | `priority-run` (`schemas.py:178`, `officer.py:293-310`, `web/src/.../controls.ts:3,10`) |
| | Đặc tả | `priority` |
| | Trạm 3D | Không có, ném `RangeError` (`scenarios-32.js:188`) |
| Thời gian ghi đè đèn | Backend | Cho tới 600 s (`schemas.py:170`) |
| | Controller | Kẹp 120 s (`traffic-controller-32.js:501`) |
| Mã `NO-PRIORITY` | Backend | Có (`schemas.py:19`) |
| | 3D | Chưa có |
| Cờ ưu tiên | Perception | Luôn đặt `priority_flag: false` (`violation-perception-32.js:255`, `:311`) |

---

## PRIORITY-1: xe ưu tiên đi theo tuyến trong sim

**Model:** cần model mạnh (qwen-3.8-max).

```text
TÊN TASK: PRIORITY-1

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, docs/agent/DECISIONS.md (mục xe ưu tiên).
Đặc tả docs/superpowers/specs/2026-10-14-smart-traffic-bac-design.md dòng 317-320 (priority_kind) và 474-478 (tuyến sóng xanh).

=== SỰ THẬT TRONG MÃ (outputs/hcmc-poc/city-traffic-sim-31.js) ===
- Xe không phải object mà là mảng typed theo chỉ số i (:443-449): lane, s, v, lat, jit, gen, active, pending, kind, len, wid, path (N×PN, PN = 4), next, prevLane, lock*.
- Loại xe TRAFFIC_KINDS 0 xe máy, 1 ô tô, 2 buýt, 3 tải (:38-43). Gán loại lúc sinh (:413).
- KHÔNG có tìm đường ngắn nhất. planNext (:519-566) chọn lối ngẫu nhiên có trọng số; fillPath/shiftPath (:567-568) giữ 4 làn nhìn trước; có hook routeBias (:550).
- Làn là object lanes (:171): edge, dir, from, to, length, speed, rank…
- Bộ phá kẹt: :928, :1010. respawn: :712-726.
- API trả về: :1198-1231.
- Hash cổ điển c05ce91e: test/sim-state-32.test.mjs:86, a1-metric-32.test.mjs:58, m5a-32.test.mjs:209.

=== MỤC TIÊU ===
API sim dispatchPriority({kind, fromLane, toLane}) sinh một xe ưu tiên đi đúng tuyến ngắn nhất tới đích. Không gọi API này thì hành vi và hash giữ nguyên.

=== ĐƯỢC SỬA ===
city-traffic-sim-31.js, test mới outputs/hcmc-poc/test/priority-32.test.mjs.

=== KHÔNG ĐƯỢC SỬA ===
Controller, vẽ, kịch bản (để các bước sau).

=== CÁC BƯỚC ===
1. Thêm mảng prio Uint8 (0 không, 1 cứu thương, 2 cứu hỏa, 3 cảnh sát). Giữ kind là ô tô (1), riêng cứu hỏa là tải (3).
   Thêm hàm shortestLanePath(fromLane, toLane): Dijkstra trên đồ thị làn, trọng số length/speed; chỉ đi làn đúng chiều và trong region đang bật.
   ĐIỂM DỪNG: test — tuyến tìm được liên tục (lanes[k].to === lanes[k+1].from) và có độ dài ≤ tuyến bất kỳ khác trên một đồ thị nhỏ.
2. dispatchPriority: lấy một chỉ số xe đang không hoạt động (hoặc respawn một xe xa nhất), đặt vào fromLane, gán prio và tuyến. planNext với xe có prio thì lấy làn kế từ tuyến, KHÔNG gọi rand.
   Xe ưu tiên:
   - Không bị bộ phá kẹt tái sinh.
   - Tốc độ mong muốn ×1,3 (kẹp theo giới hạn hiện có).
   - Tới đích thì tắt (active = 0) và ghi vào priorityLog {id, kind, t_start, t_end, lanes, stops} để PRIORITY-5 dùng.
   API mới: dispatchPriority, priorityState() (danh sách xe ưu tiên đang chạy: i, kind, lane, s, ETA tới các nút có đèn trên tuyến), priorityLog().
   ĐIỂM DỪNG: test — seed 31031 khu Bắc, tuyến 2 km: xe tới đích trong ≤ 1800 s, priorityLog có 1 bản ghi; 3 test hash vẫn PASS.
3. ETA tới các nút có đèn trên tuyến: tính bằng (quãng còn lại)/(tốc độ mong muốn). Sim chưa dùng ETA này; PRIORITY-2 sẽ dùng.

=== KIỂM ===
node --test "outputs/hcmc-poc/test/*.test.mjs" toàn PASS.

=== KHI NÀO DỪNG ===
Bước 2 làm đổi hash cổ điển mà 2 lần sửa không hết thì DỪNG, báo cáo.

=== BÁO CÁO ===
work/PRIORITY-1.report.md theo mẫu RULES mục 13. Ghi chữ ký API chính xác, để PRIORITY-2…5 dùng.
Commit: "PRIORITY-1: xe ưu tiên đi tuyến ngắn nhất trong sim".
```

---

## PRIORITY-2: làn sóng xanh cho xe ưu tiên

**Model:** cần model mạnh.

```text
TÊN TASK: PRIORITY-2

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, work/PRIORITY-1.report.md (API priorityState).

=== SỰ THẬT TRONG MÃ ===
outputs/hcmc-poc/traffic-controller-32.js:
- Sim gọi controller.update(t, queues) (sim :1021), isGreen (:316, có nhánh override :316-323), runsRed (:533), stateOf (:343).
- overridePhase(node, group, duration_s, by, reason) ở :497-514: kẹp 1–120 s (:501); đổi nhóm qua vàng 3 s + đỏ chung 2 s (ovTarget :506-511).
- Thuật toán: switch trong decision() (:289-297). fixed dùng green0S 22 / green1S 16. SIGNAL_PARAMS_32 ở :5-13.
- Nhóm pha theo hướng vào: arriveGroup trong outputs/hcmc-poc/signal-plan-32.js:41-54.

=== MỤC TIÊU ===
Khi xe ưu tiên sắp tới một nút có đèn, hướng của nó được xanh trước khi tới, rồi trả về thuật toán đang chạy. Áp dụng cho MỌI algorithm, kể cả fixed.

=== ĐƯỢC SỬA ===
traffic-controller-32.js, city-traffic-sim-31.js (chỉ chỗ truyền priorityState sang controller), test.

=== CÁC BƯỚC ===
1. Đo nền TRƯỚC khi sửa: seed 31031–31035, peak-hang-xanh, một xe cứu thương mỗi seed, cùng tuyến từ đầu Điện Biên Phủ qua Hàng Xanh tới cầu Sài Gòn (chọn làn theo tên đường; ghi id làn). Ghi thời gian đi hết tuyến và số lần dừng (v < 1 m/s quá 2 s) ở 2 chế độ fixed và max-pressure.
   ĐIỂM DỪNG: bảng nền 5 seed × 2 chế độ.
2. Controller.requestPriority(node, group, eta_s, vehicleId). Khi eta_s ≤ 12 s:
   - Nhóm của xe đang xanh: giữ xanh tới khi xe qua.
   - Đang đỏ: chuyển qua vàng/đỏ chung như overridePhase.
   Xe qua nút hoặc quá 60 s thì nhả. stateOf ghi mode "priority". Sim gọi requestPriority mỗi bước cho các nút có đèn trên tuyến.
   ĐIỂM DỪNG: test đơn vị controller với hàng đợi giả lập.
3. Đo lại như bước 1.

=== NGƯỠNG ===
Mặc định, so với nền bước 1:
- Thời gian đi hết tuyến giảm ≥ 25 % ở cả 2 chế độ.
- Trung bình ≤ 1 lần dừng tại nút có đèn.
- A1 của xe thường trong cùng lần chạy không tệ hơn 10 %.

=== KIỂM ===
node --test PASS (gồm hash cổ điển).

=== KHI NÀO DỪNG ===
Chỉnh tối đa 2 vòng ngưỡng eta (8–15 s). Không đạt thì giữ bản tốt nhất, báo cáo số.

=== BÁO CÁO ===
work/PRIORITY-2.report.md theo mẫu RULES mục 13, gồm bảng trước/sau.
Commit: "PRIORITY-2: làn sóng xanh cho xe ưu tiên".
```

---

## PRIORITY-3: xe khác nhường đường

**Model:** deepseek-v4.1-flash. Dùng qwen nếu deepseek làm đổi hash.

```text
TÊN TASK: PRIORITY-3

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, work/PRIORITY-1.report.md, work/PRIORITY-2.report.md.

=== SỰ THẬT TRONG MÃ (city-traffic-sim-31.js) ===
- Mảng lat là độ lệch ngang trong làn (:443-449).
- tryAcquire(i, inL, depth, plan, ignorePriority) ở :605. Kiểm đèn ở :613 gồm green(), sigHeld, controller.runsRed, redRunOk.
- acquire(i, ignorePriority) ở :637.
- redRunOk ở :434-441.

=== MỤC TIÊU ===
Xe trong 60 m phía trước xe ưu tiên, cùng làn hoặc làn kề cùng chiều, thì tạt lề (tăng |lat|) và giảm tốc. Xe đứng đầu hàng ở đèn đỏ, chắn đúng làn xe ưu tiên, được phép vượt vạch vào nút để dọn đường.
Mỗi xe nhường được ghi lại.

=== ĐƯỢC SỬA ===
city-traffic-sim-31.js, test.

=== CÁC BƯỚC ===
1. Thêm mảng yieldUntil Float32 và yieldFor Int32 (id xe ưu tiên). Khi bắt đầu nhường thì ghi yieldLog {i, gen, prioId, t, kind: 'pull-over' | 'clear-red'}.
   ĐIỂM DỪNG: test — xe ưu tiên phía sau một hàng xe đứng đèn đỏ thì có ≥ 1 bản 'clear-red' và xe ưu tiên qua nút.
2. API: yieldLog(sinceT), yieldStateOf(i).
3. Đo: chạy lại bộ đo của PRIORITY-2 (5 seed). Ghi số lần nhường trung bình và thời gian đi hết tuyến.

=== KIỂM ===
node --test PASS (gồm hash cổ điển).

=== NGƯỠNG ===
Mặc định: thời gian đi hết tuyến không tệ hơn PRIORITY-2; mỗi lần chạy có ≥ 1 sự kiện nhường.

=== KHI NÀO DỪNG ===
2 vòng chỉnh.

=== BÁO CÁO ===
work/PRIORITY-3.report.md theo mẫu RULES mục 13.
Commit: "PRIORITY-3: xe khác tạt lề và dọn đường cho xe ưu tiên".
```

---

## PRIORITY-4: kịch bản "Xe ưu tiên" và cách vẽ xe ưu tiên

**Model:** deepseek-v4.1-flash.

```text
TÊN TASK: PRIORITY-4

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, work/PRIORITY-1.report.md, work/PRIORITY-2.report.md (id làn của tuyến đo).

=== SỰ THẬT TRONG MÃ ===
outputs/hcmc-poc/scenarios-32.js:
- Khóa ở :12 gồm none, peak-hang-xanh, lane-block, flood-nhc. Nhãn ở :13-18.
- start(name, p) ở :187-207: gặp khóa lạ thì ném RangeError (:188). Các hàm startPeak :128, startBlock :134, startFlood :147.
- Đăng ký trong smart-app-32.js installScenarios32 :339-372. Nút sinh từ SCENARIO_KEYS_32 (:340). Lệnh từ backend đi qua station-client-32.js:434-449.
- Backend gửi khóa "priority-run" (schemas.py:178, officer.py:293-310). Web gọi khóa "priority-run" (outputs/smart-traffic/web/src, controls.ts:3,10).
outputs/hcmc-poc/city-traffic-31.js:
- 4 InstancedMesh theo loại xe (:233-247). Màu qua thuộc tính instanced paint (:236-237), ghi ở :325.
- Mẫu mesh phụ auxMesh (:249-263). Emissive emit*emitScale (:240). draw ở :312-330 chưa có biến thời gian.

=== MỤC TIÊU ===
Bấm "Xe ưu tiên" trên panel hoặc từ web công an thì một xe cứu thương chạy tuyến chuẩn. Nhìn thấy rõ: màu trắng-đỏ và đèn nháy xanh-đỏ trên nóc.

=== ĐƯỢC SỬA ===
scenarios-32.js, city-traffic-31.js (phần vẽ), smart-app-32.js (chỉ đăng ký nút nếu cần), test.

=== CÁC BƯỚC ===
1. Thêm khóa "priority-run" (đúng khóa backend và web đang dùng), nhãn "Xe ưu tiên". Hàm startPriority gọi dispatchPriority với tuyến chuẩn (id làn từ PRIORITY-2). stop thì xóa xe ưu tiên.
   ĐIỂM DỪNG: test — start('priority-run') không ném lỗi; status() báo xe đang chạy.
2. Vẽ:
   - Xe có prio thì paint trắng.
   - Thêm 1 auxMesh "thanh đèn" trên nóc. Emissive xen kẽ đỏ/xanh theo thời gian, chu kỳ 0,5 s. Truyền thời gian qua uniform, không tạo vật liệu mới mỗi khung.
   - Xe ưu tiên không bị bỏ qua khi nhỏ (cull MIN_PX ở :322).
3. Chụp ảnh work/priority-4.png bằng Playwright: góc nhìn Hàng Xanh khi xe ưu tiên đang qua.

=== KIỂM ===
node --test PASS.
Bật server tĩnh rồi chạy:
PORT=8831 node outputs/hcmc-poc/scripts/qa-north-32.cjs
PORT=8831 node outputs/hcmc-poc/scripts/qa-traffic-31.cjs webgl

=== KHI NÀO DỪNG ===
Hết bước 3.

=== BÁO CÁO ===
work/PRIORITY-4.report.md theo mẫu RULES mục 13.
Commit: "PRIORITY-4: kịch bản priority-run và vẽ xe ưu tiên".
```

**Duyệt (bạn):** xem ảnh `work/priority-4.png`.

---

## PRIORITY-5: gắn cờ "nghi nhường xe ưu tiên" và lỗi không nhường

**Model:** deepseek-v4.1-flash.

```text
TÊN TASK: PRIORITY-5

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, work/PRIORITY-1.report.md, work/PRIORITY-3.report.md (priorityLog, yieldLog).
Đặc tả dòng 373-374, 450, 474-478, 313-314, 1046-1047 (mức phạt NO-PRIORITY).

=== SỰ THẬT TRONG MÃ ===
outputs/hcmc-poc/violation-rules-32.js:
- Bảng [mã, xác suất] theo loại xe ở :56-58. violatorOf32 ở :62-68.
- penaltyOf32 ở :77-118; mã lạ rơi vào default (:115-116).
- CODE_LABEL_32 ở :30-41, ALL_CODES_32 ở :26. CHƯA có NO-PRIORITY.
outputs/hcmc-poc/violation-perception-32.js: đặt cứng priority_flag false, priority_reason null ở :255 và :311.
Backend đã có NO-PRIORITY (outputs/smart-traffic/backend/app/schemas.py:19). station.py:107 tự chuyển needs_review khi priority_flag.

=== MỤC TIÊU ===
- Vi phạm xảy ra trên tuyến xe ưu tiên, trong cửa sổ [t_start − 5 s, t_end + 5 s] (đặc tả :474-478), được gắn priority_flag = true, priority_reason = "nghi nhường xe ưu tiên".
- Thêm mã NO-PRIORITY: xe trong 60 m trước xe ưu tiên, cùng làn, không có bản yieldLog trong 5 s.

=== ĐƯỢC SỬA ===
violation-rules-32.js, violation-perception-32.js, test.

=== CÁC BƯỚC ===
1. Test FAIL: vi phạm RED-LIGHT của một xe có bản yieldLog 'clear-red' thì có priority_flag true.
   ĐIỂM DỪNG: FAIL rồi PASS.
2. NO-PRIORITY: thêm vào ALL_CODES_32, CODE_LABEL_32 ("Không nhường đường xe ưu tiên") và penaltyOf32 theo đặc tả :1046-1047. Luật dùng priorityState và yieldLog.
3. Chạy sim 8 phút cao điểm với 2 xe ưu tiên. Đếm số vi phạm có cờ và số NO-PRIORITY.

=== KIỂM ===
node --test PASS.

=== KHI NÀO DỪNG ===
Hết bước 3.

=== BÁO CÁO ===
work/PRIORITY-5.report.md theo mẫu RULES mục 13.
Commit: "PRIORITY-5: cờ nghi nhường xe ưu tiên và lỗi NO-PRIORITY".
```

---

## PRIORITY-6: backend và web cho cờ ưu tiên

**Model:** deepseek-v4.1-flash.

```text
TÊN TASK: PRIORITY-6

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, docs/agent/HANDOFF.md mục 2, work/PRIORITY-5.report.md.

=== SỰ THẬT TRONG MÃ ===
Backend (outputs/smart-traffic/backend/app/):
- Bảng violations có priority_flag và priority_reason (models.py:28).
- GET /officer/violations (officer.py:25-51) chưa lọc theo cờ.
- GET /officer/complaints (:115-131).
- ComplaintIn: kind ∈ {priority_vehicle, wrong_plate, other} (schemas.py:83-87).
- Tạo khiếu nại: citizen_portal.py:197-216, chuyển vi phạm sang disputed (:203).
- Override đèn: backend cho tới 600 s (schemas.py:170), nhưng controller kẹp 120 s.
Web (outputs/smart-traffic/web/src/):
- entries/officer/ViolationsTab.tsx: đã có badge (:138-139), bộ lọc ở :8 chưa có cờ.
- entries/officer/ComplaintsTab.tsx.
- entries/citizen/ViolationDetail.tsx: form khiếu nại :151-164, KIND_OPTIONS :13-14.
- lib/labels.ts:26: nhãn priority_vehicle là "Xe được ưu tiên đi trước". Sai ý, phải là "Tôi đã nhường đường cho xe ưu tiên".

=== MỤC TIÊU ===
Công an lọc và gỡ được vi phạm có cờ; người dân khiếu nại với lý do nhường xe ưu tiên.

=== ĐƯỢC SỬA ===
backend app/** cùng test pytest; web src/** cùng test vitest.

=== CÁC BƯỚC ===
1. Backend:
   - Thêm tham số priority_flag (bool) cho GET /officer/violations.
   - Schema giới hạn duration_s của override ≤ 120, khớp controller; sửa test.
   ĐIỂM DỪNG: pytest PASS.
2. Web công an:
   - Thêm bộ lọc "Nghi nhường xe ưu tiên".
   - Thêm nút "Gỡ do nhường xe ưu tiên": gọi dismiss với lý do cố định, lý do vào audit.
3. Web người dân: sửa nhãn priority_vehicle. Nếu vi phạm có cờ thì hiện dòng giải thích và chọn sẵn lý do này.
4. E2E nhanh: chạy run-smart, bấm kịch bản priority-run 3 phút, thấy ≥ 1 vi phạm có cờ trên web công an. Chụp work/priority-6.png.

=== KIỂM ===
pytest PASS; npm run test và npm run build trong outputs/smart-traffic/web PASS.

=== KHI NÀO DỪNG ===
3 phút E2E không có vi phạm nào có cờ thì ghi lại, KHÔNG chỉnh tỉ lệ vi phạm.

=== BÁO CÁO ===
work/PRIORITY-6.report.md theo mẫu RULES mục 13.
Commit: "PRIORITY-6: lọc/gỡ cờ ưu tiên ở web công an, khiếu nại nhường xe ưu tiên".
```

# Bộ prompt cho phase sau (tự chạy)

## Cách dùng

1. Clone repo, rồi chuyển sang nhánh làm việc:
   ```bash
   git checkout Kietvo2k/smart-traffic-bac
   ```
2. Tạo nhánh con cho mỗi việc lớn, ví dụ:
   ```bash
   git checkout -b smart/demand
   ```
3. Mở công cụ agent (opencode, VietCode, Codex…) **ở thư mục gốc repo**. Mỗi prompt chạy trong **một phiên mới**: dán nguyên khối prompt, không cần thêm ngữ cảnh.
4. Khi agent xong, tự kiểm:
   - Đọc `work/<TÊN>.report.md`.
   - Chạy lại các lệnh kiểm trong prompt.
   - Xem `git log -3 --stat` để chắc agent chỉ sửa đúng file được phép.
   - Ổn thì push.
5. Agent không đạt sau 2 vòng thì **dừng, đừng vá tiếp**. Ghi lại số đo vào `docs/agent/HANDOFF.md` mục 3, rồi chuyển việc khác.

Mọi prompt đều dựa trên `docs/agent/RULES.md`, `docs/agent/DECISIONS.md`, `docs/agent/HANDOFF.md`.

**Chọn model:**
- **Model mạnh** (qwen-3.8-max, Codex): việc A-Z cần đủ ngữ cảnh.
- **Model rẻ** (deepseek-v4.1-flash, muse-spark, ox-alpha): việc đã chia nhỏ, phạm vi 1–3 file.

**Thứ tự đề xuất:** 1 DEMAND → 2 PERF → 3 PRIORITY → 4 A1 → 5 việc nhỏ. Nếu máy đang lag khi chạy lâu, làm PERF-2 và PERF-3 trước.

---

## 1. DEMAND: sửa phân bổ nhu cầu để mạng không tắc cứng ở mật độ app

**Model:** qwen-3.8-max (làm trọn). Nếu dùng deepseek thì tách thành bước đo (1–2) và bước sửa (3–5).

```text
TÊN TASK: DEMAND. Đọc docs/agent/RULES.md, docs/agent/DECISIONS.md, docs/agent/HANDOFF.md (mục 3.1), rồi đặc tả docs/superpowers/specs/2026-10-14-smart-traffic-bac-design.md mục 6.4, 9.2 và Nhật ký sửa đổi mục 20–23.

Vấn đề: ở cấu hình app smart (kịch bản `app-1730` trong scripts/kpi-ab-32.mjs: poolScale 5, breakerS 180, khóa khu Bắc biên 0 + cầu Sài Gòn, giờ 17:30), mạng khu Bắc tắc cứng. Bộ phá kẹt (respawn khi stopT > breakerS trong outputs/hcmc-poc/city-traffic-sim-31.js) kích hoạt khoảng 2000 lần trong 1800 s. Ở Hàng Xanh, nhóm pha 1 gần như không có xe (fixed TB 0,9 xe, nhóm 0 là 39,4). Nguyên nhân nằm ở phân bổ nhu cầu (điểm sinh, OD, xác suất rẽ, xe đi ra khỏi khu bị khóa), không nằm ở thuật toán đèn.

Được sửa: outputs/hcmc-poc/city-traffic-sim-31.js (chỉ phần sinh xe, chọn đích, rẽ, demand); hằng nhu cầu khu Bắc (tìm NORTH_DEMAND_32 và DEMAND_BY_HOUR_32); scripts/kpi-ab-32.mjs (thêm đầu ra đo); test trong outputs/hcmc-poc/test/. KHÔNG sửa traffic-controller-32.js và signal-plan-32.js.

Việc:
1. Đo trước khi sửa (seed 31031–31035, 1800 s, fixed và max-pressure). Thêm vào đầu ra JSON của kpi-ab-32.mjs: số lần bộ phá kẹt kích hoạt (toàn khu và trong 300 m quanh Hàng Xanh (0, −2485)); số xe trung bình trên làn vào HX theo nhóm pha 0/1; số xe đang chạy trong khu Bắc; tỉ lệ xe dừng (v < 1 m/s). Ghi bảng "trước".
2. Tìm nguyên nhân bằng số: phân bố điểm sinh và đích theo hướng vào HX (Điện Biên Phủ, Xô Viết Nghệ Tĩnh, Bạch Đằng, Nguyễn Hữu Cảnh…); các nút hoặc làn có xe dừng lâu nhất (top 10); xe kẹt vì đích nằm ở khu bị khóa hoặc đường bị ẩn. Ghi giả thuyết kèm số.
3. Sửa tối thiểu, tất định theo seed, CHỈ áp dụng khi có `demand` hoặc cấu hình app (không truyền tham số mới thì sim giữ hash cổ điển `c05ce91e`). Gợi ý: cân bằng OD theo hướng; xe ra biên khu khóa thì biến mất thay vì dừng; giới hạn số xe sinh khi làn sinh đầy; xác suất rẽ hợp lý ở nút lớn.
4. Mục tiêu (app-1730, 1800 s, cả fixed và max-pressure, seed 31031–31035):
   - Số lần phá kẹt giảm ≥ 80 % so với bảng "trước".
   - Cả hai nhóm pha HX đều có xe chờ (nhóm ít hơn ≥ 25 % nhóm nhiều hơn).
   - Số xe quanh HX (300 m) giờ cao điểm trong khoảng 250–450.
   - Không còn vùng xe đứng yên > 180 s kéo dài.
   Chỉnh tối đa 2 vòng. Không đạt thì giữ thay đổi tốt nhất sau một cờ trong `demand`, rồi báo cáo bằng số.
5. Kiểm: node --test "outputs/hcmc-poc/test/*.test.mjs" toàn PASS (gồm test hash cổ điển); PORT=8831 node outputs/hcmc-poc/scripts/qa-north-32.cjs; PORT=8831 node outputs/hcmc-poc/scripts/qa-traffic-31.cjs webgl. Đo lại A1 tham khảo (không chỉnh đèn): node scripts/kpi-ab-32.mjs --seeds 31031-31035 --scenario app-1730 --duration 1800 --mode both --out work/kpi-demand.
Commit: "DEMAND: cân bằng nhu cầu khu Bắc, giảm phá kẹt ở mật độ app". Báo cáo work/DEMAND.report.md gồm bảng trước/sau.
```

---

## 2. PERF: giới hạn tài nguyên khi chạy 24/7

Đọc `docs/PERFORMANCE-24-7.md` trước. Bốn prompt dưới đây độc lập, chạy theo thứ tự.

### PERF-1: đo nền

**Model:** deepseek.

```text
TÊN TASK: PERF-1. Đọc docs/agent/RULES.md và docs/PERFORMANCE-24-7.md. KHÔNG sửa mã ứng dụng. Chỉ tạo scripts/perf-soak-32.cjs và ghi kết quả.
Viết script Playwright (dùng Playwright đã có, xem cách outputs/hcmc-poc/scripts/qa-north-32.cjs nạp nó):
- Mở http://127.0.0.1:<PORT>/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&region=bac (server tĩnh outputs/hcmc-poc/serve.py; backend và web bật bằng outputs/smart-traffic/run-smart.sh nếu có cờ --with-backend).
- Chạy N phút (mặc định 20, cờ --minutes). Cứ 30 s ghi: FPS (đếm requestAnimationFrame), performance.memory.usedJSHeapSize, số bản ghi IndexedDB của hàng đợi trạm, số request mạng/phút theo đường dẫn; CPU và RAM tiến trình trình duyệt và python (đọc từ hệ điều hành); kích thước file SQLite và thư mục ảnh bằng chứng.
- Hai pha: tab hiện 10 phút, rồi tab ẩn (page.evaluate giả lập visibilitychange hoặc mở tab khác đè lên) 10 phút.
- Xuất work/perf-baseline.json và một bảng tóm tắt.
Kiểm: chạy thật 20 phút. Commit: "PERF-1: script đo tài nguyên chạy dài". Báo cáo work/PERF-1.report.md, gồm bảng số hiện/ẩn và nguồn tải lớn nhất.
```

### PERF-2: tiết kiệm phía trình duyệt

**Model:** deepseek.

```text
TÊN TASK: PERF-2. Đọc docs/agent/RULES.md, docs/PERFORMANCE-24-7.md và work/PERF-1.report.md (nếu có).
Chỉ sửa các module *-32.js của app smart (smart-app-32.js, camera-capture-32.js, station-client-32.js, station-queue-32.js, heat-live-32.js, forecast-client-32.js) và test. Chỉ sửa webgpu-materials-24.js khi bắt buộc để chèn hook giới hạn khung, và hook đó chỉ bật khi app=smart. 31A cổ điển phải y nguyên.
Việc:
(a) Giới hạn FPS khi app=smart: mặc định 30. Không tương tác 60 s thì 10. Tab ẩn thì dừng render, nhưng sim và trạm vẫn chạy theo đồng hồ, bước sim gộp.
(b) Khung stream camera chỉ chụp và gửi khi backend báo có người xem camera đó; nếu chưa có tín hiệu thì tối đa 1 khung/5 s/camera. Ảnh bằng chứng chỉ render khi có vi phạm.
(c) Thu nhiệt 15 s/lần. Tua trước dự báo chạy theo yêu cầu hoặc 5 phút/lần.
(d) Hàng đợi IndexedDB tối đa 2000 bản ghi; vượt thì bỏ frames và telemetry cũ trước, không bỏ vi phạm.
(e) Công tắc "Tiết kiệm tài nguyên" trên panel (UI tiếng Việt, không dùng chữ cấm), lưu localStorage.
Kiểm: node --test toàn PASS; qa-north-32 và qa-capture-32 PASS; qa-traffic-31 webgl PASS; chạy scripts/perf-soak-32.cjs 20 phút và so với work/perf-baseline.json. Mục tiêu: CPU tab ẩn giảm ≥ 70 %, heap không tăng > 15 % trong 20 phút.
Commit: "PERF-2: giới hạn FPS, chụp theo yêu cầu, trần hàng đợi trạm". Báo cáo work/PERF-2.report.md, gồm bảng trước/sau.
```

### PERF-3: trần đĩa và bộ nhớ ở backend và web

**Model:** deepseek.

```text
TÊN TASK: PERF-3. Đọc docs/agent/RULES.md, docs/agent/HANDOFF.md mục 2 và docs/PERFORMANCE-24-7.md.
Chỉ sửa outputs/smart-traffic/backend/app/** (config, media, station, một tác vụ dọn nền) cùng test, và outputs/smart-traffic/web/src/** cùng test.
Việc:
(a) Backend: cấu hình (biến môi trường, có mặc định) giữ telemetry, heat, frames tối đa 24 giờ; ảnh frame tối đa 500 MB, xóa cũ nhất trước. KHÔNG xóa bằng chứng của vi phạm chưa ở trạng thái cuối. Tác vụ dọn chạy 10 phút/lần, VACUUM SQLite mỗi ngày. Có endpoint admin xem dung lượng.
(b) Web: danh sách vi phạm và sự kiện giữ tối đa 500 mục trong state, có phân trang hoặc ảo hóa; gom tin WS theo lô 500 ms; lưới stream chỉ đăng ký camera đang hiện trên màn hình và báo backend "đang xem" để trạm biết (khớp PERF-2 mục b; thêm route nhỏ trong station nếu cần, có test).
Kiểm: pytest toàn PASS; npm run test và npm run build trong web PASS. Commit: "PERF-3: xoay vòng dữ liệu backend, giới hạn state web". Báo cáo work/PERF-3.report.md.
```

### PERF-4 (tùy chọn): trạm headless chạy 24/7 không cần tab 3D

**Model:** qwen-3.8-max.

```text
TÊN TASK: PERF-4. Đọc docs/agent/RULES.md, docs/agent/HANDOFF.md, docs/PERFORMANCE-24-7.md.
Mục tiêu: một tiến trình Node (scripts/station-headless-32.mjs) chạy sim khu Bắc + bộ điều khiển + luật vi phạm 24/7 và gửi lên backend đúng hợp đồng /station/* như station-client-32.js, nhưng không render. Tab 3D lúc này chỉ để xem: nhận trạng thái từ backend, hoặc tự chạy sim cùng seed và đồng bộ đồng hồ.
Vi phạm không có ảnh 3D thì gửi bằng chứng dạng sơ đồ 2D (PNG vẽ bằng canvas Node nếu có sẵn, nếu không thì không gửi ảnh) và đánh trạng thái needs_review. Không dùng chữ cấm trong dữ liệu hiển thị.
Dùng lại module JS thuần đã chạy được trong Node (city-traffic-sim-31.js, traffic-controller-32.js, violation-rules-32.js, violation-perception-32.js nếu không phụ thuộc DOM). Không nhân bản logic.
Thêm cờ --headless vào outputs/smart-traffic/run-smart.sh và .ps1.
Kiểm: chạy 30 phút; backend nhận vi phạm, metrics, heat; RAM tiến trình ổn định (tăng < 10 %); pytest và node --test PASS.
Commit: "PERF-4: trạm headless Node chạy sim và vi phạm 24/7". Báo cáo work/PERF-4.report.md.
```

---

## 3. PRIORITY (M5b-2): xe ưu tiên, làn sóng xanh, gắn cờ nhường đường

### PRIORITY-a: sim và đèn

**Model:** qwen-3.8-max.

```text
TÊN TASK: PRIORITY-a. Đọc docs/agent/RULES.md, docs/agent/DECISIONS.md (mục xe ưu tiên), docs/agent/HANDOFF.md, đặc tả mục 4.4 (cờ xe ưu tiên) và 7.3.
Được sửa: outputs/hcmc-poc/city-traffic-sim-31.js (thêm loại xe ưu tiên, hành vi nhường), outputs/hcmc-poc/traffic-controller-32.js (ưu tiên pha), outputs/hcmc-poc/scenarios-32.js (kịch bản thứ 4 "Xe ưu tiên"), city-traffic-31.js (chỉ phần vẽ màu/đèn nháy của xe ưu tiên), test.
Việc:
(1) API sim: dispatchPriority({kind: 'ambulance'|'fire'|'police', from, to, seed}) sinh một xe đi tuyến ngắn nhất. Không gọi API này thì hash cổ điển c05ce91e giữ nguyên.
(2) Làn sóng xanh: bộ điều khiển nhận thời điểm xe ưu tiên sắp tới nút (ETA từ sim) và chuyển xanh cho hướng của nó trước khoảng 8–12 s, giữ tới khi xe qua, rồi trả về thuật toán đang dùng. Áp dụng cho mọi algorithm.
(3) Xe khác trong 60 m phía trước cùng hướng thì tạt lề hoặc nhường. Ở nút đỏ, xe đứng đầu có thể vượt vạch để nhường; gắn cờ yieldingToPriority vào trạng thái xe kèm id xe ưu tiên và thời điểm.
(4) Kịch bản "Xe ưu tiên": bấm là chạy một xe cứu thương từ đầu Điện Biên Phủ qua Hàng Xanh tới cầu Sài Gòn.
Mục tiêu đo (Node, seed 31031–31035, peak-hang-xanh): thời gian xe ưu tiên đi hết tuyến khi có làn sóng xanh giảm ≥ 30 % so với không có; xe ưu tiên dừng tại nút ≤ 1 lần.
Kiểm: node --test PASS, qa-north-32 PASS, qa-traffic-31 webgl PASS.
Commit: "PRIORITY-a: xe ưu tiên, làn sóng xanh, nhường đường trong sim". Báo cáo work/PRIORITY-a.report.md.
```

### PRIORITY-b: vi phạm, backend, web

**Model:** deepseek. Chạy sau PRIORITY-a.

```text
TÊN TASK: PRIORITY-b. Đọc docs/agent/RULES.md, docs/agent/HANDOFF.md mục 2, đặc tả mục 4.4 và 4.5, work/PRIORITY-a.report.md.
Được sửa: outputs/hcmc-poc/violation-rules-32.js (gắn cờ), outputs/hcmc-poc/station-client-32.js (gửi cờ), outputs/smart-traffic/backend/app/** (lưu cờ, lọc), outputs/smart-traffic/web/src/** (hiển thị, duyệt gỡ, khiếu nại), cùng test.
Việc:
(1) Vi phạm (vượt đỏ, quá vạch, lấn làn) của xe có yieldingToPriority trong ±20 s thì gắn cờ "nghi nhường xe ưu tiên" (theo trường đặc tả 4.4), trạng thái needs_review.
(2) Thêm mã lỗi "không nhường xe ưu tiên": xe ở 60 m trước xe ưu tiên, cùng hướng, không giảm tốc hoặc không tạt lề trong 5 s.
(3) Web công an: lọc theo cờ, nút "Gỡ do nhường xe ưu tiên" (lý do vào audit). Web người dân: khi khiếu nại có lựa chọn lý do "nhường xe ưu tiên".
Kiểm: node --test, pytest, web npm run test và npm run build đều PASS. E2E nhanh: chạy kịch bản "Xe ưu tiên" 3 phút với run-smart, thấy ≥ 1 vi phạm có cờ trên web công an.
Commit: "PRIORITY-b: cờ nghi nhường xe ưu tiên, lỗi không nhường, duyệt và khiếu nại". Báo cáo work/PRIORITY-b.report.md.
```

---

## 4. A1: phối hợp dải xanh trục Điện Biên Phủ

**Model:** qwen-3.8-max. Làm sau DEMAND, vì nhu cầu đổi thì phải đo lại.

```text
TÊN TASK: A1-GW. Đọc docs/agent/RULES.md, docs/agent/HANDOFF.md mục 3.4, đặc tả mục 6 và 9.2, Nhật ký sửa đổi mục 20–23 (các biến thể A–F đã thử và vì sao thất bại). Đọc work/DEMAND.report.md nếu có.
Được sửa: outputs/hcmc-poc/traffic-controller-32.js (thêm algorithm mới, KHÔNG đổi mặc định cho tới khi đạt), outputs/hcmc-poc/signal-plan-32.js (offset, độ dài làn), scripts/kpi-ab-32.mjs, test.
Chỉ số A1: độ trễ tích lũy mỗi xe qua vạch các nút HX trong t ∈ [300, 1800] s. Đạt khi TB Δ ≥ 15 %, không seed nào âm, thông lượng ≥ 95 % fixed. Đo ở CẢ peak-hang-xanh VÀ app-1730.
Việc:
(1) Biến thể G `green-wave-mp`: các nút HX dọc Điện Biên Phủ dùng chung chu kỳ, offset theo khoảng cách/tốc độ tự do; trong mỗi chu kỳ max-pressure chỉ được dời điểm chia pha ±25 %. Ngưỡng làn ra tính theo chiều dài làn còn trống (m), không đếm xe.
(2) Chỉnh chỉ trên tập 31031–31035 (tối đa 2 vòng). Chấm MỘT lần trên tập mới 31051–31055. Ghi cả kết quả xấu.
(3) Đạt thì đặt G làm mặc định của app smart (fixed và hash cổ điển giữ nguyên). Không đạt thì giữ A, để G sau cờ.
Kiểm: node --test PASS; bảng A/F/G × 2 kịch bản × 2 tập seed. Ghi một dòng mới vào Nhật ký sửa đổi của đặc tả (mục 24).
Commit: "A1-GW: phối hợp dải xanh Điện Biên Phủ (biến thể G)". Báo cáo work/A1-GW.report.md.
```

---

## 5. Việc nhỏ

**Model:** deepseek hoặc ox-alpha. Mỗi mục một phiên.

Mẫu chung, thay `<…>` theo bảng bên dưới:

```text
TÊN TASK: <TÊN>. Đọc docs/agent/RULES.md và docs/agent/HANDOFF.md. Chỉ sửa <file>. Việc: <mô tả>. Kiểm: <lệnh>. Commit "<TÊN>: <tóm tắt>". Báo cáo ≤ 6 dòng vào work/<TÊN>.report.md.
```

| Tên | File | Việc | Kiểm |
|---|---|---|---|
| FIX-SPEED | `violation-rules-32.js`, sim (`behavior`), test | Lỗi quá tốc độ đang bằng 0. Cho một tỉ lệ nhỏ xe vượt tốc độ giới hạn tuyến; luật đo tốc độ qua 2 vạch ảo trước camera | `node --test`; sim 8 phút cao điểm có ≥ 1 SPEED |
| FIX-TURN | `traffic-signals-32.js` (đặt camera), `outputs/smart-traffic/backend/app/seed/cameras.json`, `violation-rules-32.js` | Thêm 1 camera tại nút có biển cấm rẽ/quay đầu trong khu Bắc; luật rẽ cấm | `node --test`, pytest, `qa-capture-32` |
| FIX-WRONGWAY | `camera-capture-32.js` | Ảnh bằng chứng ngược chiều: zoom hoặc cắt theo hộp bao của xe, xe chiếm ≥ 15 % chiều rộng khung | `qa-capture-32` + ảnh mẫu trong `work/` |
| FIX-BRIDGE | dữ liệu cầu (tìm theo id 306073179 và 165919725 trong `outputs/hcmc-poc/data/`) | Thêm trụ thiếu: cầu Sài Gòn 2 thiếu 1, Thủ Thiêm thiếu 2. Sau đó chạy `build_signature_registry_31.py` và validator | validator signature, `qa-north-32` |
| FIX-SPEC46 | `docs/superpowers/specs/…design.md` §4.6 | Sửa: vi phạm đi qua REST `POST /station/violations`, không qua WebSocket | — |
| FIX-PLATES | `outputs/smart-traffic/backend/app/seed/plates.json` hoặc bộ sinh | Xe gen > 2 phải tra ra chủ xe (sinh thêm hoặc fallback tất định) | pytest |
| CLEAN-2 | `outputs/hcmc-poc/scripts/validate_demo_ready.py`, `qa-app-integrity-30b.cjs`, các manifest băm cũ | Xóa 2 script còn gọi `?legacy=1` cùng manifest băm cũ và file chỉ manifest dẫn tới (phần Gia Lộc: test shared core và `projects/gia-loc.json` đã xong ở CLEANUP C) | `qa-project-hygiene`, test shared core, `qa-north-32`, mở app không có 404 |
| VIDEO-ONNX | `camera-capture-32.js`, web lưới stream | Video thật: thả `media/cameras/<mã camera>.mp4` thì phát thay khung render. Khe ONNX: tải model nếu có file, không có thì bỏ qua êm | `qa-capture-32`, web build |

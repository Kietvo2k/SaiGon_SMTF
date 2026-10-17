# Việc nhỏ độc lập

Mỗi việc một phiên, chạy được bất cứ lúc nào. Model: deepseek-v4.1-flash hoặc ox-alpha, trừ khi ghi khác.
Mỗi prompt đều ngầm theo `docs/agent/RULES.md`. Báo cáo theo mẫu ở mục 13 của file đó.

---

## FIX-LABELS: web hiện mã lỗi thô

```text
TÊN TASK: FIX-LABELS
=== ĐỌC TRƯỚC === docs/agent/RULES.md.
=== SỰ THẬT TRONG MÃ ===
- outputs/smart-traffic/web/src/lib/labels.ts:3-5: VIOLATION_CODE_LABELS chỉ có RED-LIGHT. Mã khác hiện nguyên mã thô (:7-9).
- Nhãn chuẩn lấy từ backend outputs/smart-traffic/backend/app/schemas.py (bảng nhãn quanh :19) và 3D outputs/hcmc-poc/violation-rules-32.js:30-41 (CODE_LABEL_32).
=== MỤC TIÊU === Web hiện nhãn tiếng Việt cho mọi mã lỗi mà backend có.
=== ĐƯỢC SỬA === outputs/smart-traffic/web/src/lib/labels.ts, test vitest.
=== CÁC BƯỚC ===
1. Test vitest: mọi mã trong danh sách backend đều có nhãn, không còn mã thô. Chạy thấy FAIL.
2. Thêm nhãn, khớp chữ với backend.
   ĐIỂM DỪNG: hai bộ nhãn web và backend lệch chữ thì theo backend, ghi lệch vào báo cáo.
=== KIỂM === npm run test và npm run build (trong outputs/smart-traffic/web) PASS.
=== KHI NÀO DỪNG === Hết bước 2.
=== BÁO CÁO === work/FIX-LABELS.report.md. Commit "FIX-LABELS: nhãn tiếng Việt cho mọi mã lỗi trên web".
```

---

## FIX-STATION-LOGIN: mật khẩu trạm nằm cứng trong mã client

```text
TÊN TASK: FIX-STATION-LOGIN
=== ĐỌC TRƯỚC === docs/agent/RULES.md (mục 12, bí mật).
=== SỰ THẬT TRONG MÃ ===
- outputs/hcmc-poc/station-client-32.js:17 (STATION_LOGIN_32) ghi cứng tài khoản trạm dev.
- Script chạy cả hệ: outputs/smart-traffic/run-smart.sh và run-smart.ps1.
=== MỤC TIÊU === Client không chứa mật khẩu. Trạm lấy token khi khởi chạy.
=== ĐƯỢC SỬA === station-client-32.js, run-smart.sh, run-smart.ps1 (ghi bằng Python, encoding utf-8-sig), backend app/routers (nếu cần route cấp token trạm, chỉ cho localhost), test.
=== CÁC BƯỚC ===
1. Chọn một cách và ghi vào báo cáo:
   (a) run-smart đăng nhập trước, rồi truyền token trạm qua tham số URL `station_token`, trang đọc xong thì xóa tham số đó khỏi thanh địa chỉ;
   (b) backend có route chỉ nhận yêu cầu từ 127.0.0.1, cấp token cho vai trò station.
2. Xóa STATION_LOGIN_32 khỏi client.
   ĐIỂM DỪNG: grep mật khẩu trạm trong outputs/hcmc-poc không còn kết quả nào.
=== KIỂM === node --test PASS; pytest PASS; chạy run-smart rồi thấy trạm gửi được metrics.
=== KHI NÀO DỪNG === Hết bước 2.
=== BÁO CÁO === work/FIX-STATION-LOGIN.report.md. Commit "FIX-STATION-LOGIN: bỏ mật khẩu trạm khỏi client".
```

---

## FIX-SPEED: lỗi quá tốc độ hiếm khi xuất hiện

```text
TÊN TASK: FIX-SPEED
=== ĐỌC TRƯỚC === docs/agent/RULES.md.
=== SỰ THẬT TRONG MÃ ===
- Sim nhân tốc độ ×1,5 với xe mang mã hành vi SPEED (outputs/hcmc-poc/city-traffic-sim-31.js:975, chỉ khi bật behavior :364-377).
- Lần đo gần nhất (STATION-b, 8 phút cao điểm, các camera HX) có 1 vi phạm SPEED.
=== MỤC TIÊU === Đo lại. Chỉ sửa nếu số lỗi quá ít để thuyết trình.
=== ĐƯỢC SỬA === violation-rules-32.js (tỉ lệ SPEED), violation-perception-32.js (đo tốc độ qua 2 vạch ảo trước camera nếu chưa có), test.
=== CÁC BƯỚC ===
1. Chạy 3 lần sim 8 phút cao điểm (3 seed), đếm SPEED.
   ĐIỂM DỪNG: trung bình ≥ 2 mỗi lần thì đóng task, không sửa gì.
2. Nếu ít hơn: tăng tỉ lệ SPEED trong bảng (:56-58) sao cho trung bình đạt 2–5 mỗi 8 phút. Không đổi mã khác.
=== KIỂM === node --test PASS.
=== KHI NÀO DỪNG === Hết bước 2.
=== BÁO CÁO === work/FIX-SPEED.report.md. Commit "FIX-SPEED: …" (chỉ khi có sửa).
```

---

## FIX-TURN: chưa có camera ở nút cấm rẽ

```text
TÊN TASK: FIX-TURN
=== ĐỌC TRƯỚC === docs/agent/RULES.md, docs/agent/HANDOFF.md.
=== SỰ THẬT TRONG MÃ ===
- Sim đã có mã WRONG-TURN và nút cấm rẽ trái khi bật behavior: `restricted`, city-traffic-sim-31.js:369-377 và :538.
- Camera chỉ có 2 cái: CAM-HX-001 và CAM-HX-002 (outputs/smart-traffic/backend/app/seed/cameras.json). Không cái nào nhìn thấy nút cấm rẽ.
- Đặt camera và cột: outputs/hcmc-poc/traffic-signals-32.js.
=== MỤC TIÊU === Thêm CAM-HX-003 nhìn một nút cấm rẽ trong khu Bắc. Bắt được WRONG-TURN.
=== ĐƯỢC SỬA === cameras.json, traffic-signals-32.js, violation-perception-32.js (nếu cần), test, test pytest seed.
=== CÁC BƯỚC ===
1. Liệt kê các nút `restricted` trong khu Bắc. Chọn một nút gần HX.
2. Thêm camera vào cameras.json (backend và 3D cùng đọc file này: smart-app-32.js:144).
3. Chạy 8 phút cao điểm, đếm WRONG-TURN.
   ĐIỂM DỪNG: ≥ 1 lỗi, ảnh bằng chứng thấy được xe.
=== KIỂM === node --test PASS; pytest PASS; PORT=8831 node outputs/hcmc-poc/scripts/qa-capture-32.cjs PASS.
=== KHI NÀO DỪNG === Hết bước 3.
=== BÁO CÁO === work/FIX-TURN.report.md. Commit "FIX-TURN: camera CAM-HX-003 cho nút cấm rẽ".
```

---

## FIX-WRONGWAY: xe ngược chiều quá nhỏ trong ảnh

```text
TÊN TASK: FIX-WRONGWAY
=== ĐỌC TRƯỚC === docs/agent/RULES.md.
=== SỰ THẬT TRONG MÃ ===
- outputs/hcmc-poc/camera-capture-32.js: render target 1280×720 (:4-5).
- Cận cảnh 384 px chỉ làm cho NO-HELMET và WRONG-WAY (:66, :331).
- Ảnh "after" có chú thích (:337).
=== MỤC TIÊU === Ảnh bằng chứng WRONG-WAY có xe chiếm ≥ 15 % chiều rộng khung cận cảnh.
=== ĐƯỢC SỬA === camera-capture-32.js, test.
=== CÁC BƯỚC ===
1. Đo: chụp 3 ảnh WRONG-WAY (sim cao điểm), tính tỉ lệ bề rộng hộp bao xe / bề rộng ảnh.
2. Sửa cách tính khung cận cảnh theo hộp bao chiếu của xe, có lề 30 %.
   ĐIỂM DỪNG: 3 ảnh mới đều ≥ 15 %. Lưu vào work/fix-wrongway/.
=== KIỂM === node --test PASS; qa-capture-32 PASS.
=== KHI NÀO DỪNG === 2 vòng chỉnh.
=== BÁO CÁO === work/FIX-WRONGWAY.report.md. Commit "FIX-WRONGWAY: cận cảnh theo hộp bao xe".
```

---

## FIX-BRIDGE: cầu thiếu trụ

```text
TÊN TASK: FIX-BRIDGE
=== ĐỌC TRƯỚC === docs/agent/RULES.md.
=== BỐI CẢNH === Cầu Sài Gòn 2 (OSM 306073179) thiếu 1 trụ. Cầu Thủ Thiêm (OSM 165919725) thiếu 2 trụ. M2b đã thêm 105 trụ cho các cầu khác bằng cùng cơ chế.
=== CÁC BƯỚC ===
1. Tìm nơi sinh trụ cầu: grep "pier" và grep 2 id trên trong outputs/hcmc-poc/*.js và outputs/hcmc-poc/data/. Xem commit M2b (git log --grep "M2b") để biết đã sửa ở đâu.
2. Thêm trụ thiếu bằng đúng cơ chế đó.
3. Chạy python outputs/hcmc-poc/scripts/build_signature_registry_31.py, rồi chạy validator signature trong outputs/hcmc-poc/scripts/.
   ĐIỂM DỪNG: validator xanh.
=== KIỂM === validator PASS; PORT=8831 node outputs/hcmc-poc/scripts/qa-north-32.cjs PASS; ảnh 2 cầu trong work/fix-bridge/.
=== KHI NÀO DỪNG === Bước 1 không tìm ra cơ chế trong 20 phút thì DỪNG, báo cáo.
=== BÁO CÁO === work/FIX-BRIDGE.report.md. Commit "FIX-BRIDGE: thêm trụ cầu Sài Gòn 2 và Thủ Thiêm".
```

---

## FIX-PLATES: xe thế hệ cao không tra ra chủ xe

```text
TÊN TASK: FIX-PLATES
=== ĐỌC TRƯỚC === docs/agent/RULES.md, đặc tả docs/superpowers/specs/2026-10-14-smart-traffic-bac-design.md §4.3.
=== SỰ THẬT TRONG MÃ ===
- outputs/smart-traffic/backend/app/seed/plates.json chỉ có xe thế hệ (gen) 0–2. Bộ sinh: app/seed/seed_plates.py.
- Sim tăng gen mỗi lần xe tái sinh (mảng gen, city-traffic-sim-31.js:443-449).
=== MỤC TIÊU === Biển của xe gen bất kỳ đều tra ra chủ xe, tất định.
=== CÁC BƯỚC ===
1. Test pytest: tra biển của xe gen 50 thì có chủ xe. Chạy thấy FAIL.
2. Chọn một cách và ghi lý do vào báo cáo: (a) sinh chủ xe tất định theo hash biển khi tra không thấy; (b) sinh thêm gen.
=== KIỂM === pytest PASS.
=== BÁO CÁO === work/FIX-PLATES.report.md. Commit "FIX-PLATES: …".
```

---

## FIX-SPEC46: đặc tả còn ghi vi phạm đi qua WebSocket

```text
TÊN TASK: FIX-SPEC46
Chỉ sửa docs/superpowers/specs/2026-10-14-smart-traffic-bac-design.md §4.6.
Sửa: vi phạm đi qua REST POST /station/violations; WebSocket của trạm không nhận `violation.detected`.
Đối chiếu với outputs/smart-traffic/backend/app/routers/station.py và ws.py. Sửa mọi chỗ khác trong §4.6 lệch với mã, mỗi chỗ ghi lại.
Thêm một dòng vào "Nhật ký sửa đổi".
Commit "FIX-SPEC46: cập nhật §4.6 theo hợp đồng backend hiện hành". Báo cáo work/FIX-SPEC46.report.md.
```

---

## CLEAN-2: dọn nốt phần cũ

```text
TÊN TASK: CLEAN-2
=== ĐỌC TRƯỚC === docs/agent/RULES.md, docs/agent/HANDOFF.md (mục CLEANUP).
=== BỐI CẢNH ===
- outputs/hcmc-poc/scripts/validate_demo_ready.py và qa-app-integrity-30b.cjs còn gọi ?legacy=1, nhánh này đã gỡ, nên 2 script báo lỗi.
- Các manifest băm cũ (outputs/delivery-manifest.json, capture-manifest.json, release-fingerprints.json) giữ lại khoảng 200 file không còn ai dùng.
- outputs/shared/digital-twin-core/projects/gia-loc.json còn vì test shared core nạp nó (tests/source-core.cjs, gis-projects.cjs). source-core.cjs đang lệch 2 test do CRLF.
=== CÁC BƯỚC ===
1. Xóa 2 script và các manifest. Với mỗi file chỉ manifest dẫn tới: grep tham chiếu trong file còn lại (trừ work/). Không còn ai dùng thì xóa.
   ĐIỂM DỪNG: mở app không lỗi 404. Bật server tĩnh rồi mở 3 URL bằng Playwright: /hcmc-poc/, webgpu-materials-24.html?v=31a, webgpu-materials-24.html?v=32a&app=smart.
2. Viết lại test shared core cho không phụ thuộc Gia Lộc, rồi xóa gia-loc.json. Sửa 2 test CRLF bằng cách chuẩn hóa EOL trước khi băm.
=== KIỂM === qa-project-hygiene PASS; test shared core PASS; qa-north-32 PASS; node --test PASS.
=== KHI NÀO DỪNG === Bước 2 cần sửa quá 12 test thì chỉ làm bước 1, báo cáo.
=== BÁO CÁO === work/CLEAN-2.report.md. Mỗi bước một commit "CLEAN-2: …".
```

---

## VIDEO-ONNX: video thật và khe model (cần model mạnh)

```text
TÊN TASK: VIDEO-ONNX
=== ĐỌC TRƯỚC === docs/agent/RULES.md, docs/agent/DECISIONS.md (mục stream: video thật thả đúng mã camera + render 3D + khe ONNX tùy chọn).
=== SỰ THẬT TRONG MÃ ===
- Stream lấy từ camera-capture-32.js (render 3D).
- Web hiện ảnh qua /media/stream/<camera> (backend routers/media.py:49).
=== MỤC TIÊU ===
- Có file outputs/smart-traffic/var/media/cameras/<mã camera>.mp4 thì web phát video đó cho camera ấy. Không có file thì dùng render 3D như cũ.
- Khe ONNX: có file model thì chạy suy luận trên khung (onnxruntime-web, cài trong web); không có file thì bỏ qua, không báo lỗi.
=== CÁC BƯỚC ===
1. Backend phục vụ video theo mã camera (Range request).
2. Web: chọn nguồn video hoặc ảnh.
   ĐIỂM DỪNG: thả một file mp4 thử thì web phát được.
3. Khe ONNX: chỉ nạp model khi có file. Không đưa file model vào git.
=== KIỂM === pytest; web test và build; thử tay có và không có file.
=== BÁO CÁO === work/VIDEO-ONNX.report.md. Commit theo từng bước.
```

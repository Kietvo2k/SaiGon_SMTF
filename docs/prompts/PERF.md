# Chuỗi PERF: giảm tải khi chạy 24/7

Thứ tự: PERF-1 (đo) → bạn duyệt ngưỡng → PERF-2, PERF-3, PERF-4, PERF-5 (độc lập nhau, chạy theo thứ tự này cho dễ đo lại) → PERF-6 (tùy chọn).
Bối cảnh chung: `docs/PERFORMANCE-24-7.md`.

Các điểm tải lớn nhất đã thấy trong mã (17/10/2026):

| Điểm tải | Vị trí trong mã | Mức |
|---|---|---|
| Vòng vẽ không giới hạn FPS | `webgpu-materials-24.js:1244` | Lớn |
| Sim chạy trong vòng vẽ, nên phụ thuộc FPS | `:806` | Lớn |
| Camera chụp ảnh 1280×720 mỗi 0,5 s rồi mã hóa JPEG, kể cả khi tab ẩn | `camera-capture-32.js:371`, `:305` | Lớn |
| Backend gửi nguyên ảnh base64 qua WebSocket mỗi khung, nhưng web không dùng | `station.py:204-205` | Lớn |
| DB tăng mãi: `station_metrics`, `signal_state_log`, `kpi_samples` không được dọn | | Trung bình |

---

## PERF-1: đo nền (không sửa mã app)

**Model:** deepseek-v4.1-flash.

```text
TÊN TASK: PERF-1

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, docs/PERFORMANCE-24-7.md.

=== BỐI CẢNH ===
Người dùng để tab 3D, backend và web chạy 24/7 thì máy lag hoặc lỗi. Chưa có số đo nào.

=== SỰ THẬT TRONG MÃ ===
- Playwright: outputs/hcmc-poc/scripts/qa-north-32.cjs:6-11 (đường dẫn qua env PW_MODULE và PW_CHROME), cờ khởi chạy WebGPU ở :27. Dùng lại đúng cách này.
- App tự đếm FPS mỗi giây: webgpu-materials-24.js:1234-1235. Bộ nhớ GPU: renderer.info.memory (:1238).
- Backend lưu ở outputs/smart-traffic/var/: smart-traffic.db và frames/ (config.py:6-10).
- Chạy cả hệ: bash outputs/smart-traffic/run-smart.sh (cổng 8821 tĩnh, 8900 backend, 5173 web); tắt bằng --stop.
- URL app: http://127.0.0.1:8821/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&api=http://127.0.0.1:8900
- Web công an: http://127.0.0.1:5173/index-officer.html. Tài khoản lấy từ outputs/smart-traffic/backend/app/seed/accounts.json (KHÔNG in mật khẩu).

=== MỤC TIÊU ===
Script đo lặp lại được và bảng số nền ở 3 trạng thái.

=== ĐƯỢC SỬA ===
Tạo mới scripts/perf-soak-32.cjs. Ghi kết quả vào work/perf/.

=== KHÔNG ĐƯỢC SỬA ===
Mọi file app, backend, web.

=== CÁC BƯỚC ===
1. Viết scripts/perf-soak-32.cjs, cờ --minutes N (mặc định 10 mỗi pha). Mở trang app và trang web công an (đã đăng nhập).
   Cứ 30 s ghi một mẫu:
   - FPS (đếm requestAnimationFrame trong trang).
   - Heap JS và thời gian CPU luồng chính: CDP Performance.getMetrics, lấy JSHeapUsedSize và TaskDuration (lấy chênh lệch giữa hai mẫu).
   - Số request tới backend theo đường dẫn (page.on('request')).
   - Số byte WebSocket trang web nhận (CDP Network.webSocketFrameReceived).
   - Kích thước smart-traffic.db và tổng dung lượng var/frames.
   - Số dòng các bảng station_metrics, signal_state_log, kpi_samples, violations (đọc SQLite chỉ đọc).
   ĐIỂM DỪNG: chạy thử --minutes 1 ra đủ các cột.
2. Chạy 3 pha liên tiếp, mỗi pha 10 phút: (A) tab app hiện, ×1; (B) tab app ẩn (mở trang trống đè lên bằng bringToFront; ghi document.visibilityState để chắc đã ẩn); (C) tab app hiện, tua ×10.
3. Tổng hợp: trung bình và đỉnh mỗi cột theo pha; tốc độ tăng heap (MB/giờ); tốc độ tăng đĩa và số dòng mỗi bảng (theo giờ); 3 nguồn tải lớn nhất.

=== KIỂM ===
Script chạy hết 3 pha không lỗi; work/perf/baseline.json và work/perf/baseline.md có đủ số.

=== KHI NÀO DỪNG ===
Pha B không làm tab ẩn được (visibilityState vẫn là visible) thì ghi rõ và vẫn chạy tiếp pha C. Không sửa app để đo cho được.

=== BÁO CÁO ===
work/PERF-1.report.md theo mẫu RULES mục 13. Mục "Ngưỡng đề xuất" ghi cho từng PERF-2…5: chỉ số nào, giảm bao nhiêu so với nền.
Commit: "PERF-1: script đo tài nguyên chạy dài" (chỉ file script).
```

**Duyệt (bạn):** xem bảng 3 pha và các ngưỡng đề xuất. Muốn đổi thì sửa thẳng trong báo cáo.

---

## PERF-2: giới hạn FPS và xử lý khi tab ẩn (chỉ app smart)

**Model:** cần model mạnh, vì phải giữ đúng đồng hồ sim.

```text
TÊN TASK: PERF-2

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, work/PERF-1.report.md (số nền và ngưỡng).

=== SỰ THẬT TRONG MÃ ===
- Vòng chính: renderer.setAnimationLoop(render), webgpu-materials-24.js:1244. render(now) ở :1201.
- dt bị kẹp 0,05 s ở :1202. Sim được cập nhật trong render qua advanceUrbanMotion (:806) → city-traffic-31.js:374 (traffic.update).
- city-traffic-31.js kẹp dt 0,25 s (:378), cộng acc += dt*timeScale (:386). Sim bước cố định 0,1 s, tối đa 5 bước mỗi khung (city-traffic-sim-31.js:19-20). Phần dư bị bỏ khi tụt khung (city-traffic-31.js:388-389).
  ⇒ FPS < 20 thì sim chạy chậm hơn đồng hồ. Tua ×10 cần ≥ 20 FPS.
- Tab ẩn: trình duyệt dừng requestAnimationFrame nên sim cũng dừng, nhưng các setInterval vẫn chạy: heat 250 ms (smart-app-32.js:57), clock 250 ms (clock-32.js:55), kịch bản 1 s (smart-app-32.js:358), forecast 1 s (forecast-client-32.js:8), trạm 500 ms (station-client-32.js:467), camera 500 ms (camera-capture-32.js:371).
- Không có xử lý visibilitychange nào trong mã app.
- Chất lượng thích ứng: city-visual-runtime-30.js:315-345 (createAdaptiveQuality), gọi mỗi khung ở webgpu-materials-24.js:1224.
- Mode lite: city-mode-31.js:29.

=== MỤC TIÊU ===
Khi app=smart: FPS có trần; khi tab ẩn thì tốn ít CPU; sim không chạy sai đồng hồ.

=== ĐƯỢC SỬA ===
webgpu-materials-24.js (CHỈ trong render() và chỗ gọi setAnimationLoop; mọi thay đổi bọc trong điều kiện app=smart), smart-app-32.js, clock-32.js, test trong outputs/hcmc-poc/test/.

=== KHÔNG ĐƯỢC SỬA ===
Hành vi khi KHÔNG có app=smart (QA 31 phải pass y nguyên). camera-capture-32.js và station-client-32.js thuộc PERF-3.

=== CÁC BƯỚC ===
1. Trần FPS khi app=smart: mặc định 30. Không có thao tác chuột hay phím 60 s thì 15. Trong render(), khung nào chưa tới hạn thì return sớm, nhưng phải dồn thời gian: không để dt bị kẹp 0,05 s làm sim chậm. Cách làm: tính dt thực từ lần vẽ trước, còn kẹp 0,25 s thì giữ.
   ĐIỂM DỪNG: test Node — với dãy khung 15 FPS mô phỏng, sau 60 s thực thì sim.t tăng 60 ± 1 s.
2. Tab ẩn: nghe visibilitychange. Khi ẩn, sim vẫn phải tiến theo đồng hồ để trạm còn phát hiện vi phạm (rAF đã dừng). Chạy sim bằng một setInterval 1 s, mỗi lần chạy số bước sim tương ứng, KHÔNG vẽ. Khi hiện lại thì quay về vòng vẽ.
   Cho đồng hồ, heat, kịch bản, forecast chậm lại khi ẩn (ví dụ 250 ms → 1 s).
   ĐIỂM DỪNG: test — 60 s ẩn thì sim.t tăng 60 ± 1 s.
3. Công tắc "Tiết kiệm tài nguyên" trên panel app smart (tiếng Việt, không dùng chữ cấm). Bật thì trần FPS 15, mode lite, pixelRatio ≤ 1. Lưu localStorage, bọc try/catch.
4. Đo lại bằng node scripts/perf-soak-32.cjs --minutes 10.

=== KIỂM ===
node --test PASS.
Bật server tĩnh, rồi chạy:
PORT=8831 node outputs/hcmc-poc/scripts/qa-north-32.cjs
PORT=8831 node outputs/hcmc-poc/scripts/qa-traffic-31.cjs webgl
PORT=8831 node outputs/hcmc-poc/scripts/qa-region-31.cjs webgl
Ba QA phải PASS: đó là bằng chứng 31A cổ điển không đổi.

=== NGƯỠNG ===
Lấy theo PERF-1 mục "Ngưỡng đề xuất". Mặc định:
- CPU luồng chính pha B giảm ≥ 60 % so với nền.
- Pha A: FPS trung bình ≤ 31.
- Pha C: sim vẫn đạt ×10 (sim.t tăng ≥ 9,5 s mỗi giây thực).

=== KHI NÀO DỪNG ===
Bước 1 hoặc 2 làm hỏng QA 31 mà 2 lần sửa không hết thì hoàn tác bước đó, báo cáo.

=== BÁO CÁO ===
work/PERF-2.report.md theo mẫu RULES mục 13.
Commit: "PERF-2: trần FPS, chạy sim không vẽ khi tab ẩn, công tắc tiết kiệm".
```

---

## PERF-3: camera, stream và lưu lượng trạm

**Model:** deepseek-v4.1-flash.

```text
TÊN TASK: PERF-3

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, docs/agent/HANDOFF.md mục 2, work/PERF-1.report.md.

=== SỰ THẬT TRONG MÃ ===
- camera-capture-32.js:
  - Render target 1280×720 (:4-5, :210).
  - Chụp bằng setInterval 500 ms (:371), không chặn chồng lệnh (:311-318).
  - Khung stream toDataURL('image/jpeg', 0.8) (:305).
  - Bằng chứng: ảnh "before" lấy từ khung đệm trước khoảng 1 s (:315, :325), ảnh "after" render mới (:326).
- station-client-32.js:
  - FRAME_FPS_32 = 2 (:15). Camera đang xem chụp 2 lần/s, camera còn lại tối đa 1 lần/s (:518-521).
  - Gửi khung cách nhau ≥ 450 ms (:471, :490).
  - deadLetter, evidenceByKey, pendingEvidence không có trần (:114-116).
- Backend station.py:204-205: mỗi khung broadcast nguyên jpeg_base64 qua WS `stream.frame`. Web KHÔNG xử lý stream.frame (grep outputs/smart-traffic/web/src), mà dùng <img src=/media/stream/CAM-HX-001?v=tick> (ViolationsTab.tsx:100-102), chỉ tải lại khi có sự kiện hoặc mỗi 15 s.
- Ở ×10: heat gửi 60 lần/phút (heat-live-32.js:13, :217) cộng metrics 12 lần/phút = 72, vượt hạn mức telemetry 60/phút (config.py:18). Phần vượt bị 429 rồi bỏ (station-client-32.js:261-268).

=== MỤC TIÊU ===
Bỏ việc chụp, mã hóa và gửi ảnh không ai xem; giữ nguyên chất lượng bằng chứng vi phạm.

=== ĐƯỢC SỬA ===
outputs/hcmc-poc/camera-capture-32.js, station-client-32.js, heat-live-32.js, outputs/smart-traffic/backend/app/routers/station.py (chỉ đoạn broadcast frame), cùng test (Node và pytest).

=== KHÔNG ĐƯỢC SỬA ===
Luật vi phạm, perception, web.

=== CÁC BƯỚC ===
1. Backend: bỏ broadcast jpeg_base64 qua WS. Thay bằng sự kiện nhẹ `stream.updated` {camera_id, seq}, không kèm ảnh. Sửa test pytest liên quan.
   ĐIỂM DỪNG: pytest PASS.
2. Camera:
   - Chặn chồng lệnh chụp (đang chụp thì bỏ lượt).
   - Khung đệm cho ảnh "before" giữ dạng chưa mã hóa (ImageBitmap hoặc canvas sao chép). Chỉ mã hóa JPEG khi cần làm bằng chứng hoặc khi gửi stream.
   - Stream mặc định 0,5 khung/s cho camera đang xem; camera không được xem thì không gửi stream, chỉ giữ khung đệm 1 lần/s.
   ĐIỂM DỪNG: PORT=8831 node outputs/hcmc-poc/scripts/qa-capture-32.cjs PASS. Ảnh bằng chứng vẫn có đủ before, after và biển số.
3. Heat: giới hạn gửi theo thời gian THỰC tối thiểu 15 s/lần (không theo thời gian sim), để ×10 không vượt hạn mức.
4. Đặt trần cho deadLetter, evidenceByKey, pendingEvidence: mỗi cái 500, bỏ cũ nhất. Vi phạm bị bỏ thì ghi console.warn một lần mỗi phút.
5. Đo lại bằng perf-soak-32.cjs --minutes 10.

=== KIỂM ===
node --test PASS; pytest PASS; qa-capture-32 PASS; qa-north-32 PASS.

=== NGƯỠNG ===
Theo PERF-1. Mặc định:
- Byte WS web nhận giảm ≥ 90 %.
- CPU luồng chính pha A giảm ≥ 20 %.
- Không còn 429 ở pha C.

=== KHI NÀO DỪNG ===
Bằng chứng mất ảnh "before" mà 2 lần sửa không được thì giữ cách cũ cho riêng khung đệm, làm các bước còn lại.

=== BÁO CÁO ===
work/PERF-3.report.md theo mẫu RULES mục 13.
Commit: "PERF-3: bỏ ảnh qua WS, chụp theo nhu cầu, trần bộ nhớ trạm, heat theo giờ thực".
```

---

## PERF-4: dọn dữ liệu backend

**Model:** deepseek-v4.1-flash.

```text
TÊN TASK: PERF-4

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, docs/agent/HANDOFF.md mục 2, work/PERF-1.report.md (tốc độ tăng số dòng và dung lượng).

=== SỰ THẬT TRONG MÃ (outputs/smart-traffic/backend/app/) ===
- Thư mục dữ liệu: VAR_DIR = outputs/smart-traffic/var (config.py:6, ghi đè bằng SMART_VAR_DIR); DB ở var/smart-traffic.db (:10).
- Bằng chứng lưu thành var/frames/MD-<hex>.<ext> (station.py:139-153). Khung mới nhất mỗi camera ghi đè var/frames/{cam}-latest.jpg (:203).
- Không có mã xóa file nào. Chỉ có hai chỗ DELETE: heat_snapshots giữ 288 bản (heat.py:22, :106) và vehicle_ownerships.
- Không được dọn:
  - station_metrics: lưu nguyên JSON mỗi 5 s (station.py:63-64).
  - signal_state_log: một dòng mỗi nút mỗi lần gửi metrics (:71-73).
  - kpi_samples (:61), violations, media_assets, audit_log (models.py:55-69).

=== MỤC TIÊU ===
DB và thư mục ảnh không tăng mãi khi chạy 24/7. Không mất dữ liệu nghiệp vụ còn dùng.

=== ĐƯỢC SỬA ===
outputs/smart-traffic/backend/app/** (config, một module dọn mới, đăng ký tác vụ nền trong main, router admin), test pytest.

=== KHÔNG ĐƯỢC SỬA ===
3D, web.

=== CÁC BƯỚC ===
1. Cấu hình qua biến môi trường, có mặc định:
   - SMART_RETAIN_TELEMETRY_H = 24: áp cho station_metrics, signal_state_log, kpi_samples.
   - SMART_RETAIN_FINAL_DAYS = 14: vi phạm ở trạng thái cuối (dismissed, paid) cùng bằng chứng của chúng.
   - SMART_FRAMES_MAX_MB = 500.
   KHÔNG xóa vi phạm chưa ở trạng thái cuối, và không xóa bằng chứng của chúng. Không xóa audit_log (ghi lý do vào báo cáo).
   ĐIỂM DỪNG: test pytest FAIL cho từng quy tắc dọn.
2. Hàm dọn chạy mỗi 10 phút (tác vụ nền asyncio khi khởi động app; tắt được bằng SMART_CLEANUP=0 trong test). Mỗi ngày chạy VACUUM một lần. Ghi file trước, xóa file sau khi xóa bản ghi DB thành công.
3. GET /admin/storage (chỉ admin): kích thước DB, dung lượng thư mục frames, số dòng mỗi bảng, lần dọn gần nhất.
4. Chạy perf-soak-32.cjs --minutes 20 với SMART_RETAIN_TELEMETRY_H=0.1 để thấy số dòng không tăng mãi.

=== KIỂM ===
pytest toàn PASS. Web build PASS (không đổi web, chỉ kiểm không vỡ).

=== NGƯỠNG ===
Mặc định: ở chế độ thử (0,1 h), số dòng station_metrics sau 20 phút ≤ 1,2 × số dòng sinh ra trong 6 phút.

=== KHI NÀO DỪNG ===
Hết bước 4. Không thêm tính năng khác.

=== BÁO CÁO ===
work/PERF-4.report.md theo mẫu RULES mục 13.
Commit: "PERF-4: dọn dữ liệu backend theo hạn giữ, VACUUM, /admin/storage".
```

---

## PERF-5: web công an bớt tải lại

**Model:** deepseek-v4.1-flash, hoặc ox-alpha.

```text
TÊN TASK: PERF-5

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, work/PERF-3.report.md (sự kiện stream.updated mới).

=== SỰ THẬT TRONG MÃ (outputs/smart-traffic/web/src/) ===
- WS: lib/ws.ts:13-44. Dùng ở entries/officer/App.tsx:63-74.
- violation.created, violation.updated, complaint.updated đều gọi bump() (App.tsx:72-73), và mỗi 15 s cũng bump (:75). Không debounce. Mỗi lần bump, ViolationsTab tải lại tới 200 mục (ViolationsTab.tsx:21, :58, :77).
- Ảnh stream: <img src=/media/stream/CAM-HX-001?v=tick> (ViolationsTab.tsx:100-102).

=== MỤC TIÊU ===
Web không tải lại dồn dập khi vi phạm đến nhanh, ảnh stream cập nhật theo stream.updated.

=== ĐƯỢC SỬA ===
outputs/smart-traffic/web/src/** cùng test vitest.

=== CÁC BƯỚC ===
1. Gộp bump: nhiều sự kiện trong 2 s chỉ tải lại một lần (debounce có hạn chót). Tab trình duyệt ẩn thì không tải lại; hiện lại thì tải lại một lần.
   ĐIỂM DỪNG: test vitest với fake timers — 20 sự kiện trong 1 s chỉ ra 1 lần tải lại.
2. Ảnh stream đổi src khi nhận stream.updated đúng camera, tối đa 1 lần mỗi 2 s.

=== KIỂM ===
npm run test và npm run build trong outputs/smart-traffic/web đều PASS.

=== KHI NÀO DỪNG ===
Hết bước 2.

=== BÁO CÁO ===
work/PERF-5.report.md theo mẫu RULES mục 13.
Commit: "PERF-5: web gộp tải lại theo lô, ảnh stream theo sự kiện".
```

---

## PERF-6 (tùy chọn): trạm chạy ngầm bằng Node, không cần tab 3D

**Model:** cần model mạnh. Chỉ làm khi PERF-2 đến PERF-5 xong mà vẫn cần chạy 24/7 nhẹ hơn nữa.

```text
TÊN TASK: PERF-6

=== ĐỌC TRƯỚC ===
docs/agent/RULES.md, docs/agent/HANDOFF.md, docs/PERFORMANCE-24-7.md, outputs/hcmc-poc/station-client-32.js (hợp đồng gửi lên backend).

=== MỤC TIÊU ===
scripts/station-headless-32.mjs chạy sim khu Bắc, bộ điều khiển và luật vi phạm 24/7 trong Node. Gửi lên backend đúng các route /station/* như trạm trình duyệt. Không vẽ.

=== CÁC BƯỚC ===
1. KHẢO SÁT, chưa viết mã. Liệt kê module nào chạy được trong Node:
   - Sim chắc chắn chạy được: city-traffic-sim-31.js, đã có test Node.
   - Cần kiểm: traffic-controller-32.js, violation-rules-32.js, violation-perception-32.js, heat-live-32.js, station-client-32.js. Module nào cần DOM, THREE hay IndexedDB thì ghi rõ dòng.
   ĐIỂM DỪNG: bảng khảo sát. Nếu perception phụ thuộc THREE/DOM mà không tách được trong ≤ 100 dòng thì DỪNG, báo cáo phương án.
2. Viết trạm headless dùng lại module, không chép logic. Vi phạm không có ảnh 3D thì gửi không kèm ảnh, trạng thái needs_review.
3. Thêm cờ --headless vào outputs/smart-traffic/run-smart.sh và run-smart.ps1 (ps1 lưu UTF-8 có BOM, ghi bằng Python).

=== KIỂM ===
Chạy 30 phút: backend nhận vi phạm, metrics và heat; RAM tiến trình tăng < 10 %; pytest và node --test PASS.

=== KHI NÀO DỪNG ===
Điểm dừng bước 1.

=== BÁO CÁO ===
work/PERF-6.report.md theo mẫu RULES mục 13.
Commit: "PERF-6: trạm headless Node".
```

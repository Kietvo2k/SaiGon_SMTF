# Bàn giao: hiện trạng Smart Traffic khu Bắc (16/10/2026)

Nhánh `Kietvo2k/smart-traffic-bac`. Mọi mô tả ở đây là **mô phỏng**: sim giao thông tất định theo seed, perception mô phỏng (không train model), biển số sinh theo seed. Không dùng các chữ đó trên UI.

## 1. Đã xong

| Mốc | Nội dung | Ghi chú |
|---|---|---|
| M1 | Đèn 6 nút Hàng Xanh (`signal-plan-32.js`), bộ điều khiển cắm được (`traffic-controller-32.js`), camera, luật vượt đỏ, backend FastAPI + SQLite, web cơ bản, `run-smart` | **A1 chưa đạt** (xem mục 3) |
| M2a/b/c | Khóa khu: nền xám, nhà còn khoảng 13 % ở dạng khối, ẩn đường nhỏ, sửa signature (Landmark 81, trụ cầu) | |
| M4a/b/c | Bản đồ nhiệt, dự báo (lịch sử + xu hướng + tua trước bằng Worker), lệch tuyến, VMS, đồng hồ tua theo giây/phút/giờ/ngày | |
| M5a | Mật độ khu Bắc, 3 kịch bản (cao điểm, chặn làn, ngập Nguyễn Hữu Cảnh), trạm nhận lệnh kịch bản và VMS | |
| M5b-1 | Vi phạm phát sinh tự nhiên, biển số đọc được, đủ các mã lỗi | |
| M6a/b/c | Web công an và web người dân (React + Vite, 2 entry, vitest) | |
| STATION-a | Hạn mức trạm tách theo nhóm, có `Retry-After`; frames không chặn hàng đợi vi phạm | |
| STATION-b | Độ tin cậy perception theo khoảng cách, góc, che khuất; 58 % bản ghi `new` | |
| CLEANUP | Gỡ 1382 file (2966 → 1584): PoC 02–26, nhánh legacy `?legacy=1`, tài liệu/ảnh baseline cũ, Gia Lộc/Tây Ninh | Tra cứu qua `git log`. Danh sách xóa chỉ giữ lại đúng 8 tệp còn có tham chiếu: `outputs/hcmc-poc/index.html` (nay chỉ redirect), 4 tệp batch 18 (`data/overture-region.geojson.state`, quarantine report, DCAT XML, schema PDF), 2 tệp Tây Ninh mà test shared core trỏ tới, và `research/vibecode-18/VERIFY.md`. Hợp đồng Gia Lộc `projects/gia-loc.json` đã xóa trong CLEANUP C (test shared core viết lại chỉ còn HCMC); còn `outputs/shared/digital-twin-core/prepared/gia-loc-17a/` và dữ liệu `outputs/tayninh-*` chưa quyết |

**Số test cuối phase:**
- Node: 209/209 pass.
- pytest backend: 106 pass.
- vitest web: 43 pass.

## 2. Hợp đồng backend hiện hành (khác bản kế hoạch M1)

- **Lỗi:** luôn có dạng `{"error": {...}}`.
- **Vai trò:** `citizen`, `officer`, `commander`, `admin`, `station`.
- **WebSocket:** tin đầu tiên phải là `{type:"auth", token}`.
- **Vi phạm:** chỉ vào qua `POST /station/violations`; thiếu trường thì trả 422. WebSocket của trạm không nhận vi phạm.
- **Metrics:** `POST /station/metrics` nhận thêm `signal_states` và `vms` (cả hai tùy chọn).
- **Bằng chứng:**
  - Trùng `kind` thì trả 409.
  - Kiểu file xác định theo magic bytes (jpg, png, mp4).
  - Base64 lỗi thì trả 422.
- **Hạn mức trạm (mỗi phút):** vi phạm + bằng chứng 300; metrics + heat 60; frames 150. Vượt thì trả 429 kèm `Retry-After`.
  - Trạm bỏ frame khi gặp 429.
  - Vi phạm thì chờ đúng `Retry-After` rồi gửi lại.
- **Vòng đời vi phạm:** 7 trạng thái, có audit log (`GET /officer/audit`).
  - `confirmed` và `dismissed` là trạng thái cuối; thao tác tiếp trả 409.
  - Biển sai định dạng luôn vào `needs_review`.
  - Vào `new` khi confidence ≥ 0,85 và OCR ≥ 0,75.
- **Lệnh điều khiển:** chỉ `commander` và `admin` được gọi `controls`.
  - `SignalOverrideIn`: `group` ∈ {0, 1, null}, `0 < duration ≤ 600`.
  - Body kịch bản dùng khóa `scenario`.
  - VMS gửi `{text, mode}`; `cmd.vms` kèm `lines`.
- **Khởi tạo:** `run_seed()` không gọi `init_db()`. Mọi script phải gọi `init_db()` trước (lệnh này idempotent).

## 3. Còn mở (theo thứ tự ưu tiên người dùng chọn)

1. **DEMAND: mạng tắc cứng ở mật độ app.**
   - Cấu hình `app-1730`: `poolScale` 5, `breakerS` 180.
   - Bộ phá kẹt kích hoạt khoảng 2000 lần.
   - Nhóm pha 1 ở Hàng Xanh gần như không có xe (fixed trung bình 0,9 xe, nhóm 0 là 39,4).
   - Nguyên nhân: phân bổ nhu cầu (OD, hướng đổ về), không phải thuật toán đèn.
2. **HIỆU NĂNG 24/7:** tab 3D cộng backend cộng web chạy liên tục làm máy lag hoặc lỗi. Xem `docs/PERFORMANCE-24-7.md`.
3. **M5b-2: xe ưu tiên chưa có.** Gồm:
   - Cứu thương, cứu hỏa, cảnh sát.
   - Làn sóng xanh trên tuyến.
   - Xe khác tạt lề hoặc vượt đỏ để nhường; vi phạm phát sinh lúc đó tự gắn cờ "nghi nhường xe ưu tiên".
   - Công an duyệt gỡ; người dân khiếu nại.
   - Kịch bản thứ 4.
4. **A1 (đèn thích ứng giảm độ trễ ≥ 15 %): chưa đạt.**
   - Biến thể F `max-pressure-gated` ở cao điểm, tập kiểm 31046–50: trung bình +20,8 %, nhưng seed thấp nhất chỉ +0,4 % và thông lượng 90 %.
   - Ở mật độ app: +1,6 %.
   - Mặc định vẫn là A `max-pressure`.
   - Lịch sử thử nghiệm ở mục 20–23 "Nhật ký sửa đổi" của đặc tả.
   - Tập seed chưa dùng: 31051–31055 (chỉ chấm một lần).
5. **Nhỏ:**
   - Lỗi quá tốc độ không phát sinh (bằng 0).
   - Rẽ cấm chưa có camera.
   - Ảnh xe ngược chiều quá nhỏ trong khung.
   - Cầu Sài Gòn 2 (306073179) thiếu 1 trụ; Thủ Thiêm (165919725) thiếu 2 trụ.
   - Video thật (thả file đúng mã camera) và khe ONNX chưa làm.
   - Đặc tả §4.6 còn liệt `violation.detected` qua WebSocket; cần sửa thành đi qua REST.
   - `plates.json` chỉ có gen 0–2; cần kiểm biển của xe gen cao.
   - `validate_demo_ready.py` và `qa-app-integrity-30b.cjs` (kèm `qa-construction-change-23.cjs`, `validate_ba_son_bridge.py`) còn gọi `?legacy=1`/dữ liệu legacy đã gỡ → báo lỗi; nên xóa các script cũ cùng các manifest băm cũ.
   - `outputs/shared/digital-twin-core/tests/source-core.cjs`: 33/35 do 2 test lệch hash CRLF (`core.autocrlf`), đã có từ trước; test Gia Lộc đã bỏ và `gia-loc.json` đã xóa (CLEANUP C).
   - App chưa đọc tham số `region=bac` từ URL (`app=smart` tự cố định khu Bắc).

## 4. Bản đồ mã nhanh

- **3D (`outputs/hcmc-poc/`):**
  - Vào app: `webgpu-materials-24.html?v=32a&app=smart&region=bac`. Vỏ app là `smart-app-32.js`.
  - Sim: `city-traffic-sim-31.js`, chạy được trong Node. Tham số: `signalPlan`, `controller`, `breakerS`, `demand`, `routeBias`, `behavior`, `exportState`/`importState`.
  - Vẽ: `city-traffic-31.js`.
  - Đèn và camera: `traffic-signals-32.js`, `camera-capture-32.js`.
  - Vi phạm: `violation-perception-32.js`, `violation-rules-32.js`.
  - Nhiệt và dự báo: `heat-*-32.js`, `forecast-*-32.js`.
  - Trạm: `station-client-32.js`, `station-queue-32.js`.
  - Kịch bản và KPI: `scenarios-32.js`, `kpi-panel-32.js`.
  - Khóa khu: `city-lock-32.js`.
- **Backend:** `outputs/smart-traffic/backend/app/`.
  - Router: `station`, `officer`, `citizen`, `citizen_portal`, `media`, `admin`.
  - Seed: `app/seed/{cameras,plates,owners,accounts}.json`, `app/seed/run_seed.py`.
- **Web:** `outputs/smart-traffic/web/`, 2 entry officer và citizen.
- **Đo đạc:** `scripts/kpi-ab-32.mjs`, `scripts/a1-metric-32.mjs`.

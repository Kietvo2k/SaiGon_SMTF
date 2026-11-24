# Ghi chú chuyển tiếp M1 (điều phối viên) — agent các task sau PHẢI đọc

Hợp đồng backend sau commit `dd521cf` (sửa bảo mật) — khác/kỹ hơn kế hoạch:
- Lỗi luôn có dạng `{"error": {...}}` (không phải `{"detail": ...}`).
- Vi phạm CHỈ vào qua `POST /station/violations` (pydantic §4.4, thiếu trường → 422); WS của trạm KHÔNG còn nhận `violation.detected`.
- `POST /station/metrics` nhận thêm `signal_states` (tùy chọn) → backend ghi `signal_state_log` và phát `signal.state`. T11 phải gửi.
- Bằng chứng: trùng `kind` → 409; mime theo magic bytes (jpg/png/mp4); base64 lỗi → 422.
- Vòng đời M1: officer confirm/dismiss từ `new` và `needs_review`; `new → needs_review`; `confirmed`/`dismissed` là cuối (→ 409).
- Lệnh đèn: `SignalOverrideIn` (group ∈ {0,1,null}, node_id phải có, 0 < duration ≤ 600, `until_t_sim` tùy chọn); chỉ commander/admin gọi `controls`.
- Trạm bị giới hạn 200 req/phút → 429 (client phải backoff).
- `GET /officer/audit` (commander/admin) đọc nhật ký thao tác.
- `run_seed()` không tự `init_db()` — script chạy hệ (T14) phải gọi `init_db` trước.

Việc còn treo:
- Đặc tả §4.6 còn liệt `violation.detected` qua WS → cập nhật ở T15 (tài liệu).
- `qa-project-hygiene.cjs` fail vì `__pycache__` trong `backend/.venv` → T14 xử lý (loại `.venv` khỏi kiểm hoặc dọn).
- T4: `plates.json` chỉ có gen 0–2; sim dài có thể vượt → kiểm ở T14 (tra biển xe gen cao vẫn ra chủ xe hoặc có fallback).
- T1 đang sửa vòng 2: `api.signalState(nodeId)`, `api.attachController(opts)` — T9/T11 dùng chữ ký sau khi T1 vòng 2 commit.
- `backend/requirements.txt` thiếu `websockets` (uvicorn thuần trả 404 khi nâng cấp WS) → T13 thêm `websockets` (hoặc `uvicorn[standard]`) và commit.
- Web: commit `outputs/smart-traffic/web/package-lock.json` (tái lập cài đặt) — T13 làm; KHÔNG commit `dist/`, `node_modules/`.
- DB dev cũ thiếu bảng mới → mọi script chạy/QA phải gọi `init_db()` (idempotent) trước `run_seed()`.
- T1 vòng 2 đã commit (`b9dcd66`): `api.signalState(nodeId)` → `controller.stateOf(nodeId)`; `api.attachController(opts)`. T2b đang thêm tham số `demand` cho sim và chỉnh tham số controller (không đổi chữ ký).

Sau T9b (`9786aed`, điều phối viên xem `work/t9b-hx-day.png`):
- T10: nón FOV camera trông đậm hơn mức yêu cầu (fill 0,08 nhưng DoubleSide + wireframe 0,22 chồng lớp) → chỉ một mặt (`FrontSide` hoặc `BackSide`), wireframe ≤ 0,1, hoặc chỉ viền; chụp lại ảnh `work/t10-hx-day.png` để so.
- T10: đèn tín hiệu chưa nhìn rõ ở góc "Ngã tư Hàng Xanh" → khi chụp ảnh bằng chứng từ camera, đèn của nút phải thấy được trong khung (kiểm bằng ảnh).
- M2/M5: xe quanh Hàng Xanh rất thưa trong app smart (vài chiếc) → khi bật kịch bản cao điểm phải dùng `demand` (`peak-hang-xanh`) để nút đông; ghi vào kế hoạch M2.

Sau T13 (`b712d13`):
- T14: Vite dev bind `::1` → e2e dùng `http://localhost:<port>` (không 127.0.0.1) hoặc chạy bản build do backend phục vụ.
- Web chưa có test runner (formatPenalty chưa có unit test) → M6 thêm vitest; M1 kiểm qua e2e.

Sau M2b (`30a39b6`, `020487f`):
- Registry signature: validator đỏ do hash `webgpu-materials-24.js` đổi → chạy `scripts/build_signature_registry_31.py` + validator SAU KHI mọi agent 3D đã commit (T14/M7).
- Còn: cầu Sài Gòn 2 (306073179) thiếu 1 trụ, Thủ Thiêm (165919725) thiếu 2 trụ, đoạn low ngắn Nguyễn Văn Hưởng (NHẸ).

Sau M6b (`7fd23f7`) — dọn ở bước hoàn thiện web:
- Phụ đề header lặp "Cán bộ xử lý vi phạm · Cán bộ xử lý"; ô ngày hiển thị mm/dd/yyyy (đặt `lang="vi"`/định dạng dd/mm/yyyy); tên nút dùng "∩" → đổi "×".
- Chưa có endpoint cảnh báo kẹt công khai (M4 làm).
- Ảnh cầu Sài Gòn (M2b) không thấy xe trên cầu → kiểm mật độ xe trên cầu ở T14/M5.

Sau M6c (`149332d`): trạm 3D (`station-client-32.js`) CHƯA xử lý `cmd.scenario`, `cmd.vms` và chưa gửi trường `vms` trong metrics → M5 làm. Body kịch bản dùng khóa `scenario` (đặc tả ghi `key`); VMS dùng `{text, mode}`, `cmd.vms` kèm `lines`. Seed tài khoản cán bộ đổi tên hiển thị → DB dev cũ cần seed lại.

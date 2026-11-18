# Kế hoạch sửa và đóng gói Smart Traffic

> Kế hoạch lịch sử cho đợt Docker tháng 10. Công việc tiếp theo dùng [đặc tả Public Demo v1](../../agent/PUBLIC-DEMO-SPEC.md) và [handoff hiện hành](../../agent/HANDOFF.md).

> Thực hiện theo từng phần có kiểm thử; các phần backend, đóng gói và giao diện được giao độc lập bằng skill dispatching-parallel-agents. Mỗi phần phải trả kết quả kiểm tra và danh sách tệp, sau đó được rà soát khi tích hợp.

**Mục tiêu:** Sửa lỗi đã kiểm chứng, gọn luồng công dân/3D, có Docker và tài liệu vận hành có thể tái lập.

**Kiến trúc:** Giữ nền 3D + FastAPI + React + SQLite. Docker dùng hai service và reverse proxy cùng origin, volume dữ liệu bền; trình duyệt chạy GPU.

**Công nghệ:** Python 3.11, Node/React/Vite/TypeScript, Docker Compose, nginx, SQLite.

## Ràng buộc chung

- Tiếng Việt có dấu, tệp UTF-8.
- Nhánh `codex/smart-traffic-package`; giữ các sửa đổi có sẵn. Bản diff đầu đợt: `work/browser-qa-2026-10-22/baseline-before-implementation.patch`.
- Không xóa DB, bằng chứng, dữ liệu gốc, nghiên cứu hoặc tệp chưa rõ tham chiếu. Không gộp worktree khác.
- Không đổi API nghiệp vụ không liên quan. Không tự nhận hoàn thành xe khẩn cấp khi chưa có mô phỏng đúng.
- Kiểm tra giao diện bằng Browser sau thay đổi và kiểm tra Docker thật, không chỉ xác thực YAML.

## T1 — Backend xác định mức phạt và chặn kịch bản chưa hỗ trợ

Tệp: `backend/app/penalties.py` mới; `backend/app/routers/station.py`, `backend/app/routers/officer.py`, `backend/app/schemas.py`; các bài pytest hồi quy mới. Đường dẫn tính từ `outputs/smart-traffic/`.

- [x] Viết và chạy test: `RED-LIGHT` ô tô gửi tiền 1 đồng phải được backend thay bằng chính sách của hệ thống; cờ verified/source giả không được tin.
- [x] Kiểm thử loại xe/mã chưa xác minh, dữ kiện thiếu, dữ kiện tốc độ hợp lệ và dữ liệu không hợp lệ; không biến thiếu dữ kiện thành một mức tiền đã xác minh.
- [x] Từng chặn `priority-run` khi chưa hỗ trợ; nay thay bằng T6 theo yêu cầu mới. Loại xe sai bị từ chối trước mọi ghi DB/audit/broadcast.
- [x] Triển khai nhỏ nhất, giữ hợp đồng trường đầu vào để trạm cũ vẫn hoạt động.
- [x] Chạy các test station, lifecycle, controls và báo cáo chính xác kết quả.

## T2 — Docker, cùng origin và lệnh chạy

Tệp: `compose.yaml`, `.dockerignore`, `docker/` mới; `backend` entrypoint/health; `web/src/lib/api.ts`, `web/src/lib/ws.ts`; `hcmc-poc/station-client-32.js` phần cấu hình API; script khởi động cần thiết.

- [x] Cố định hợp đồng Docker: host 8088; `/index-officer.html`, `/index-citizen.html`, `/hcmc-poc/`; API `/api/v1`, WS `/ws/v1`.
- [x] Test cấu hình URL cùng origin và localhost dev; không gửi thông tin trạm tới host tùy ý.
- [x] Image backend Python 3.11 và image web build nhiều stage; khởi tạo DB/seed idempotent, healthcheck, volume dữ liệu.
- [x] Whitelist tài nguyên static cần thiết; seed accounts, mã backend, DB và log không được tải qua HTTP.
- [x] Build và chạy Compose thật; kiểm tra health, API, static, auth, WebSocket, dữ liệu còn sau restart.
- [x] Lệnh chạy/dừng cục bộ tiếp tục hoạt động và không tự xóa dữ liệu.

## T3 — Giao diện Smart Traffic và công dân

Tệp: `hcmc-poc/webgpu-materials-24.js`, module UI/cấu hình smart mới nếu cần; `web/src/entries/citizen/`, `web/src/entries/officer/ViolationsTab.tsx`, `web/src/lib/alerts.ts`, `web/src/lib/controls.ts`.

- [x] Test hồi quy URL mode giữ `app`, `api`, region/view hợp lệ.
- [x] Dọn City Lab khỏi Smart UI, tránh hai bảng chồng nhau; giữ công tắc đồ họa gọn và bản cổ điển hoạt động.
- [x] Citizen mở thẳng tra biển số; trạng thái lỗi/không có kết quả rõ ràng; màn hình tài khoản tách khỏi luồng chính.
- [x] Camera hiện nhãn giao lộ; cảnh báo không trùng key; UI chỉ gửi lệnh xe khẩn cấp khi trạm đã có T6; trạng thái thực hiện ở HUD.
- [x] Khảo sát lớp đèn/trụ đèn đang dùng, loại bỏ lớp trùng nếu có bằng chứng và test hồi quy phù hợp.
- [ ] Typecheck/build/vitest và test Node liên quan đã qua; chốt Browser 3D bản cuối trên desktop/màn hình hẹp.

## T4 — Khoanh vùng và dọn gọn có bằng chứng

- [x] Lập `docs/architecture.md` và `docs/maintenance.md`: vùng chạy, tài nguyên phụ thuộc, dữ liệu runtime, tài liệu lịch sử, phần chưa dùng.
- [x] Kiểm tra tham chiếu trước khi gỡ từng tệp; ghi đường dẫn, lý do, cách phục hồi qua Git. Tệp đang dùng bởi classic hoặc test không được coi là rác.
- [x] Loại trừ runtime, môi trường Python, dependency host và nghiên cứu khỏi Docker build context.
- [x] Không đưa bằng chứng kiểm thử hoặc DB QA vào image/release.

## T5 — Tài liệu và nghiệm thu tích hợp

- [x] README chỉ rõ lệnh Docker/cục bộ và địa chỉ ba web; tài liệu chi tiết dữ liệu, sao lưu, khôi phục, xử lý lỗi, cấu trúc mã.
- [ ] Browser thật qua Docker: citizen không cần login, cán bộ login/chọn camera, 3D Lite giữ app, chế độ đèn/kịch bản hỗ trợ; kiểm tra console/WS.
- [x] Rà soát thay đổi bằng agent độc lập; sửa phát hiện có cơ sở.
- [ ] Cập nhật HANDOFF và báo cáo triển khai cuối; nói rõ giới hạn chưa hoàn thành.

## T6 — Xe khẩn cấp (người dùng yêu cầu bổ sung ngay trong đợt này)

- [x] Tách `emergency-32.js`: chọn slot ô tô thật, model cứu thương/chỉ huy cứu hỏa/cảnh sát; tuyến và va chạm do sim hiện tại quản lý.
- [x] Ưu tiên cuốn chiếu, giữ/nhả pha qua vàng và đỏ chung; tôn trọng ghi đè của cán bộ ở mọi nút cùng cụm.
- [x] Hướng xung đột nhường qua IDM; xe đã giữ khóa được thoát, không tạo khóa chết mới do điểm nhường.
- [x] Tắt hành vi vượt đỏ/SPEED/PARK của slot khẩn cấp; reset/tái sinh/dừng/hết hạn nhả ưu tiên và không truyền cờ sang thế hệ khác.
- [x] Cờ cần xem xét dùng đúng `vehicle_id` một gốc; telemetry trạng thái xe được lưu trong JSON của SQLite, không tự miễn phạt.
- [x] Lệnh REST/WS và lựa chọn loại xe trên web chỉ huy, nút đến vị trí xe trong 3D.
- [ ] Browser bản image cuối: điều xe từ web chỉ huy, quan sát xe/di chuyển/nhường, thử dừng và kiểm tra camera/console.

## Còn mở sau gói này

- [ ] LIGHT-01: khảo sát hình học từng hướng HX-01…HX-06 với ảnh trước/sau; chưa có bằng chứng để xóa hàng loạt đầu/cột đèn.
- [ ] Nghiệm thu A1 đa seed, FPS GPU thật, tải dài hạn; tối ưu broadcast tuần tự và cách sinh mã ngày.
- [ ] Lưới nhiều camera, xe thang cứu hỏa lớn, điều xe tới địa chỉ và âm thanh còi là các phần mở rộng tiếp theo.

## T7 — Đèn, dự báo và công cụ trình diễn (yêu cầu bổ sung)

- [x] Đặt đầu đèn theo vạch dừng và nhóm pha thật; đỏ trên/xanh dưới; bỏ billboard 40 px và số 0 không có nghĩa; FOV mặc định tắt.
- [x] Gom hiển thị theo 5 giao lộ logic, nhánh gần song song dùng chung đầu đèn; 6 mã HX vẫn dùng được với API/camera hiện có.
- [x] Tab Đèn & dự báo: chọn giao lộ, đến vị trí, trạng thái sống, xe chờ, bản sao controller dự kiến 60 giây và phân bổ xanh A/B.
- [x] Khung bao xe bật/tắt, InstancedMesh giới hạn 400 xe trong góc nhìn; helper không lọt vào ảnh bằng chứng.
- [x] Tab Thử nghiệm: kịch bản hiện có, thêm 1/10/50 NPC, tổng 200; dọn riêng không xóa SQLite.
- [x] OpenCode MiniMax miễn phí soạn hai module DOM, agent chính kiểm tra và nối logic; 127 test Node liên quan qua.
- [ ] Browser bản cuối: chọn các giao lộ, nhìn đèn/khung bao, chuyển tab bằng bàn phím, thêm/dọn NPC và viewport hẹp; lưu ảnh/báo cáo.

Ưu tiên xe khẩn cấp được hạ theo yêu cầu mới: giữ phần đã chạy, không mở rộng thêm xe thang/điều phối/còi trong T7. Các mục khảo sát từng nhánh và nghiệm thu thông lượng/FPS vẫn để mở; không đánh đồng việc gom trình bày với việc đã co toàn bộ đồ thị OSM.

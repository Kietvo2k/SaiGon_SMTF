# SaiGon SMTF

Repo gồm mô phỏng 3D trong `outputs/hcmc-poc`, hai web React trong
`outputs/smart-traffic/web` và FastAPI/SQLite trong `outputs/smart-traffic/backend`.

## Nhận và bàn giao việc

Đợt bàn giao hiện tại chỉ gồm tài liệu, cấu hình agent và script nghiệm thu.
Hai prompt triển khai dành cho các agent được người dùng khởi chạy ở phiên riêng.

1. Đọc [bàn giao](docs/agent/HANDOFF.md) và [quy tắc](docs/agent/RULES.md).
   Với bản public, mở [đặc tả](docs/agent/PUBLIC-DEMO-SPEC.md) và
   [hợp đồng](docs/agent/CONTRACT-PUBLIC-DEMO.md) trước khi sửa.
2. Agent được giao task chạy `node scripts/agent/preflight.mjs --task <ID> --role <vai-trò>`
   tại worktree trong brief. Trả `READY` gồm các mã yêu cầu, một ca biên và lệnh kiểm đầu tiên.
   Khi resume hoặc compact, đọc lại brief, handoff và số vòng đã dùng.
3. Chỉ sửa trong phạm vi brief. Điều phối viên giao code và test cho người khác nhau,
   xác minh handoff bằng `preflight.mjs --verify --result <tệp>` với cùng ID và vai trò.
   Hai nhánh dùng chung phiên bản hợp đồng. Mọi sửa đổi hợp đồng đi qua một mốc chung.
4. Cổng kiểm `node scripts/hardtest/run.mjs --profile ci` và cổng phát hành
   `node scripts/hardtest/run.mjs --profile release` là nguồn kiểm chứng.
   Mỗi lát có tối đa hai lượt sửa sau lần kiểm đầu tiên. Xem quy trình xử lý trong RULES.

## Làm việc trong repo

- Nội dung tiếng Việt có dấu, UTF-8. Tên API, biến và mã yêu cầu giữ dạng gốc.
- Giữ tài nguyên và SHA đúng phiên bản. Dữ liệu tài khoản, ảnh và biển số bản public là dữ liệu mẫu.
- Giữ hash hồi quy 31A và luồng Docker. Thay đổi web cần kiểm bằng trình duyệt.
- Chỉ stage tệp của task. Giữ các tệp cá nhân, dữ liệu runtime và log ngoài commit.
  Agent triển khai bàn giao commit cục bộ. Điều phối viên chịu trách nhiệm tích hợp và phát hành.

## Tự nạp skill đầu mỗi phiên (bắt buộc)

Phiên làm việc nào trong repo này — OpenCode, Codex, sub agent — phải nạp bộ skill sau
ngay khi bắt đầu, trước khi đọc kế hoạch hay sửa bất cứ thứ gì:

1. `skill fe` — cho mọi việc đụng 3D, web React, UI, landing, CSS, UX (gõ tắt `/fe`).
2. `skill code` — cho mọi việc sửa mã, viết test, review, git, lập plan.
3. `skill agent-language-vi` — tiếng Việt có dấu, UTF-8 cho tài liệu, comment, commit.
4. Khi cần kiểm trình duyệt thật: `skill browse`, ưu tiên Playwright script
   (không dùng computer-use `get_app_state` để soi UI — đã từng trả khung trống).
5. Trước khi tuyên bố việc xong: `skill verification-before-completion`, chạy lệnh kiểm thật.

Gọi subagent theo nhiệm vụ: task đơn giản → `worker-cheap`; task nặng hoặc cần suy luận sâu
→ `worker-strong`. Đã nạp skill miền (fe/code/…) thì không nạp thêm skill con trùng phạm vi.

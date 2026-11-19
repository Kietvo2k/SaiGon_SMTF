# Prompt điều phối nhánh lõi Public Demo

Dán toàn bộ khối dưới đây cho một phiên điều phối Codex hoặc Claude Code trong worktree lõi. Dùng mốc `smtf-public-demo-handoff-v1` để tách worktree. [Prompt nhánh UI](PUBLIC-DEMO-UI.md)

```text
Bạn là điều phối viên lõi/phát hành SaiGon SMTF Public Demo v1. Làm trong worktree của nhánh codex/public-demo-core tách từ mốc smtf-public-demo-handoff-v1. Chạy git rev-parse 'smtf-public-demo-handoff-v1^{commit}', git status --short --branch và git rev-parse HEAD. Với lần bắt đầu, HEAD phải đúng mốc chung. Nếu tiếp tục, SHA mốc phải là tổ tiên của HEAD và ledger phải ghi đúng ứng viên đang làm.

Đọc AGENTS.md, docs/agent/HANDOFF.md, docs/agent/RULES.md, docs/agent/PUBLIC-DEMO-SPEC.md, docs/agent/CONTRACT-PUBLIC-DEMO.md, docs/agent/fixtures/public-demo-v1.json, docs/deploy-public.md và docs/qa-public-demo.md. Khi mở phiên, resume, compact hoặc đổi agent đều đối chiếu brief, receipt và ledger. Xác minh hình học đồ thị, trạng thái API và kết quả A/B đường cơ sở trước khi lập kế hoạch. Giữ tài liệu kỹ thuật tiếng Việt có dấu, UTF-8.

Mục tiêu: dịch vụ public chạy trong trình duyệt theo cùng hợp đồng với UI, Docker vẫn chạy cục bộ, dữ liệu cảnh chỉ khu Bắc, 10 cụm giao lộ, chuyến tới đích có đổi tuyến an toàn, bảng lý do chuyển đèn, A/B đo được, AI nhận diện từ ảnh và góc camera đủ dùng. Đưa hai gói Vercel và Pages qua cổng phát hành. Tập trung PUB-01, DATA-01, SIM-01, SIM-A1, AI-01, DOCKER-01 và phần runtime CAM-01/PERF-01. Cung cấp điểm mount và dữ liệu cho USER-01.

Bạn là chủ duy nhất của entry 3D dùng chung, đồ thị và mô phỏng, traffic-controller, camera capture, AI worker, runtime cảnh, dữ liệu dẫn xuất, backend FastAPI và transport lib/api.ts, lib/ws.ts, lib/types.ts ở web. Sở hữu builder phát hành scripts/package-public-demo.mjs, ghép Vite entry, manifest và các cấu hình local liên quan. Đặt docs riêng của nhánh dưới docs/agent/core/. Giữ đường dẫn và shape adapter theo hợp đồng, thông báo điểm mount cho nhánh UI. Điều phối viên chung giữ các file hợp đồng, fixture chuẩn, script gate, CI và quyền publish. Nếu thấy cần đổi hợp đồng, chuẩn bị bằng chứng và gửi trước cho bên UI duyệt.

Trước khi sửa, tự phác kế hoạch và giao một planner chỉ đọc để phản biện. Chốt requirement ID, oracle, file allowlist và cách đo cho từng lát. Giao code và hardtest song song ở worktree ghi riêng. Lượt kế tiếp giao meta kiểm runner bằng ca lỗi có chủ đích và cross tính độc lập từ đặc tả. Sau đó giao review chỉ đọc để soi code lẫn độ khó của test, rồi browser-qa vào candidate thật. Mỗi đợt tối đa hai subagent ghi và một tầng dưới lead. Không dùng helper sản phẩm làm oracle; kiểm ACK giả, lối ra bão hòa, thay đổi format, frame sai và profile dữ liệu lẫn nhau bằng ca đỏ có lý do cụ thể. Tách worktree có cố tình tạo lỗi khỏi ứng viên tích hợp.

Với mỗi vai trò tạo brief ở work/smtf-agent/briefs/<ID>.json ghi requirement, đường dẫn, scope, SHA và vòng. Agent bắt buộc chạy node scripts/agent/preflight.mjs --task <ID> --role <vai-trò>; kiểm READY có mã yêu cầu, một ca biên, lệnh kiểm đầu tiên. So receipt startSha với SHA lúc giao. Thu commit, docs hoặc báo cáo kiểm và verify JSON bàn giao qua preflight --verify --result. Cập nhật ledger ở từng lần kiểm.

Triển khai theo lát: (1) áp hợp đồng transport và datastore, kiểm quyền và vòng đời trạm. (2) cắt graph/cảnh khu Bắc, giữ mapping và hồ sơ nguồn, đối chiếu nguồn chuẩn. (3) kiểm hình học năm nút mới, nới nút cũ, định tuyến và chống kẹt, chạy A/B theo seed. (4) góc capture theo nút, YOLOX-Nano ONNX ghim hash, vòng đời ảnh/worker và WebGL2. (5) build hai artifact, đo mức tải, tích hợp UI và kiểm build đúng origin. Tách chạy script A/B và test 31A. Giữ báo cáo thô để tính lại, có số xe đến đích, chờ tại biên và phục hồi kẹt.

Vòng 0 là lần kiểm ứng viên đầu tiên. Mỗi test sai làm lát quay lại đúng người và sửa căn nguyên. Luôn chạy ca đỏ trước khi kiểm lại suite chính, meta và chéo. Chỉ tối đa vòng sửa 1 và vòng sửa 2, tính chung cho lát dù đổi phiên. Hết vòng 2 còn đỏ thì dừng ứng viên, giữ bản xanh gần nhất, gửi repro nhỏ và kế hoạch chẩn đoán tách biệt. Không bỏ test hoặc đổi ngưỡng để ghi nhận đã đạt.

Bàn giao commits, SHA, tài liệu runtime và triển khai, bảng requirement → test ID → log, manifest và evidence theo docs/deploy-public.md. Chạy node scripts/hardtest/run.mjs --profile ci và --profile release đúng mốc tích hợp. Công bố mọi lỗi hoặc thiếu bằng chứng. Dùng cổng release để kiểm artifact. Triển khai lệnh upload có xác minh lại bằng chứng và manifest của đúng ứng viên. Điều phối viên phát hành chịu trách nhiệm tích hợp và upload chính thức.
```

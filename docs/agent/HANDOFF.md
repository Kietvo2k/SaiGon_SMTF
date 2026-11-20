# Bàn giao hiện hành SaiGon SMTF

**Mốc khảo sát:** `3f8e31e` · **Đích triển khai:** `public-demo-v1` · **Mốc bàn giao cho hai nhánh:** `smtf-public-demo-handoff-v1`.

> **Cập nhật 20/11/2026 (demo-v2):** Bản nộp production đã chạy tại
> `https://saigon-smtf-submit.vercel.app` (SHA `6cac2b7`; NAV/DATA/CAM đạt, SIGNAL đỏ).
> Kế hoạch nâng cấp thành demo sống + danh mục sửa P0–P3 nằm ở
> [DEMO-V2-PLAN.md](DEMO-V2-PLAN.md); prompt cho agent điều phối tự chủ ở
> [docs/prompts/DEMO-V2-AGENT.md](../prompts/DEMO-V2-AGENT.md).
> **Ưu tiên đọc hai tài liệu đó trước khi làm tiếp.**

## Đọc trước khi tiếp tục

1. Đọc [đặc tả](PUBLIC-DEMO-SPEC.md), [hợp đồng UI–lõi](CONTRACT-PUBLIC-DEMO.md) và [quy tắc](RULES.md). Xem [quyết định mới nhất](DECISIONS.md) khi một tài liệu cũ diễn giải khác.
2. Mở `work/smtf-agent/ledger.md` của worktree, tìm ID đang làm, số vòng đã dùng và SHA ứng viên gần nhất. Nếu nhận việc mới, đối chiếu nhánh, thư mục và SHA với brief của điều phối viên. Lệnh preflight nằm trong [quy tắc](RULES.md).
3. Khi khôi phục sau compact hoặc đổi agent, đọc lại brief và tệp kết quả của vòng trước. Tiếp tục từ lần kiểm chưa đạt, tránh lặp lại việc đã nghiệm thu. Cập nhật ledger trong lần bàn giao kế tiếp.

## Hiện trạng và bằng chứng

| Phần | Đã kiểm trên mốc khảo sát | Việc kế tiếp |
|---|---|---|
| Lõi | Node 264 test. 31A có hash hồi quy `c05ce91e`. Đã kiểm cấp đồ thị có hướng cho năm ứng viên nút Bắc. | Kiểm cấp làn, đầu đèn, cao độ và chụp từng hướng. Hoàn thành định tuyến đích, giảm kẹt và đối chứng nhiều seed. |
| Web | Typecheck và 64 test. Hai trang React còn dùng host API cục bộ. | Đổi sang hợp đồng adapter chung với transport local/public và hoàn thiện landing. |
| Backend | 171 test FastAPI trong `.venv` đã có, 7 cảnh báo deprecation. `.venv311` ban đầu thiếu pytest. | Giữ hồi quy và thêm smoke Docker có volume kiểm riêng. |
| Trình duyệt | Probe Chromium riêng vào cảnh Bắc, Lite/WebGL2 và `window.__smartApp` đã sẵn sàng, không có `pageerror` trong probe. | Script QA cũ dừng khi đọc `region` từ runtime chưa xác định. Nghiệm thu đầy đủ bằng flow và trace trên build public. |
| Phát hành | Docker Compose và trang web cục bộ là chế độ hiện có. | Tạo hai gói tĩnh, ghim tài nguyên, kiểm mạng và phát hành preview. |

Những kết quả trên là đường cơ sở cho profile `ci`. A1, AI YOLOX, dữ liệu browser, gói public, góc camera mới và tải dài hạn cần kiểm đúng commit ứng viên. Xem [bàn giao tháng 10](HANDOFF-2026-10.md), [báo cáo đóng gói](IMPLEMENTATION-2026-10-22-smart-traffic-package.md) và [backlog](BACKLOG-2026-10-22-ux-nghiep-vu.md) khi cần lịch sử lỗi.

## Kế hoạch tiếp người bàn giao

- Đợt này bàn giao tài liệu, quy tắc, fixture và hardtest. Mốc dành cho agent tiếp theo lấy từ checkout sạch. Các bản nháp sản phẩm dừng giữa chừng nằm riêng ở các nhánh `codex/draft-public-demo-*`, ngoài mốc bàn giao.
- Hardtest có hồi quy Node, React và FastAPI, kiểm chính runner, kiểm chéo KPI và kiểm gói tĩnh `PUB-01`. Cổng `release` yêu cầu thêm các suite DATA, SIM, AI, camera, luồng người dùng, hiệu năng và Docker trên sản phẩm thật. Agent triển khai và agent kiểm thử đóng các mục đó theo ma trận trong đặc tả.

- Lấy SHA bằng `git rev-parse 'smtf-public-demo-handoff-v1^{commit}'`. Tạo hai worktree sạch từ các nhánh `codex/public-demo-ui` và `codex/public-demo-core`. Người dùng khởi chạy hai phiên từ hai prompt. [Prompt UI](../prompts/PUBLIC-DEMO-UI.md) · [Prompt lõi](../prompts/PUBLIC-DEMO-CORE.md)
- Điều phối viên cập nhật một dòng ledger cho mỗi lần giao, kiểm đỏ, kiểm xanh, review hoặc bàn giao. Tệp kết quả của subagent nằm trong `work/smtf-agent/results/` của worktree đó. Nội dung quyết định dùng về sau được đưa vào tài liệu của lát triển khai trong commit của đúng vai trò.
- Mỗi lát có mã yêu cầu, base và candidate SHA, người giữ phạm vi, lệnh kiểm, báo cáo và dấu vết thay đổi. Với phần chưa đạt, ghi ca hỏng tối thiểu, kết quả dự kiến/thực tế, giả thuyết đã loại và điểm tiếp tục. Đổi nhánh, đổi công cụ, resume hoặc compact giữ nguyên số vòng đã dùng.

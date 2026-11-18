# Bàn giao hiện hành SaiGon SMTF

**Mốc khảo sát:** `3f8e31e` · **Đích triển khai:** `public-demo-v1` · **Mốc bàn giao cho hai nhánh:** `smtf-public-demo-base-v1`.

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

- Sau khi đóng đặc tả, hợp đồng và fixture, tạo mốc Git chung và lấy SHA bằng `git rev-parse 'smtf-public-demo-base-v1^{commit}'`. Mở hai worktree từ cùng mốc. [Prompt UI](../prompts/PUBLIC-DEMO-UI.md) · [Prompt lõi](../prompts/PUBLIC-DEMO-CORE.md)
- Điều phối viên cập nhật một dòng ledger cho mỗi lần giao, kiểm đỏ, kiểm xanh, review hoặc bàn giao. Tệp kết quả của subagent nằm trong `work/smtf-agent/results/` của worktree đó. Nội dung quyết định dùng về sau được đưa vào tài liệu của lát triển khai trong commit của đúng vai trò.
- Mỗi lát có mã yêu cầu, base và candidate SHA, người giữ phạm vi, lệnh kiểm, báo cáo và dấu vết thay đổi. Với phần chưa đạt, ghi ca hỏng tối thiểu, kết quả dự kiến/thực tế, giả thuyết đã loại và điểm tiếp tục. Đổi nhánh, đổi công cụ, resume hoặc compact giữ nguyên số vòng đã dùng.

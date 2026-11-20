---
name: smtf-vercel-demo
description: "Điều phối, triển khai, kiểm thử và bàn giao bản nộp ba demo SaiGon SMTF trên một URL Vercel dùng chung Supabase."
---

# Bản nộp Vercel + Supabase của SaiGon SMTF

## Nhận việc

1. Đọc [đặc tả bản nộp](../../../docs/agent/DEMO-VERCEL-SUPABASE.md), [quy tắc](../../../docs/agent/RULES.md) và [bàn giao repo](../../../docs/agent/HANDOFF.md). Dùng prompt [UI](../../../docs/prompts/DEMO-VERCEL-UI.md) hoặc [lõi](../../../docs/prompts/DEMO-VERCEL-CORE.md) theo quyền sở hữu.
2. Tái sử dụng hai phiên CLI hiện có, mỗi bên ở worktree riêng đã xác minh. Điều phối viên chốt một SHA tài liệu chung; hai bên đưa đặc tả bản nộp vào `requiredReads`, kiểm branch và HEAD, chạy preflight rồi trả `READY` trước khi sửa. Theo dõi phụ thuộc và bàn giao qua Orca `orchestration`.
3. UI sở hữu landing, view React, HUD và thao tác camera. Lõi sở hữu API, Supabase, capture, mô phỏng, build và deploy. Điều phối viên sở hữu hợp đồng, fixture chuẩn và nhánh tích hợp. Khi gặp thay đổi giao diện giữa hai bên, cập nhật hợp đồng qua điều phối viên trước khi cập nhật client và server.

## Kiểm ứng viên và xử lý lỗi

- Mở URL HTTPS trong trình duyệt sạch và đi hết ba demo. Khớp dữ liệu biển mẫu, kiểm phiên camera và nguồn ảnh. Kiểm ở 390, 768 và 1440 px. Dùng fixture cho test từng view. Kết luận bản nộp từ runtime và Supabase thật.
- Ghi SHA, manifest, URL, từng ca bắt buộc, kết quả thô, ảnh/trace, log console/network và số đo trước/sau. Kiểm yêu cầu mạng đến đúng dịch vụ từ trình duyệt, gồm asset, worker, API và lỗi trả về. Thiếu bằng chứng hoặc test đỏ dẫn tới trạng thái chưa đạt của đúng lát.
- Tái hiện lỗi trước, phân loại nhóm lỗi rồi giao đúng người. Giới hạn hai lượt sửa cho mỗi lát, tính cả các ứng viên thay thế, chạy ca ngắn trước toàn bộ kiểm thử. Sau hai lượt, cô lập ứng viên và nhờ một subagent độc lập trả lời một câu hỏi cụ thể về căn nguyên. Nếu có cơ chế khác, thử thiết kế lại trong phạm vi hẹp và tiếp tục việc độc lập. Giữ bản đã qua kiểm và số vòng đã dùng trong ledger.
- Điều phối viên đối chiếu mỗi 20 phút và nhắc đúng hành động chưa xong khi phiên dừng. Agent ghi cách chạy, lệnh và kết quả test, giới hạn quan sát, bước tiếp theo và JSON bàn giao. Xác minh bằng preflight ở worktree của brief.

## Chốt theo giờ Việt Nam

- 21h có URL kiểm landing và 3D. 22h30 chốt ứng viên. 23h kiểm luồng nộp bài. Hạn nộp 24h ngày 20/11/2026.
- Nếu ô vuông 3,22 km chưa đạt lúc chốt, dùng vùng Bắc hiện có đã kiểm trên cùng bản build. Nếu luồng camera trực tiếp còn lỗi, dùng ảnh mẫu có nhãn và ghi lỗi trực tiếp còn mở.
- Bản nộp đạt khi URL đã kiểm đủ ba demo, Supabase đã kết nối và các phương án dự phòng được ghi cùng bằng chứng. Cổng `public-demo-v1` và chỉ tiêu trên máy chuẩn giữ kết luận riêng.

# Prompt điều phối UI cho bản nộp Vercel

Dán khối dưới đây vào CLI UI hiện có. Tham chiếu chung gồm [đặc tả bản nộp](../agent/DEMO-VERCEL-SUPABASE.md), [prompt lõi](DEMO-VERCEL-CORE.md) và [skill phối hợp](../../.agents/skills/smtf-vercel-demo/SKILL.md).

```text
Bạn điều phối UI cho bản nộp SaiGon SMTF trước 24h ngày 20/11/2026, giờ Việt Nam. Giám khảo mở một URL Vercel và đi được từ landing vào Mô phỏng 3D, Demo cán bộ và Tra cứu biển số. Cán bộ vào bằng một nút, có quyền xem KPI, hồ sơ mẫu và camera. Cả ba demo dùng cùng dự án Supabase.

Dùng CLI UI hiện có và worktree riêng trong brief. Mốc tham chiếu UI là 619eed5. Đối chiếu từng phần đã có bằng chứng trước khi tái sử dụng. Giữ ứng viên đóng băng và số vòng của các lát cũ. Xác minh worktree, nhánh, HEAD và SHA tài liệu chung do điều phối viên gửi. Đọc AGENTS.md, docs/agent/RULES.md, docs/agent/HANDOFF.md, docs/agent/DEMO-VERCEL-SUPABASE.md và .agents/skills/smtf-vercel-demo/SKILL.md. Dùng hallmark cho bố cục landing và ui-ux-pro-max cho hệ giao diện, màn hình hẹp và thao tác bàn phím. Dùng Orca orchestration để nhận phụ thuộc và bàn giao.

Liệt kê tệp được sửa trong writablePaths của brief. Sở hữu landing, view React của cán bộ và tra cứu, HUD 3D, lớp hiển thị và thao tác camera. Đưa đặc tả bản nộp vào requiredReads, chạy node scripts/agent/preflight.mjs --task <ID> --role <vai-trò> rồi trả READY có ID yêu cầu, một ca biên và lệnh kiểm đầu tiên. Khi resume, đọc lại ledger và xác minh số vòng trước khi sửa. Điều phối viên giữ hợp đồng và fixture chung. Lõi sở hữu Supabase, API, capture, mô phỏng, tải dữ liệu cảnh, cấu hình build và deploy.

Thứ tự bàn giao
1. Làm landing bằng ảnh từ bản 3D. CTA Xem demo đưa tới ba lựa chọn có đường về landing. Bàn giao phần landing và HUD 3D sớm để lõi kiểm URL.
2. Làm dashboard bằng nút Vào demo cán bộ. Mặc định hiện camera, KPI và hồ sơ mẫu. Cán bộ demo có quyền xem. Phân biệt Ảnh mẫu và Trực tiếp từ mô phỏng, hiện tên nút và giờ chụp, giữ đủ khung khi fullscreen. Hủy hoặc bỏ phản hồi cũ khi đổi camera. Hiện trạng thái lỗi hoặc mất nguồn với nút thử lại.
3. Làm tra cứu thẳng từ ô biển số, có biển mẫu để thử. Dùng chuẩn hóa có sẵn. Kiểm biển viết liền, biển có dấu phân cách, sai định dạng, hợp lệ không có hồ sơ và dịch vụ lỗi. Dùng đúng /api/demo và fixture đã chốt trong đặc tả. Fixture phục vụ kiểm từng view, dữ liệu Vercel nghiệm thu phải đến từ Supabase.
4. HUD mở ở toàn cảnh, có Tới nút giao, Góc chuẩn và bảng chi tiết thu gọn. Chọn đúng camera theo camera_id và junction_id. Kiểm Bắc 02/03, xe ở góc gần và HUD không che cảnh khi thu gọn. Gỡ Story, Controls và Flood Lab cũ ở UI public và báo tài nguyên phụ thuộc cho lõi gỡ trong gói. Giữ bản cục bộ dùng cho hồi quy.

Mốc 21h là URL kiểm landing và 3D. Mốc 22h30 chốt ứng viên cùng lõi. Nếu ô vuông chưa đạt, kiểm UI trên vùng Bắc dự phòng đã xác minh cùng bản build. Nếu camera trực tiếp chưa đạt, nghiệm thu phần ảnh mẫu có nhãn và ghi luồng trực tiếp còn mở. Mốc 23h kiểm đủ ba lối vào trong Chromium sạch ở 390, 768 và 1440 px. Kiểm thao tác bàn phím, quay lại landing, nguồn ảnh, đổi camera nhanh, fullscreen, tra cứu và cùng dữ liệu mẫu giữa hai trang. Ghi ảnh/trace, URL, SHA, ca bắt buộc, log console/network và các lỗi gửi đúng chủ sở hữu.

Nếu kiểm đỏ, tái hiện ca nhỏ nhất, gom lỗi cùng nguyên nhân rồi sửa theo brief. Tối đa hai lượt sửa cho mỗi lát, tính cả các ứng viên thay thế. Nếu vẫn đỏ, bàn giao ca thu gọn cho một subagent độc lập chẩn đoán nguyên nhân và cô lập ứng viên. Tiếp tục phần độc lập và chỉ thử thiết kế lại hẹp khi có giả thuyết khác. Điều phối viên đối chiếu mỗi 20 phút. Bàn giao SHA, lệnh và kết quả thô, ảnh/trace, phần chưa đạt và bước tiếp. Gửi JSON kết quả theo RULES để điều phối viên chạy preflight --verify. Chỉ ghi nhận bản nộp theo phạm vi đã kiểm, giữ kết luận public-demo-v1 ở cổng riêng.
```

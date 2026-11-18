# Thiết kế sửa và đóng gói Smart Traffic — 22/10/2026

> Thiết kế lịch sử của gói cục bộ. Xem [đặc tả Public Demo v1](../../agent/PUBLIC-DEMO-SPEC.md) khi triển khai bản public.

## Mục tiêu đã được người dùng yêu cầu

Sửa lỗi đã tái hiện qua Browser, đơn giản hóa cổng công dân, khoanh vùng mã còn cần và phần dư, đóng gói để người sau đọc tài liệu là hiểu cấu trúc và khởi động được bằng Docker hoặc lệnh.

## Phương án chọn

Giữ nền 3D hiện tại và API FastAPI/SQLite; chỉnh ranh giới giao diện và cách đóng gói. So với viết lại 3D hoặc chuyển toàn bộ thư mục, cách này giữ dữ liệu/các bài kiểm tra đang có và giảm rủi ro đứt đường dẫn. Việc xóa vật lý chỉ áp dụng cho tệp đã kiểm tra không còn tham chiếu; phần nghiên cứu, dữ liệu gốc, DB và tệp đang sửa sẵn được giữ. Tài liệu sẽ chỉ rõ vùng chạy và vùng lịch sử.

## Ranh giới

- `outputs/hcmc-poc`: nền vẽ và mô phỏng. Smart Traffic có giao diện riêng, không mang bảng vật liệu/tham quan/flood lab City Lab vào luồng chính.
- `outputs/smart-traffic/backend`: nguồn dữ liệu nghiệp vụ, quyền, vi phạm, điều khiển và SQLite. Backend quyết định mức phạt, không tin số tiền do trạm gửi.
- `outputs/smart-traffic/web`: hai entry. Công dân mặc định chỉ tra cứu; các màn hình tài khoản hiện có được tách khỏi luồng chính, không xóa dữ liệu tài khoản.
- `outputs/shared`: các module/tài nguyên thực sự được mã chạy tham chiếu. Không xóa hàng loạt vì tên thư mục trông cũ.
- Docker: backend + cổng web phục vụ tài nguyên 3D và web build, reverse proxy API/WebSocket trên cùng origin. Chỉ một cổng host mặc định `127.0.0.1:8088`.
- Volume giữ SQLite, khóa JWT và ảnh bằng chứng qua `down/up`; không đưa dữ liệu runtime, tài khoản seed hoặc toàn bộ backend lên vùng static công khai.
- GPU thuộc trình duyệt ngoài container. Container không sinh FPS giả hoặc thay thế trạm 3D bằng một tiến trình headless.

## Hành vi phải sửa

1. Đổi Preview/Lite giữ ngữ cảnh Smart Traffic và địa chỉ API cần dùng; không tự trở về City Lab.
2. Smart UI gọn: điều khiển đèn, camera/nhiệt, kịch bản được hỗ trợ, đồng hồ và tiết kiệm tài nguyên. Không chồng bảng; hỗ trợ màn hình hẹp.
3. Người dùng đã chọn triển khai xe khẩn cấp ngay: `priority-run` có cứu thương, xe chỉ huy cứu hỏa và cảnh sát. Dùng slot ô tô thật trong pool để giữ IDM/khoảng cách, tuyến và khóa giao cắt; model riêng nằm trong footprint đó. Ưu tiên cuốn chiếu tại nút sắp tới, giữ vàng 3 giây/đỏ chung 2 giây; hướng xung đột dừng trước vùng nút, xe đã vào nút được thoát. Ghi đè cán bộ có quyền cao hơn. Dừng, reset, tái sinh, qua hai nút hoặc hết 240 giây sim phải nhả ưu tiên. Vi phạm của xe/xe đang nhường gắn cờ xem xét, không tự miễn phạt. API xác nhận gửi lệnh; HUD trạm thể hiện thực thi hoặc lỗi thiếu xe, không báo đã chạy thay trạm.
4. Backend tự tính mức phạt từ loại vi phạm/xe và dữ kiện cần thiết; dữ kiện chưa xác minh trả mức chưa xác minh. Công dân không lộ thông tin chủ xe trong tra cứu công khai.
5. Cảnh báo có định danh duy nhất, camera có tên giao lộ/hướng.
6. Kiểm kê đèn City Lab và đèn Smart Traffic; chỉ bỏ lớp trùng đã chứng minh, không xóa các đầu đèn hợp lệ của các hướng khác nhau.

## Vận hành và tài liệu

README ngắn dẫn tới bản đồ mã, hướng dẫn chạy, dữ liệu/backup, kiểm thử, giới hạn còn mở và bảng giữ/gỡ. Có lệnh Docker Compose duy nhất, lệnh chạy cục bộ Windows/Linux, cách dừng và kiểm tra sức khỏe. Container build không chứa `.venv`, `node_modules` host, DB, nhật ký hoặc thư mục nghiên cứu không dùng.

## Kiểm chứng

Test hồi quy trước khi sửa logic. Chạy build/typecheck/test liên quan, Docker build + health + restart/persistence; sau đó dùng Browser thật kiểm tra 3D/cán bộ/công dân qua địa chỉ Docker, console và WebSocket. Xe khẩn cấp có test chuyển pha/giữ/nhả, nhường thật qua IDM, qua nút trên mạng Bắc và Browser. Chưa coi đây là mô phỏng cứu hộ hoàn chỉnh: chưa có xe tải cứu hỏa lớn, điều xe tới địa chỉ, âm thanh còi hoặc đánh giá FPS/soak dài hạn.

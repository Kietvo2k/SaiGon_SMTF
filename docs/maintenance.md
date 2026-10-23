# Phạm vi giữ/gỡ và bảo trì

## Vùng cần để chạy

| Vùng | Quyết định | Lý do |
|---|---|---|
| `outputs/smart-traffic/backend/app` | Giữ | API, schema/migration, seed, policy và SQLite |
| `outputs/smart-traffic/web/src`, `public` | Giữ | Hai giao diện và bản đồ đường dùng chung với backend |
| Các module/data/assets/vendor mà entry 3D tham chiếu | Giữ | Smart tận dụng nền City Lab; tên cũ không chứng minh tệp thừa |
| `outputs/shared/digital-twin-core` phần được import | Giữ | Lõi và hợp đồng nguồn HCMC |
| `test`, `tests`, scripts QA hiện hành | Giữ trong repo, loại khỏi image | Kiểm hồi quy và công cụ cho phát triển |
| `research/`, báo cáo release cũ, manifest giao hàng cũ | Giữ làm tư liệu, loại khỏi image | Truy nguyên dữ liệu/giấy phép; không là nguồn hướng dẫn vận hành hiện tại |
| `.venv`, `node_modules`, DB, ảnh runtime, `work/` | Không đóng vào image/context | Dữ liệu máy cục bộ hoặc được tái tạo; tránh phình image/lộ trạng thái riêng |

Các vùng lịch sử không bị di chuyển hàng loạt trong đợt này: nhiều nguồn có đường dẫn tương đối và các bài kiểm tra đọc trực tiếp. Docker dùng whitelist để khoanh phần giao hàng mà không phá kho nguồn.

## Đã gỡ trong đợt 22/10/2026

| Tệp trong `outputs/hcmc-poc/scripts/` | Bằng chứng không còn là kiểm tra hợp lệ |
|---|---|
| `validate_demo_ready.py` | Đọc `app.js`, `cinematic-night-12.js`, `demo-shell.js` đã không còn tồn tại |
| `validate_ba_son_bridge.py` | Đọc `bridge-detail.js` của runtime cũ đã gỡ |
| `qa-app-integrity-30b.cjs` | Yêu cầu escape hatch `legacy=1` đã không còn trong canonical entry |
| `qa-construction-change-23.cjs` | Đọc `construction-change-23.js` và JSON tương ứng đã gỡ |

Đã tìm tham chiếu trước khi gỡ: không có lời gọi từ entry/runtime/test hiện hành. Các báo cáo `RELEASE-QA-31A.md`, `VISUAL-RUNTIME-31.md`, `outputs/delivery-manifest.json` là ảnh chụp lịch sử nên có thể còn ghi tên các tệp trên; không sửa lịch sử thành một lần nghiệm thu mới.

Có thể xem lại bằng `git show 547679e:outputs/hcmc-poc/scripts/<tên-tệp>`. Chỉ khôi phục khi đồng thời phục hồi đúng runtime/dữ liệu mà script đó kiểm tra. Không thêm chúng trở lại lệnh kiểm tra Smart Traffic hiện hành.

Phần City Lab dư đã được ẩn/tách khỏi nhánh `app=smart`: menu trung tâm, bảng vật liệu/độ thực hóa/Flood Lab. Code còn cần cho chế độ City Lab cổ điển được giữ. Không xóa dữ liệu tài khoản khi gọn UI công dân; màn hình hồ sơ cá nhân được tải riêng khi mở.

## Kiểm tra theo thay đổi

Từ thư mục gốc:

```sh
node --test outputs/hcmc-poc/test/scene-context-32.test.mjs
node --test outputs/hcmc-poc/test/station-client-32.test.mjs
node --test outputs/hcmc-poc/test/perf-2-32.test.mjs
```

Test mô phỏng dài như `violation-32.test.mjs` nên chạy riêng với timeout đủ lớn; không coi timeout của harness là assertion nghiệp vụ đã thất bại. Test backend và web xem README; Docker smoke và kiểm volume xem runbook.

Sau khi sửa giao diện, mở Browser thật để kiểm:

1. Trang công dân vào thẳng ô biển số; nhập chuẩn/viết liền/sai, có/không có kết quả, lỗi kết nối, màn hình hẹp.
2. Cán bộ đăng nhập, thấy đúng quyền, camera có nhãn/hình, đổi camera, nhiệt/điều khiển; console không có lỗi mới.
3. 3D giữ `app=smart`/API/góc sau Lite và reload; không có bảng dư/chồng; trạm kết nối và ảnh cập nhật qua `stream.updated`.
4. Lệnh chưa hỗ trợ không tạo success giả. Dữ liệu mẫu mức phạt bị sửa tại client không thay được policy backend.
5. Khởi động lại container vẫn đọc được hồ sơ đã ghi. `down/up` giữ volume; chỉ thử xóa dữ liệu trên volume được xác định là dùng một lần.

## Giới hạn và phần việc tiếp theo

- Xe khẩn cấp: `emergency-32.js` quản lý slot, chuyến, ưu tiên và model; sim xử lý điểm nhường qua IDM, controller giữ/nhả pha an toàn, station gắn cờ xem xét. Lite có thể kích hoạt đúng một slot trống qua kiểm tra vị trí/khóa và hoàn trả khi dừng, không nâng cả mật độ. Xe chỉ huy cứu hỏa dùng cùng footprint ô tô, chưa phải xe thang/xe tải lớn. Chưa có điều phối tới địa chỉ hoặc âm thanh còi. Không chỉnh trực tiếp mảng lane/s để ép xe vượt hàng chờ.
- Bố trí đèn phải khảo sát từng nút `HX-01`…`HX-06`, đủ hướng nhìn và pha. Chưa có chứng cứ để xóa hàng loạt cột đèn hoặc đầu đèn Smart.
- Backend đã có nguồn quyết định penalty; còn bản mô phỏng phía JS và các hằng nghiệp vụ khác cần hợp nhất có kiểm soát khi đổi policy.
- Query đếm mã theo ngày, broadcast tuần tự, nghiệm thu A1/FPS/soak dài hạn nằm trong backlog; không được đánh dấu xong bằng việc Docker chạy khỏe.
- Cleanup mặc định giữ telemetry 24 giờ, hồ sơ cuối theo cấu hình 14 ngày và trần khung ảnh 500 MB; kiểm `app/config.py` trước khi dùng cho phiên lưu trữ dài hơn. Sao lưu trước các thay đổi về chính sách giữ hoặc schema.

# Lỗi và định hướng UX/nghiệp vụ — 22/10/2026

Nguồn: yêu cầu trực tiếp của người dùng trong phiên kiểm thử Browser ngày 22/10/2026, hai ảnh minh họa người dùng gửi, và [báo cáo kiểm thử thực tế](QA-BROWSER-2026-10-22.md). Đây là danh sách việc cần sửa và yêu cầu để triển khai tiếp, chưa phải danh sách tính năng đã hoàn thành.

## Các định hướng đã ghi nhận từ người dùng

1. **Smart Traffic tận dụng mô hình Hồ Chí Minh có sẵn.** Phải tách phần giao diện/nghiệp vụ giao thông ra khỏi các phần City Lab còn dư.
2. **Cổng người dân ưu tiên đơn giản:** nhập biển số và tra vi phạm. Không bắt người dùng đi qua đăng ký, đăng nhập, gắn biển bằng mã đăng ký xe, thông báo và nhiều biểu mẫu để thực hiện việc tra cứu cơ bản.
3. **Dữ liệu lưu SQLite.** Backend hiện đã dùng SQLite; tiếp tục lấy DB làm nguồn lưu trữ dữ liệu nghiệp vụ, không phát triển một hệ lưu trữ khác chỉ để phục vụ UI.
4. **Cần chỉnh UI tổng thể:** bớt bảng, bớt thông tin phụ, bố cục nhất quán; không chỉ đổi màu rồi giữ nguyên các lớp điều khiển chồng nhau.
5. **Đèn đường và đèn tại nút giao cần kiểm lại:** có vị trí nhiều đèn hoặc hiển thị không ổn theo quan sát của người dùng.
6. **Xe khẩn cấp là phần còn thiếu:** cần có xe và hành vi thực tế trong mô phỏng; một nút bấm báo thành công không được tính là đã triển khai.
7. **Mọi thay đổi giao diện phải thử thật qua Browser**, gồm thao tác, quan sát cảnh vẽ, trạng thái backend và console có liên quan. Unit test là bằng chứng bổ sung.

## Danh sách việc

Cập nhật triển khai: đợt đóng gói đã sửa luồng tra cứu, nhãn camera/căn cứ, key cảnh báo và mất ngữ cảnh Lite; thêm mô phỏng xe khẩn cấp sau khi người dùng chọn làm ngay. Xem [kế hoạch có trạng thái](../superpowers/plans/2026-10-22-smart-traffic-package.md). Bảng dưới giữ yêu cầu và phát hiện ban đầu; LIGHT-01, lưới camera và nghiệm thu dài hạn vẫn còn mở.

| Mã | Việc | Cơ sở/trạng thái | Điều kiện hoàn thành |
|---|---|---|---|
| UX-01 | Gọn cổng người dân, đưa tra cứu biển số thành màn hình chính | Yêu cầu người dùng. API `/public/lookup` và `LookupPanel` đã có, đã thử thành công | Mở trang là thấy ô biển số và nút Tra cứu; không cần tài khoản; có trạng thái đang tìm, không có kết quả, lỗi kết nối, danh sách kết quả |
| UX-02 | Bỏ phần City Lab dư khỏi trải nghiệm Smart Traffic | Hai ảnh người dùng, QA-02 và QA-05 | Không hiện thương hiệu/menu tham quan City Lab, Vật liệu đô thị, Độ thực hóa, góc nhìn trung tâm và Ngập đô thị 25A khi dùng Smart Traffic. Các điều khiển giao thông cần thiết vẫn dùng được |
| UX-03 | Bố cục 3D gọn, chỉ một hệ điều khiển | Đã chụp được hai bảng bên phải chồng nhau | Không che cảnh/nút; bảng dài có vùng cuộn hoặc thu gọn; công cụ đồ họa đặt trong cài đặt riêng; thử lại trên desktop và màn hình hẹp |
| UX-04 | Cải thiện danh sách/hồ sơ cán bộ | Đã thử UI thật: bảng dài, camera chỉ có mã, không có căn cứ/điểm trừ | Camera có tên giao lộ/hướng; trạng thái và hành động dễ phân biệt; hồ sơ đủ thông tin để cán bộ đánh giá; lưới camera theo nhu cầu, có hạn mức tải |
| LIGHT-01 | Kiểm kê từng nút: cột đèn trang trí, đèn tín hiệu, hướng áp dụng, cụm điều khiển | **Người dùng báo; chưa xác minh đầy đủ từng vị trí** | Có ảnh từng hướng trước/sau; đánh dấu đèn dư/trùng, sai vị trí, sai hướng hoặc sai cụm; mỗi lỗi có mã nút và bước tái hiện |
| LIGHT-02 | Kiểm tra pha đèn, đếm lùi và xe chấp hành | Cần kiểm bằng mô phỏng thật; nhiều đầu đèn tại một nút chưa tự nó là lỗi | Đèn cùng hướng đúng pha, nhóm xung đột không cùng xanh, đếm lùi đúng, xe dừng trước stop line, lệnh ghi đè không tạo trạng thái xung đột |
| EMG-01 | Chặn báo thành công giả cho kịch bản Xe ưu tiên | **Đã xác nhận QA-03** | Trạm chưa hỗ trợ thì UI nói rõ; API nhận lệnh và trạm áp dụng là hai trạng thái riêng; thất bại phải hiện được |
| EMG-02 | Triển khai xe khẩn cấp thực sự | M5b-2 còn thiếu; 3D chưa có `priority-run` | Có xe cứu thương/cứu hỏa/cảnh sát nhận diện được, chạy tuyến xác định; xe thường nhường; điều phối đèn ưu tiên; kiểm tra hành vi và ảnh camera bằng Browser |
| DATA-01 | Giữ SQLite làm nguồn dữ liệu nghiệp vụ | Đã xác nhận mã kết nối và dữ liệu hồ sơ thực tế | Dữ liệu qua UI được ghi DB, tải lại còn đúng; có schema/migration, khóa ngoại và truy vết thay đổi |
| DATA-02 | Xác định phạm vi lưu ảnh/video | Hiện tệp trên đĩa, metadata/quan hệ trong DB | Ghi rõ lựa chọn lưu BLOB trong SQLite hay tệp có tham chiếu. Chưa tự ý chuyển toàn bộ media vào BLOB hoặc xóa kho hiện có |

### Chi tiết màn hình người dân tối giản

Luồng chính: **Mở trang → nhập biển số → tra cứu → xem kết quả/chi tiết**.

- Tiêu đề rõ việc tra cứu, ô biển số và một hành động chính.
- Chuẩn hóa biển số; giải thích đầu vào không hợp lệ tại ô nhập thay vì chỉ trả kết quả rỗng gây nhầm.
- Chỉ giữ lựa chọn loại xe nếu API thực sự cần; tránh thêm bước không cần thiết.
- Kết quả gồm thời gian, vị trí, hành vi, trạng thái, mức phạt/căn cứ và ảnh phù hợp với phạm vi công khai hiện có.
- Phân biệt chưa có vi phạm với máy chủ đang lỗi hoặc dữ liệu chưa tải được.
- Đăng nhập/gắn xe/khiếu nại hiện hữu có thể tách khỏi luồng chính nếu còn cần cho phạm vi sau. Yêu cầu giản lược giao diện không đồng nghĩa xóa bảng tài khoản hoặc lịch sử trong SQLite.

### Chi tiết kiểm tra đèn

Cần phân biệt **đèn đường chiếu sáng** với **đèn tín hiệu giao thông**. Một nút có nhiều đầu đèn có thể đúng cho các hướng/làn khác nhau; cần xác minh hướng và pha trước khi xóa.

Danh sách khảo sát ban đầu gồm `HX-01` đến `HX-06`; đối chiếu góc nhìn mặt đường, camera và dữ liệu điều khiển. Một giả thuyết cần kiểm tra là đồ trang trí/đèn của City Lab tồn tại đồng thời với lớp đèn Smart Traffic; chưa được ghi nhận là nguyên nhân đã xác nhận.

## Ưu tiên đề xuất

1. Sửa các lỗi làm hệ thống báo sai: mất Smart Traffic khi chuyển Lite, chấp nhận tiền phạt từ trạm, báo Xe ưu tiên thành công giả.
2. Gọn cổng người dân và dọn giao diện City Lab khỏi Smart Traffic theo yêu cầu mới.
3. Sửa chồng bảng, cảnh báo trùng key, nhãn camera; kiểm tra lại tốc độ và tài nguyên khi UI hoạt động đúng.
4. Khảo sát/sửa đèn theo từng nút; sau đó triển khai và kiểm tra xe khẩn cấp có phối hợp đèn.

Đây là thứ tự đề xuất, chưa thay thế kế hoạch triển khai đã được chốt riêng. Thay đổi tính năng cần đi kèm kiểm thử Browser trước/sau và cập nhật bằng chứng.

## Ảnh và tài liệu tham chiếu

- [Ảnh 1 của người dùng: menu City Lab](../../work/browser-qa-2026-10-22/user-citylab-menu.png).
- [Ảnh 2 của người dùng: bảng Vật liệu đô thị](../../work/browser-qa-2026-10-22/user-material-panel.png).
- [Ảnh kiểm thử: các bảng điều khiển chồng nhau](../../work/browser-qa-2026-10-22/chrome-panels-overlap.png).
- [Ảnh cổng người dân hiện tại](../../work/browser-qa-2026-10-22/chrome-citizen.png).
- [Báo cáo Browser và lỗi đã tái hiện](QA-BROWSER-2026-10-22.md).

# City Lab TP.HCM — hướng dẫn demo Digital Twin Core 17

Bản ngày 14/09/2026. Mục tiêu: trải nghiệm bản đồ 3D gắn truy vấn quản lý và bằng chứng nguồn trong cùng giao diện. Phạm vi đang có khoảng 38,57 km² quanh khu trung tâm, chưa phủ toàn TP.HCM.

## Chuẩn bị

Từ thư mục dự án chạy `python3 outputs/hcmc-poc/serve.py` nếu server chưa chạy. Nếu báo port 8768 đang được sử dụng, kiểm tra trang đang chạy trước khi khởi động thêm. Mở [City Lab](http://127.0.0.1:8768/hcmc-poc/?v=17b&view=overview) trên trình duyệt có WebGL. Giữ `outputs/hcmc-poc` và `outputs/shared/digital-twin-core` cạnh nhau; bản 17 cần HTTP, gói HTML một tệp cũ chưa được cập nhật.

## Trình diễn khoảng 5 phút

1. **Khám phá:** bắt đầu toàn cảnh ban ngày, đến Nguyễn Huệ–Bạch Đằng hoặc công trình tiêu biểu. Kéo trái xoay, kéo phải dịch chuyển, cuộn zoom. Mũi tên/WASD di chuyển, Q/E xoay. Đóng bảng bằng dấu × để dành màn hình cho bản đồ.
2. **Phân tích:** chọn “Mẫu hành lang Nguyễn Huệ”. Tuyến lấy từ dữ liệu đường đã lưu, ID 341504312. A/B/C thử khoảng cách mỗi bên 25/50/100 m. Nhóm ID nguồn lần lượt 46/92/224; diện tích hợp khoảng 6.426,3 / 17.016,2 / 54.064,0 m². Chuyển phép thử giữ camera để nhìn sự khác nhau rõ ràng.
3. **Tự khoanh vùng:** mở “Phạm vi & khoảng cách”, chọn Khoanh vùng → Vẽ vùng. Bấm ít nhất ba điểm trên bản đồ; Enter kết thúc, Backspace bỏ điểm cuối, Escape hủy thao tác. Vẽ tuyến cần ít nhất hai điểm. Các phím di chuyển tạm ngừng khi đang vẽ. Có thể sửa khoảng cách A/B/C rồi phân tích lại.
4. **Truy nguồn và lưu kết quả:** mở “Nguồn, thời điểm và giới hạn”. Nhìn hai nguồn footprint đang tham gia cùng loại chiều cao. Mở “Xuất kết quả & lưu đối chiếu” tải JSON/CSV hoặc HTML; HTML mở bằng trình duyệt để in. Tệp lưu geometry, các phép thử, nguồn, thời gian, hash byte đầu vào và camera. Hash xác định phiên bản tệp, chưa chứng minh đúng hiện trạng.
5. **So sánh và tham quan:** dùng So sánh để đối chiếu mô hình nền với ảnh công trình, hoặc Tham quan để dẫn chuyện. Cảnh đêm là một lựa chọn thị giác, tổng quan ban ngày là điểm mở đầu. Quy hoạch hiện hiển thị đầu mối văn bản có nguồn; chưa có hình học tương lai được duyệt để so hiện trạng–tương lai.

## Cách diễn giải kết quả

“Nhóm ID nguồn” là danh tính trong từng nhà cung cấp, có thể bao gồm bộ phận của một công trình; chưa đồng nhất với số nhà/thửa thực tế. “Biểu diễn hình học” là các footprint đang giao với phạm vi. “Diện tích giao cộng dồn” có thể đếm phần chồng; “diện tích hợp nhất” loại phần diện tích chồng. Viền highlight là ký hiệu phân tích dựng từ footprint trên bản đồ, không là ảnh cảm biến hay vị trí ranh pháp lý.

Hành lang A/B/C là giả thiết người dùng thử, không phải phương án quy hoạch đã duyệt. Phạm vi “nằm trong vùng dữ liệu” chỉ so với extent hiện có; chưa xác nhận mức đầy đủ. Nền vẫn phẳng, nhiều chiều cao là proxy/ước lượng. Số đo hình học địa lý hiện phù hợp sàng lọc. Các nghiệp vụ khảo sát, đào đắp, LOS và ngập cần nguồn địa hình/chiều cao/datum/chất lượng cùng đầu vào chuyên ngành được kiểm chứng.

## Tiếp nhận dữ liệu và mở rộng

Lõi dùng chung có hai cấu hình TP.HCM/Gia Lộc; cùng bộ kiểm quyền, CRS, đơn vị, epoch, hash và gate năng lực. Gia Lộc đã tạo artifact chuẩn hóa 657 footprint bằng CLI. Plugin Phân tích đã áp dụng vào TP.HCM; chưa thay UI Gia Lộc.

CLI hiện tiếp nhận một tệp footprint GeoJSON WGS84 kèm hợp đồng nguồn vào quarantine, giữ bản gốc và QC, không tự xuất bản. Các adapter COG/COPC/3D Tiles/CityGML/BIM và cận cảnh SfM/3DGS là phần tiếp theo, chưa có decoder/service mới trong bản này. [Hợp đồng lõi](shared/digital-twin-core/README.md) có lệnh và API.

Nếu nguồn sai hash, dữ liệu vẽ sai hình học, Worker lỗi hoặc phạm vi vượt giới hạn xử lý, công cụ báo lỗi và không trả một bộ số liệu bị cắt ngầm. Sửa nguyên nhân rồi thử lại; không dùng số liệu của nguồn khác để thay tệp đã bị chặn.

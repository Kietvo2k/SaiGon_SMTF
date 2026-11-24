# Chạy sản phẩm an toàn

## Hai demo tách riêng

| Mục tiêu | Chạy file | Jetson/GPIO | Kết quả |
| --- | --- | --- | --- |
| Xem YOLO vẽ box `car/motorcycle/bus/truck` | `CHAY_AI_BOX_AN_TOAN.bat` | Không kết nối | Dashboard phát video có khung `xyxy`, nhãn loại xe và số đếm; không tạo vi phạm |
| Chứng minh Jetson điều tiết LED/7 đoạn theo mật độ xe | `CHAY_VIDEO_MAU.bat` | Có, chỉ sau khi dây đã kiểm tra | Jetson nhận `COUNT`, tự đổi đèn và số hiển thị bằng đúng cảnh ngã tư CC-BY |
| Demo OCR/cắt xe/cắt biển + tốc độ | `CHAY_MO_PHONG_TOC_DO_OCR.bat` | Không kết nối | CSV, Excel, ảnh toàn cảnh, ảnh xe, ảnh biển, clip H.264; bắt buộc ghi **mô phỏng/cần duyệt** |
| Kiểm thử thuật toán vượt đèn đỏ (biển số xa) | `CHAY_PHAT_NGUOI_VIDEO.bat` | Không kết nối | Chỉ kiểm tra đèn đỏ/vạch dừng; không dùng làm demo OCR vì source không đủ pixel biển số |

Video ngã tư 15 giây là bản cắt CC-BY 4.0, dùng cho **điều tiết Jetson**; bản 640×360 là cùng cảnh đã tối ưu cho Nano. Xem nguồn và điều kiện ghi công trong `demo_videos/ATTRIBUTION.md` và `demo_videos/DEMO_CLIPS.md`.

`2.mp4` vẫn còn nguyên và dùng riêng cho OCR/tốc độ: đây là clip 4K có biển số lớn hơn nhưng không có đèn giao thông. Vì vậy số km/h chỉ là phép đo qua hai vạch đã cấu hình cho demo, không phải biên bản phạt thật.

## Trước khi bật Jetson GPIO

1. Tắt nguồn Jetson và nguồn ngoài trước khi cắm/rút dây.
2. Không nối trực tiếp tải 5 V/12 V hoặc relay vào chân GPIO Jetson. GPIO Jetson là 3.3 V logic.
3. Nguồn ngoài cho LED/relay có thể dùng chung GND với Jetson **chỉ qua mạch driver/level shifter phù hợp**; kiểm tra cực tính trước khi cấp nguồn.
4. Cắm nguồn Jetson riêng, khởi động xong mới cắm RJ45.
5. Trên laptop, chạy kiểm tra chỉ đọc:

   ```powershell
   .\KIEM_TRA_KET_NOI_JETSON.ps1
   ```

   `Ping=OK` chỉ chứng minh mạng. `GpioService_8080=ONLINE` mới chứng minh dịch vụ điều khiển đã chạy.
6. Chỉ khi LED/7 đoạn/relay đã kiểm tra an toàn, SSH vào Jetson và chạy:

   ```bash
   sudo systemctl start jetson-traffic-gpio.service
   sudo systemctl status jetson-traffic-gpio.service
   ```

7. Sau đó mới mở `CHAY_VIDEO_MAU.bat`. Script này gửi `COUNT` và dùng `--count-only`, nên không sinh vi phạm, không gửi cảnh báo còi/relay.

## Ý nghĩa hồ sơ vi phạm

Mỗi hàng CSV có:

- `Evidence image`: ảnh toàn cảnh có vạch dừng, đèn và xe.
- `Vehicle crop`: ảnh cắt xe.
- `Plate crop`: ảnh cắt biển nếu detector tìm thấy.
- `Plate confidence` và `Plate status`.

`READ_UNVERIFIED` nghĩa là AI đọc được chuỗi nhưng cần người xem xác nhận từ ảnh biển. Không dùng kết quả demo làm phạt nguội/pháp lý. `UNREADABLE`, `LOW_CONFIDENCE`, hoặc `NO_PLATE_DETECTED` là kết quả đúng khi ảnh không đủ rõ.

Với demo tốc độ, dashboard và CSV giữ cả `Plate` (OCR thô) và `Reviewed plate` nếu một người đã đối chiếu ảnh crop. Không được ghi đè hay che OCR thô: điều này giúp ban giám khảo thấy rõ chuỗi bằng chứng và bước người duyệt.

## Xem trên dashboard

Mở `http://localhost:8090`. Danh sách vi phạm cho phép mở ảnh xe, ảnh biển và clip. Nếu clip không hiện thời lượng, chờ tiến trình chạy kết thúc; clip được ghi vào file tạm rồi đổi tên khi H.264 đã hoàn chỉnh.

Web server mặc định chỉ nghe trên `127.0.0.1` để máy khác trong mạng không tự ý tải video hoặc đọc bằng chứng. Hai launcher phần cứng `CHAY_DEMO.bat` và `CHAY_VIDEO_MAU.bat` chủ động dùng `--host 0.0.0.0` để Jetson/PC trong mạng B-LINK riêng truy cập; không mở/chuyển tiếp cổng 8090 ra Internet hay Wi-Fi công cộng.

Thanh trạng thái phân biệt hai phần độc lập:

- `AI YOLO: Đang nhận dạng`: model trên máy đang xử lý video và vẽ box.
- `Jetson GPIO: Ngoại tuyến`: dịch vụ phần cứng chưa nối; điều này không có nghĩa YOLO bị tắt.

## Nút Test Video Local bằng AI

Ngay dưới `Camera Giám Sát` có khung `Test Video Local Bằng AI`:

1. Chọn video MP4/MOV/AVI/MKV/M4V, tối đa 256 MB.
2. Chọn một trong bốn chế độ:
   - `YOLO — box & phân loại`: box, class, confidence, track ID và số xe duy nhất.
   - `YOLO + OCR — vượt đèn đỏ`: cần đặt vạch dừng; demo ép đỏ luôn có nhãn mô phỏng.
   - `YOLO + ByteTrack + OCR — tốc độ`: đặt vạch A/B, khoảng cách thực địa và ngưỡng demo.
   - `Heatmap`: MOG2 + vùng chuyển động bền, chỉ ước lượng mật độ khi ảnh mờ/mưa.
3. Bấm `Tải lên & chạy AI`; dashboard hiện tiến độ, preview realtime, video H.264 và link từng ảnh/CSV/JSON.
4. Chế độ vượt đèn đỏ/tốc độ tự xếp toàn cảnh, nguyên xe, crop biển (nếu detector tìm thấy), CSV và video lên Drive. Video nguồn không được tự đưa lên Drive.

Hai nút `Video mưa/mờ input` và `Xem heatmap mẫu 12s` mở cặp clip camera cố định nhẹ đã chuẩn bị. Mọi frame đều ghi rõ thời tiết là mô phỏng và heatmap không nhận dạng danh tính/biển số.

Khi worker upload chạy, `main.py` chỉ tạm nhường CPU rồi tự tiếp tục video điều tiết; tiến trình Jetson không bị tắt. Trang đang mở ở `localhost` nghĩa là AI chạy trên laptop. Muốn Nano tự chạy cả worker AI, triển khai project/server lên Nano và mở dashboard bằng IP của Nano; không được giới thiệu `localhost` hiện tại là inference trên Nano.

## Tự động đưa bằng chứng lên Google Drive

`main.py` và `speed_demo.py` tự xếp mỗi sự kiện vào `logs/evidence_sync_queue.json` sau khi CSV/XLSX đã ghi xong. Một gói gồm ảnh toàn cảnh, crop xe, crop biển, clip, CSV/XLSX và manifest; video nguồn 4K không được tải lên.

Cấu hình không chứa mật khẩu/token nằm tại `config/evidence_sync.json`. OAuth của `rclone` nằm ngoài mã nguồn. Khi mất mạng hoặc Google giới hạn tạm thời, file giữ trạng thái `retry`; worker gửi bù và chống gửi trùng khi kết nối trở lại. Kiểm tra nhanh:

```powershell
python evidence_auto_sync.py --config config/evidence_sync.json status
```

Hoặc nháy đúp `KIEM_TRA_DONG_BO_DRIVE.bat`.

Chỉ trạng thái `complete`/`uploaded` mới được xem là đã giao đủ file lên Drive. `queued`, `waiting_file`, `uploading` hoặc `retry` vẫn là bằng chứng đang chờ và bản cục bộ không bị xóa.

# Bộ bằng chứng demo — 2026-07-18

## Phân vai video

| Video | Vai trò | Ghi chú |
| --- | --- | --- |
| `demo_videos/violation_redlight_15s_ccby4.mp4` | Điều tiết lưu lượng bằng Jetson, đèn giao thông và 4 LED 7 đoạn | Cảnh ngã tư CC-BY 4.0; bản `jetson_redlight_15s_640x360_10fps_ccby4.mp4` là cùng cảnh, đã giảm tải cho Nano. |
| `2.mp4` | OCR và mô phỏng tốc độ | 4K, biển số lớn hơn; không có đèn giao thông nên không gọi là vượt đèn đỏ. |

## Event đã chạy

- Loại: `SPEED_DEMO` / `SIMULATED_CALIBRATED_NEEDS_REVIEW`.
- Video nguồn: `2.mp4`, khung nguồn 8–15 giây.
- Hai vạch: A=1300 px, B=1800 px; khoảng cách cấu hình demo: 10 m.
- Kết quả: `10.6 km/h > 5.0 km/h`, thời gian đo `3.409 s`, mốc video `13.517 s`.
- OCR thô: `AF454O2M`, confidence 0.636, `READ_UNVERIFIED`.
- Người duyệt đối chiếu crop: `BG65USJ`, `HUMAN_REVIEWED`.

OCR thô được giữ nguyên để audit; `BG65USJ` không thay thế hoặc che kết quả AI.
Đây là mô phỏng kỹ thuật, không phải biên bản xử phạt giao thông thực tế.

## Tệp minh chứng

- Ảnh toàn cảnh: `violations/truck_AF454O2M_20260718_181002_SPEED_DEMO_E1_ID10.jpg`
- Ảnh xe: `violations/crop_truck_AF454O2M_20260718_181002_SPEED_DEMO_E1_ID10.jpg`
- Ảnh biển: `violations/plate_TRUCK_AF454O2M_20260718_181002_SPEED_DEMO_E1_ID10.jpg`
- Clip H.264 3 giây: `violations/clip_truck_20260718_181002_SPEED_DEMO_E1_ID10.mp4`
- Log: `logs/violations_20260718_180916_speed_demo.csv`
- Excel: `speed_demo_violations.xlsx`
- Manifest: `logs/speed_demo_20260718_180916.json`

Drive: <https://drive.google.com/drive/folders/1HB94Mj2ZLD2RasBKUtr_aIcn7wrzk_XC>

## Vượt đèn đỏ + OCR

Đã kiểm nguồn công khai có license rõ. Không có clip ngắn nào đã xác minh đồng
thời vượt đèn đỏ thật, biển số đủ pixel, và quyền tái sử dụng. Không dùng nguồn
watermark/giấy phép không rõ cho sản phẩm. Cảnh CC-BY hiện có phù hợp kiểm tra
đèn/vạch nhưng biển số quá xa. Cách đúng để hoàn thiện mục này là quay 10–15
giây có sự đồng ý với biển số giả/in rõ, gắn nhãn `DEMO`; khi đó có ground truth
và có thể audit OCR/crop minh bạch.

# Hiệu năng khi chạy 24/7: hiện trạng, nguồn tải nghi vấn và đề xuất

Ngày: 2026-10-17. Phạm vi: chỉ ghi tài liệu, không sửa mã. Mọi nhận định dưới đây là **nghi vấn**. Mục "Trạng thái" ghi rõ đã thấy trong mã hay chưa xác nhận.

## 1. Hiện trạng

Khi để tab 3D, backend và web chạy liên tục nhiều giờ, máy trở nên lag và đôi khi lỗi. Chưa có số đo định lượng (FPS, heap, CPU, RAM, dung lượng đĩa, số bản ghi IndexedDB theo thời gian). Tài liệu này liệt kê nguồn tải nghi vấn để đo đúng chỗ, chưa phải kết luận.

## 2. Nguồn tải nghi vấn

| # | Nghi vấn | File liên quan | Trạng thái |
|---|---|---|---|
| 1 | Vòng render WebGPU không giới hạn FPS, không giảm khi tab ẩn hoặc không tương tác | `outputs/hcmc-poc/webgpu-materials-24.js` | Đã thấy: render qua `setAnimationLoop`. Không thấy giới hạn FPS hay xử lý `document.hidden`/`visibilitychange` trong file này. |
| 2 | Mô phỏng, đèn, perception và luật vi phạm chạy trên luồng chính | `outputs/hcmc-poc/city-traffic-31.js`, `outputs/hcmc-poc/violation-*-32.js`, `traffic-controller-32.js` | Đã thấy: không có `new Worker` trong các file này. Chưa xác nhận đường gọi từ vòng render và chi phí thực tế. |
| 3 | Render-to-texture nhiều camera và mã hóa ảnh bằng chứng, khung stream trên luồng chính | `outputs/hcmc-poc/camera-capture-32.js`, `station-client-32.js` | Đã thấy: `setRenderTarget`, `readRenderTargetPixels`, `toDataURL` (mã hóa trên luồng chính). Số camera đồng thời và tần suất chụp chưa xác nhận. |
| 4 | Thu nhiệt liên tục và dự báo tua trước chạy thường xuyên | `outputs/hcmc-poc/heat-live-32.js`, `forecast-client-32.js`, `forecast-worker-32.js` | Đã thấy: `forecast-client-32.js` tạo Worker, tick 1 s (`FORECAST_TICK_MS_32 = 1000`). `heat-live-32.js` không tạo Worker. Chu kỳ thu nhiệt chưa xác nhận. |
| 5 | Hàng đợi IndexedDB tăng không giới hạn | `outputs/hcmc-poc/station-queue-32.js` | Đã thấy dùng IndexedDB. Chưa thấy giới hạn số bản ghi hay cơ chế bỏ bản cũ. |
| 6 | Backend: SQLite và ảnh bằng chứng tăng không giới hạn trên đĩa | `outputs/smart-traffic/backend/app/routers/media.py`, `station.py`, `app/db.py` | Đã thấy: `station.py` ghi file ảnh (`write_bytes`) và ghi đè `frames/<cam>-latest.jpg`. Chưa thấy xoay vòng, xóa ảnh cũ hay `VACUUM` trong ba file. |
| 7 | Web nhận WebSocket liên tục và giữ danh sách dài | `outputs/smart-traffic/web/src` (`lib/ws.ts`, các tab) | Đã thấy: `lib/ws.ts` nhận sự kiện. Chưa xác nhận có giới hạn kích thước danh sách trong state. |
| 8 | Tua ×10/×60 chạy sim từng bước có render | `outputs/hcmc-poc/clock-32.js` | Đã thấy hàm `fastForward`. Hệ số tua và việc có render từng bước chưa xác nhận. |

## 3. Đề xuất giới hạn (làm ở phase sau, theo thứ tự ưu tiên)

a. **Giới hạn FPS.** 30 FPS khi đang xem; giảm xuống 5 FPS hoặc dừng render khi tab ẩn hoặc không tương tác trong 60 s. Giảm `pixelRatio`, tắt bóng và hậu kỳ ở chế độ nền.

b. **Tiến trình trạm headless Node.** Chạy sim và luật vi phạm 24/7 trong Node (sim đã chạy được trong Node). Tab 3D chỉ để xem. Ảnh bằng chứng chỉ render khi có vi phạm.

c. **Giảm tần suất đẩy dữ liệu.** Khung stream chỉ gửi khi có người đang xem camera đó, tối đa 1 khung/giây/camera. Thu nhiệt mỗi 10–30 s. Dự báo tua trước theo yêu cầu hoặc 5 phút/lần.

d. **Trần bộ nhớ và đĩa.** Hàng đợi IndexedDB tối đa N bản ghi, bỏ khung cũ trước. Xoay vòng ảnh bằng chứng theo ngày hoặc dung lượng. Dọn bảng telemetry. `VACUUM` SQLite định kỳ.

e. **Web.** Ảo hóa danh sách, giới hạn số mục trong state, gom sự kiện WebSocket theo lô.

f. **Tua nhanh không render từng bước.** Khi tua, cập nhật trạng thái sim mà không vẽ trung gian.

g. **Watchdog và công tắc.** Theo dõi heap JS, tự tải lại tab khi vượt ngưỡng. Thêm công tắc "Tiết kiệm tài nguyên" trên giao diện, gộp các mục a–c.

## 4. Cách đo đề xuất và tiêu chí nghiệm thu

Dùng Playwright chạy 60 phút, ghi mỗi phút: FPS, heap JS, CPU và RAM của tiến trình trình duyệt và Python, số bản ghi IndexedDB, kích thước SQLite và thư mục ảnh bằng chứng.

Tiêu chí đề xuất:

- CPU của tab ẩn dưới 10 % một lõi.
- Heap JS không tăng quá 15 % sau 1 giờ.
- Đĩa tăng dưới 50 MB/giờ.

## 5. Biện pháp tạm thời

- Đóng tab 3D khi không dùng.
- Không tua nhanh qua đêm.
- Chạy `bash outputs/smart-traffic/run-smart.sh --stop` (hoặc `run-smart.ps1 -Stop`) khi xong việc.

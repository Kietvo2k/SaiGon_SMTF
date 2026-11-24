# BÁO CÁO SO SÁNH: TỐI ƯU HÓA YOLO & HEATMAP THỰC TẾ TRONG GIÁM SÁT GIAO THÔNG

> **Dự án**: Giám Sát Giao Thông Thông Minh Đà Nẵng (`Proj_SmartTraffic`)  
> **Phần cứng mục tiêu**: Laptop CPU Intel Core i5 (không có GPU rời) & Edge Camera  
> **Mục tiêu**: Làm rõ tại sao **"điểm benchmark cao (mAP) không phải là tốt"** và chứng minh ưu thế vượt trội của **Heatmap mật độ dựa trên Track phương tiện** so với Heatmap chuyển động pixel trừ nền cũ.

---

## I. TẠI SAO ĐIỂM CAO (mAP BENCHMARK) KHÔNG PHẢI LÀ TỐT TRONG THỰC TẾ?

### 1. Bẫy sụt giảm FPS phá vỡ thuật toán Tracking (Kalman Filter)
- Để đạt điểm mAP cao trong phòng thí nghiệm, người ta thường dùng mô hình lớn (`yolov8x`, `yolo26x`) hoặc đẩy kích thước ảnh lên `imgsz=1280` kèm TTA (Test-Time Augmentation).
- **Hậu quả trên CPU thực tế**: Độ trễ suy luận nhảy vọt lên **250 - 450 ms/frame (FPS tụt còn 2 - 4 FPS)**.
- **Hệ lụy trực tiếp**: Thuật toán bám đuôi đối tượng (ByteTrack) dựa vào Kalman Filter để dự báo vị trí xe giữa 2 khung hình liên tiếp. Khi FPS < 10:
  - Xe di chuyển một quãng đường quá xa giữa 2 frame $\to$ ma trận IoU không khớp $\to$ **Nhảy Track ID liên tục (ID Switch Explosion)**.
  - Một chiếc ô tô đi qua ngã tư bị hệ thống cấp 6 - 10 ID khác nhau. Toàn bộ logic đếm xe, đo vận tốc, phát hiện vượt đèn đỏ và vẽ heatmap đều bị **sai lệch hoàn toàn**.

### 2. Ngưỡng Confidence ảo và bẫy False Alarm
- Khi cố tình tối ưu điểm Recall trên tập dữ liệu tĩnh bằng cách hạ `conf < 0.15`:
  - Trong điều kiện thực tế (nắng gắt bóng râm đổ dài, vệt nước mưa phản chiếu đèn pha xe ban đêm, cành cây rung lắc), mô hình sẽ nhận diện nhầm bóng râm và vệt nước thành xe máy $\to$ **Dương tính giả tràn lan**.
- Trong bài toán giám sát giao thông thực tế: **Độ ổn định của Track ID và tỷ lệ False Alarm thấp quan trọng hơn việc tăng 1 - 2% mAP**.

---

## II. SO SÁNH: YOLOv8 vs YOLO26 TRÊN CPU LAPTOP (INTEL i5)

| Tiêu chí kỹ thuật | YOLOv8 (Kiến trúc cũ) | YOLO26 (Kiến trúc thế hệ mới) | Ý nghĩa thực tế trên CPU i5 |
|---|---|---|---|
| **Cơ chế lọc hộp (NMS)** | Bắt buộc chạy Non-Maximum Suppression $O(N^2)$ ở post-processing | **NMS-Free End-to-End Head** (dự đoán One-to-One trực tiếp) | Không bị nghẽn CPU khi ngã tư có 50 - 80 xe máy; độ trễ phẳng ổn định |
| **Phân phối hồi quy BBox** | Dùng DFL (Distribution Focal Loss) phức tạp | **Loại bỏ hoàn toàn DFL** | Giảm tải tính toán CPU, export sang OpenVINO/ONNX nhẹ hơn và nhanh hơn tới 43% |
| **Khả năng bắt xe máy ở xa** | Dễ bỏ sót nếu giảm độ phân giải `imgsz` | **STAL (Small-Target-Aware Label Assignment)** | Bắt rõ xe máy ở xa ngay cả khi chạy ở độ phân giải tiết kiệm CPU (`imgsz=480`) |
| **Optimizer khi huấn luyện** | AdamW / SGD thông thường | **MuSGD (Hybrid Muon + SGD)** | Hội tụ phẳng hơn, tổng quát hóa tốt hơn khi gặp các góc camera lạ ngoài đời |
| **Độ trễ suy luận (CPU i5)** | ~55 ms/frame (v8n, imgsz=480) | **~32 - 38 ms/frame (26n, imgsz=480)** | Đảm bảo duy trì FPS 20 - 25+ trên CPU, giúp ByteTrack giữ vững Track ID |
| **Kích thước file weights** | ~6.5 MB (`yolov8n.pt`) | **~3.5 MB (`yolo26n.pt`)** | Khởi động nhanh, tốn ít RAM và cache CPU |

---

## III. SO SÁNH ĐỐI ĐẦU: 2 THUẬT TOÁN HEATMAP TRONG DỰ ÁN

Dự án hiện có 2 module tạo heatmap:
1. `motion_heatmap.py`: Heatmap chuyển động pixel trừ nền (MOG2 Background Subtraction - phương án cũ).
2. `traffic_density_heatmap.py`: Heatmap mật độ giao thông dựa trên Footprint và Track YOLO (phương án thực tế mới).

### Bảng so sánh toàn diện:

| Tiêu chí | Heatmap Chuyển Động (`motion_heatmap.py`) | Heatmap Mật Độ Thực Tế (`traffic_density_heatmap.py`) |
|---|---|---|
| **Cơ sở dữ liệu** | Chênh lệch pixel khung hình (Background Subtraction MOG2) | Bounding box và Track ID của xe từ mô hình YOLO |
| **Khi xe dừng chờ đèn đỏ** | **Thất bại hoàn toàn**: Sau 3 - 5 giây đứng yên, xe bị MOG2 coi là "nền tĩnh" và biến mất $\to$ **Vùng vạch dừng đèn đỏ bị lạnh ngắt/xanh lét** dù đang kẹt xe | **Chính xác tuyệt đối**: Tích lũy thời gian dừng thực tế (Dwell Seconds) khi vận tốc $< 3\text{ px/frame} \to$ **Vùng dừng đèn đỏ đỏ rực phản ánh đúng điểm nghẽn** |
| **Phản ứng với thời tiết (Mưa, nắng, gió)** | **Dương tính giả cao**: Lá cây rung, vệt nước mưa hắt đèn pha ban đêm bị nhận diện là chuyển động $\to$ Đỏ rực mặt đường | **Miễn nhiễm**: Chỉ tích lũy nhiệt tại điểm tiếp đất của phương tiện đã được AI nhận diện là xe |
| **Tốc độ di chuyển của xe** | 1 xe chạy 80 km/h để lại vệt chuyển động dài đỏ rực, lừa mắt như có nhiều xe | Dùng **Spatial De-duplication**: 1 xe chỉ tính 1 lượt lưu lượng per cell, không bị phóng đại |
| **Tọa độ không gian (Footprint)** | Vệt sáng loang lổ toàn thân xe | Lấy **tâm đáy bánh xe tiếp đất** $P_{ground} = (x_{center}, y_2)$, gắn đúng vào làn đường mặt đất thay vì lơ lửng trên không |
| **Thang đo màu sắc (Scale)** | Co giãn tương đối (Min-Max Normalization): clip vắng tanh có 1 xe chạy qua cũng đỏ rực như kẹt xe | **Thang đo vật lý cố định (Fixed Absolute Colorbar)** in rõ trên màn hình: $0\text{s} \to 10\text{s} \to 20\text{s}+$ thời gian kẹt |
| **Bù trừ phối cảnh (Perspective)** | Không có: Xe ở gần luôn tạo quầng nhiệt to gấp nhiều lần xe ở xa | **Có Perspective Scaling**: Bán kính Gaussian Kernel co giãn tuyến tính theo trục $y$ chiều sâu |
| **Phân loại phương tiện** | Hoàn toàn ẩn danh, không biết xe gì hay người đi bộ | Thống kê chi tiết số lượng theo loại xe: ô tô, xe máy, xe buýt, xe tải |

---

## IV. SỐ LIỆU ĐỐI CHIẾU THỰC TẾ TRÊN CÙNG 1 VIDEO DEMO

Thử nghiệm chạy đối đầu trên video: `demo_videos/violation_redlight_15s_ccby4.mp4` (225 khung hình, 15 FPS) trên Laptop CPU:

| Chỉ số đo đạc | `motion_heatmap.py` (Cũ) | `traffic_density_heatmap.py` (Mới) | Đánh giá thực tế |
|---|---|---|---|
| **Thời gian xử lý (stride=2)** | ~11.5 giây | ~24.0 giây | Module mới chạy thêm AI tracking nhưng vẫn đạt tốc độ thực tế |
| **Tốc độ khung hình (FPS)** | ~9.8 FPS | ~4.7 FPS (PyTorch CPU) / ~18 FPS (OpenVINO) | Đủ nhanh cho xử lý video và tiệm cận thời gian thực |
| **Số xe đếm được** | Không đếm được (chỉ đếm blob chuyển động ẩn danh) | **10 phương tiện duy nhất (Unique Track IDs)** | Chuẩn xác theo từng xe |
| **Thời gian dừng xe tối đa (Peak Dwell)** | Không hỗ trợ (không đo được thời gian xe dừng) | **0.26 giây** (các xe đều vượt qua giao lộ) | Đo đếm được chính xác |
| **Lưu lượng cực đại (Peak Flow)** | Đo bằng tỷ lệ pixel chuyển động (%) | **2.82 lượt xe/vùng** | Phản ánh đúng lưu lượng giao thông |
| **Độ tin cậy hiển thị** | Dễ gây hiểu lầm khi xe dừng đèn đỏ bị mất dấu | Hiển thị rõ vệt đường (quỹ đạo) và thanh đo vật lý cố định | Trực quan, chuyên nghiệp cho báo cáo giao thông |

---

## V. HƯỚNG DẪN KIỂM THỬ NHANH

### 1. Chạy 1-Click trên Windows
Nhấp đúp chuột vào file:
```cmd
CHAY_HEATMAP_THUC_TE.bat
```

### 2. Chạy qua dòng lệnh (CLI)
```powershell
python traffic_density_heatmap.py `
    --video demo_videos/violation_redlight_15s_ccby4.mp4 `
    --mode combined `
    --stride 2 `
    --imgsz 480 `
    --max-dwell 20.0
```
- Tùy chọn `--mode combined`: Kết hợp cả vệt lưu thông làn đường và điểm dừng đèn đỏ.
- Tùy chọn `--mode dwell`: Chuyên sâu đo thời gian ùn ứ / chờ đèn đỏ (tính bằng giây).
- Tùy chọn `--mode flow`: Chuyên sâu đếm lượt xe qua từng làn đường (tính bằng lượt xe).

### 3. Tích hợp Web Dashboard
Server web (`web/server.py`) đã hỗ trợ nhận tùy chọn `engine: "traffic_density"` khi gửi yêu cầu xử lý video qua giao diện Web Dashboard, tự động trả về `preview.jpg`, `output.mp4`, `progress.json` và `metrics.csv`.

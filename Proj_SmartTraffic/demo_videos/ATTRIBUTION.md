# Nguồn video mô phỏng phạt nguội

`rlr_occasions_cc_by_4.mp4` được tải từ bộ **Dataset for Traffic Evaluation**
của Tiago Silva (2024), Zenodo, DOI
[10.5281/zenodo.14041920](https://doi.org/10.5281/zenodo.14041920).

- File gốc: `rlr_occasions.mp4`
- Mục đích bộ dữ liệu: thử nghiệm phân tích giao thông và mô hình phát hiện
  vượt đèn đỏ.
- Giấy phép: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Khi trình bày, ghi: `Video source: Tiago Silva, Dataset for Traffic
Evaluation, Zenodo (2024), CC BY 4.0, DOI: 10.5281/zenodo.14041920.`

Đây là dữ liệu mô phỏng/đánh giá. Không gọi kết quả demo là biên bản phạt thật.

## Video mưa/mờ cho heatmap

`rain_blur_12s_640x360_10fps_pexels.mp4` và
`rain_blur_heatmap_12s_640x360_10fps_pexels.mp4` là các đoạn dẫn xuất 12 giây
từ [Rainy Highway Drive on Overcast Day](https://www.pexels.com/video/rainy-highway-drive-on-overcast-day-33523299/)
trên Pexels. Nguồn được tải ngày 18/07/2026 và được cắt/hạ độ phân giải để demo
nhẹ trên Jetson Nano. Pexels cho phép tải, sử dụng và chỉnh sửa theo
[Pexels License](https://www.pexels.com/license/).

Clip này chỉ kiểm thử tầm nhìn kém và mật độ chuyển động, không phải bằng chứng
vượt đèn đỏ/tốc độ và không được dùng để khẳng định danh tính hay biển số.

`degraded_visibility_fixedcam_12s_640x360_10fps_ccby4.mp4` là bản camera cố
định được làm mờ, giảm tương phản và phủ vệt mưa **mô phỏng** từ clip Jetson
CC BY 4.0 ở phần trên. File luôn có chữ `SYNTHETIC RAIN/BLUR TEST`, vì đây
không phải thời tiết thật. `degraded_visibility_heatmap_12s_640x360_10fps_ccby4.mp4`
là kết quả heatmap tương ứng và là lựa chọn nên dùng khi trình bày điều tiết.

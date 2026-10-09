# Khảo sát bước J 31A — xe, cầu, đường còn dở

Ảnh trước/sau cùng góc nằm trong `khao-sat/` (`truoc-*.jpg` / `sau-*.jpg`, WebGPU 1600×900, giao diện ẩn). Chụp bằng
`work/tmp31j-cap.cjs` (nháp, không commit): camera đặt qua hook `__THREE_DEVTOOLS__`, xe cận cảnh bám đúng id xe.

## Danh sách mục còn dở (ưu tiên theo mức gây chú ý ở góc nhìn demo)

| # | Mục | Vị trí / ảnh | Vấn đề | Cách sửa | Kết quả |
|---|---|---|---|---|---|
| 1 | Hình xe quá thô | `truoc-xe-*` (xe máy, ô tô, buýt, tải; ngày + đêm) | Xe là hộp ghép: bánh là tấm phẳng chạy suốt bề ngang thân, cabin ô tô là khối xám, xe máy không đọc được là xe máy | Dựng lại bằng khối đa diện có vát (cabin kính dốc, thân thu về nóc), bánh lăng trụ 8–10 cạnh có hub, người lái xe máy (đùi, cẳng, thân, tay, mũ sơn, kính mũ), buýt 7 ô cửa sổ/bên + cửa + bảng tuyến + máy lạnh, tải cabin kính + thùng + dải sơn + 6 bánh; vẫn 1 InstancedMesh/loại | Đã sửa (`sau-xe-*`) |
| 2 | Cầu sông/cầu vượt tối om ban đêm | `truoc-thu-thiem-dem`, `truoc-kh-dem`, `truoc-tn2-dem` | Mặt cầu không có đèn, đứt mạch với các phố có đèn | Đèn gắn lan can (InstancedMesh, so le hai mép, 30–36 m/đèn), đầu đèn phát sáng theo nút Ngày/Giờ vàng/Đêm; chân cột bám đúng mặt đường vẽ | Đã sửa (`sau-thu-thiem-dem`, `sau-kh-dem`) |
| 3 | Đảo giao thông nhỏ răng cưa | `truoc-anh-04-*`, `truoc-dao-a`, `truoc-dao-b` (Lê Lợi / Nam Kỳ Khởi Nghĩa) | Quanh các road link 8–13 m nối hai giao lộ, bó vỉa (viền sáng) bị polygon giao lộ che dở, chỉ để lại các mảnh tam giác nhọn | Bỏ bó vỉa của road nối hai giao lộ có thân asphalt < 20 m (không xét road trên cao); thân asphalt vẫn vẽ | Đã sửa (`sau-dao-*`, `sau-anh-04-*`); đảo giờ là mảng median phẳng |
| 4 | Khe tóc dọc mép polygon giao lộ trên cao | `truoc-cau-so14` (đường dẫn hai chiều, vị trí ≈ 450, 1235) | Đường kẻ sáng mảnh chạy ngang mặt đường tại ranh polygon/thân đường (bó vỉa lộ qua khe dưới điểm ảnh) | Thử cho thân đường gối vào polygon 8 cm: không đổi kết quả nên đã hoàn tác. Nguyên nhân chưa xác định | CÒN TỒN (nhỏ, chỉ thấy ở cận cảnh) |
| 5 | Lan can dải đôi đứt đoạn | `truoc-cau-so14` | Lan can mép trong giữa hai nhánh một chiều bị cắt từng đoạn (quy tắc `covered`, gộp ≤ 40 m) | Chưa sửa: đổi quy tắc có thể làm lan can chồng lên mặt đường kề | CÒN TỒN |
| 6 | Vệt/nhãn khác ở ảnh gốc 01, 02, 03, 05 | `truoc-anh-0{1,2,3,5}-*` | Đã đạt sau các bước B/C/E2/G (dốc dẫn, lan can, đèn ngoài mặt đường); không có lỗi mới | Không cần sửa | Giữ nguyên |
| 7 | Cầu Ba Son, cầu đi bộ Bạch Đằng | `truoc-anh-05`, `truoc-cau-bach-dang`, `truoc-cau-ba-son-nhip` | Đầu cầu liền mặt đường, không còn hộp treo | Không đổi hình dạng (signature); đèn lan can bỏ qua cầu signature | Giữ nguyên |
| 8 | Ảnh cầu sông xa (Sài Gòn, Nguyễn Văn Cừ, Khánh Hội, Thủ Thiêm, Thị Nghè, Hàng Xanh, Nguyễn Hữu Cảnh) | `truoc-cau-*`, `truoc-kh-*`, `truoc-tn2-*`, `truoc-hang-xanh-duoi` | Bản mặt dày, trụ đặt trên nước, dốc dẫn chạm đất, không thấy đầu cầu hở hay trụ lơ lửng | Không cần sửa (validator cầu: 0 bậc, 0 đầu cụt, 0 trụ trong mặt đường) | Giữ nguyên |

## Số liệu trước/sau

| Nhóm | Trước | Sau |
|---|---|---|
| Tam giác mỗi mô hình xe (xe máy / ô tô / buýt / tải) | 144 / 156 / 144 / 144 | 246 / 160 / 244 / 284 |
| Tổng tam giác xe theo pool 3599 xe (2811 / 527 / 136 / 123) | 524 292 | 843 942 (1,61×, ngân sách ≤ 2×) |
| Mesh / draw call xe | 4 | 4 (1 InstancedMesh mỗi loại) |
| Tam giác nhóm đường (ngân sách 248 100) | 247 370 | 242 972 |
| Tam giác nhóm cầu/chi tiết | 47 829 (5 mesh) | 63 669 (6 mesh; +528 đèn × 30 tam giác) |
| CPU vòng cập nhật xe p50 / p95 (QA, WebGPU) | ≤ baseline | 0,5 ms / 1,6 ms (qua check ≤ baseline) |

Ghi chú: signature registry không đổi; hình dạng cầu Ba Son và Bạch Đằng không đổi.

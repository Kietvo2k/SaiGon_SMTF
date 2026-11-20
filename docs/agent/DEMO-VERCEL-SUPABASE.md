# SaiGon SMTF — Bản nộp Vercel và Supabase

Phiên bản phạm vi: `vercel-demo-2026-11-20`. Bản nộp trước 24h ngày 20/11/2026, giờ Việt Nam. Tài liệu này chốt phạm vi và hợp đồng của đợt nộp. `public-demo-v1` vẫn là đặc tả nghiệm thu đầy đủ. Khi tạo brief, giữ `specVersion: "public-demo-v1"` theo preflight hiện tại, thêm tài liệu này vào `requiredReads` và ghi scope đợt nộp trong ledger.

## Mốc và quyền sở hữu

- Mốc tài liệu gốc `smtf-public-demo-handoff-v1` tại `3c9dac9`. Điều phối viên bàn giao cùng một commit tài liệu mới cho cả hai CLI. Đối chiếu ancestry và chỉ lấy các phần đã xác minh. Lõi tham chiếu `b9bdd82` có WebGL2 thật. Không ghép nguyên `ae04917` đang đỏ forecast worker. UI tham chiếu `619eed5`, giữ bản đóng băng và test đỏ cũ.
- UI giữ landing, React, HUD, trình bày camera, CSS và fixture phía UI. Lõi giữ Vite/entry 3D, graph, tín hiệu, capture, server Functions, Supabase migration/seed và đóng gói. Điều phối viên giữ tài liệu hợp đồng, nhánh tích hợp, sổ tiến độ và kết luận kiểm. Đụng cùng tệp thì người sở hữu thực hiện hunk đã thống nhất.
- 21h ưu tiên URL xem landing + 3D. 22h30 đóng ứng viên, 23h kiểm URL sạch, bàn giao trước 24h. Nếu ô vuông đỏ ở 22h30, dùng vùng Bắc đã xác minh trên ứng viên ghép. Nếu camera trực tiếp đỏ, dùng ảnh mẫu có nhãn và ghi rõ phần chưa đạt. Cả ba lối vẫn phải chạy và cùng Supabase để được ghi đạt bản nộp.

## Đường dẫn, dữ liệu và phân quyền

Một origin Vercel: `/`, `/hcmc-poc/`, `/index-officer.html`, `/index-citizen.html`. Chạy 3D trong trình duyệt. Một Supabase demo chứa danh mục nút/camera, hồ sơ mẫu, metadata phiên và ảnh trong bucket riêng. Functions đọc/ghi với khóa server. Client không nhận khóa đặc quyền hay đường dẫn đối tượng thô. Từ chối truy cập trực tiếp bảng/bucket nếu thiếu quyền, giữ RLS cho bảng exposed. Chỉ seed dữ liệu giả lập. Vercel giữ asset build trước, Cloudflare chỉ dùng cho asset nếu đã đo vượt giới hạn sau tối ưu. [Vercel Functions](https://vercel.com/docs/functions) · [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

Server env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DEMO_SESSION_SECRET`. Biến khóa dùng ở Functions, ngoài bundle và ngoài Git. Lõi có thể thêm env không bí mật dùng cho build nếu ghi trong runbook. Tên phiên bản build phải hiện trong evidence, trỏ tới commit đã dùng để deploy.

| Method và route | Giao kèo |
|---|---|
| `POST /api/demo/session` | Bắt đầu hoặc tái dùng phiên demo ký bằng cookie HttpOnly, Secure khi HTTPS, SameSite=Lax, Path=/, hạn 8 giờ. Không cần email/mật khẩu. Trả `{ok:true}`. Cán bộ gọi khi bấm **Vào demo cán bộ**, 3D gọi trước khi gửi khung. Mỗi hồ sơ trình duyệt có phiên riêng. |
| `GET /api/demo/officer` | Cần phiên. Trả `{kpi,records,cameras}`. `kpi` có `source="sample"|"live"` và các trường sẵn có trong snapshot, giữ đúng nhãn nguồn. `records` là mảng `{plate,summary,status}`. `cameras` là mảng `{cameraId,junctionId,label}`. UI chỉ xem. |
| `GET /api/demo/lookup?plate=...` | Công khai, chuẩn hóa cùng quy tắc UI, tìm biển chính xác. Trả `{plate,records:[{plate,summary,status}]}`. Seed có `51K-123.45`, dạng liền `51K12345` cho cùng kết quả. `51K-987.65` hợp lệ và không có trong seed. |
| `GET /api/demo/camera?cameraId=...` | Cần phiên. Trả `{cameraId,junctionId,label,source,frameId,capturedAt,imageUrl}`. `source` là `sample`, `live` hoặc `missing`. Mẫu có `capturedAt:null`. Thiếu khung có thể dùng ảnh mẫu đúng ID, hoặc hiện missing khi mẫu cũng thiếu. Không lấy ảnh từ camera khác để lấp chỗ. |
| `GET /api/demo/media?cameraId=...&frameId=...` | Cần phiên. Phục vụ JPEG đúng camera và đúng frame của phiên, hoặc ảnh mẫu chính thức từ Storage. No-store cho khung sống, từ chối khi frame không còn hoặc không thuộc phiên. |
| `POST /api/demo/frame?cameraId=...&frameId=...` | Chỉ 3D dùng trong flow, server xác minh phiên ký, camera thuộc danh mục, Content-Type và giới hạn JPEG. Tối đa một frame mỗi 3 giây cho phiên đang xem, tối đa 256 KiB/frame. Lấy giờ nhận phía server. Chỉ giữ khung mới nhất hoặc tối đa hai slot/phiên, không lưu chuỗi ảnh. Dừng gửi khi tab ẩn hoặc không có người xem camera. |

Lỗi nhất quán `{error:{code,message}}`. Dùng 400 cho biển/đầu vào không hợp lệ, 401 cho phiên thiếu/hết hạn, 404 cho media/camera không tồn tại, 429 cho gửi vượt nhịp, 503 cho dịch vụ dữ liệu lỗi. Tra biển hợp lệ mà rỗng trả 200 với mảng rỗng. Hồ sơ mẫu dùng chung. Khung sống chỉ đọc trong phiên có cookie phù hợp. Chọn camera đang xem qua BroadcastChannel cùng origin nếu cần. Kênh này chỉ truyền tín hiệu chọn và không lưu dữ liệu nghiệp vụ. Sau khi quá 10 giây chưa có frame mới, trở về ảnh mẫu có nhãn hoặc trạng thái thiếu nguồn. Với phương án ảnh mẫu, vẫn lấy ảnh và metadata từ Supabase.

Mã giao lộ dùng chung: `HX-C1…HX-C5`, `Bac-01…Bac-05`. Giữ ánh xạ camera từ danh mục Bắc của lõi, xác minh đủ `junction_id` theo đúng khóa logic khi dựng seed. UI có thể dùng fixture của chính shape phía trên. Kết luận bản nộp yêu cầu dữ liệu chạy thật trên cùng artifact.

## Fixture chung cho lớp UI

Ví dụ dashboard sau khi vào demo. Các giá trị KPI ở đây là mẫu, không dùng làm kết quả benchmark.

```json
{
  "kpi": {"source":"sample", "wait_avg_s":18, "queue_max":9, "flow_per_node_min":24},
  "records": [{"plate":"51K-123.45", "summary":"Vi phạm tín hiệu (mẫu)", "status":"confirmed"}],
  "cameras": [{"cameraId":"CAM-BAC-002", "junctionId":"Bac-02", "label":"Ung Văn Khiêm × Nguyễn Gia Trí"}]
}
```

Tra cứu `51K12345` trả `plate: "51K-123.45"` và cùng danh sách `records` với hồ sơ mẫu trên. Khi lỗi, fixture phải theo đúng HTTP status và `error.code`: `INVALID_PLATE`, `SESSION_REQUIRED`, `NOT_FOUND`, `RATE_LIMIT`, `DATA_UNAVAILABLE`. Kết quả camera đã chọn gồm `cameraId`, `junctionId`, `label` giống danh mục, `source: "sample"`, `frameId: "sample-CAM-BAC-002"`, `capturedAt: null` và `imageUrl` tương đối cùng origin. Khung sống thay `frameId`, `capturedAt` và `source` cùng nhau.

## Cổng nghiệm thu bản nộp

| ID | Cách kiểm bắt buộc |
|---|---|
| `SUBMIT-NAV` | URL HTTPS sạch. Từ landing bấm **Xem demo**, mở đủ ba trang, quay lại được. Không lỗi asset, localhost, worker hoặc màn hình trắng. |
| `SUBMIT-DATA` | Cán bộ vào bằng một nút, có KPI/hồ sơ/camera cùng seed. Hai dạng biển mẫu trả cùng hồ sơ và cùng nội dung dashboard. Kiểm biển sai, biển rỗng kết quả và lỗi Supabase tách trạng thái. |
| `SUBMIT-CAM` | Camera trỏ đúng nút, ảnh mẫu có nhãn, fullscreen đủ khung, đổi nhanh không lộ frame cũ. Khi bật trực tiếp, mở 3D cùng hồ sơ, thấy khung timestamp mới; đóng tab 3D trở về ảnh mẫu. Hai hồ sơ trình duyệt không thấy khung của nhau. Nếu đã dùng phương án ảnh mẫu, lưu ca đỏ trực tiếp và kết quả mẫu đã kiểm. |
| `SUBMIT-3D` | 10 nút, toàn khu/góc chuẩn/tới nút. Trên 390/768/1440 px HUD thu gọn không che tâm nút. Bắc 02/03 có ảnh vạch và hướng vào. Xe Lite rõ thân, mui, bánh ở góc gần. Biên đúng vùng đã nhận, đường qua biên đúng hướng/cao độ. Ghi vùng dùng trong evidence. |
| `SUBMIT-SIGNAL` | Kiểm ca tái hiện tại một điểm kẹt, số đo trước/sau cùng seed. Xe dừng đúng vạch, không xung đột xanh, vàng 3 giây, đỏ chung 2 giây. Giữ smoke và hash hồi quy 31A nếu có đổi lõi. |
| `SUBMIT-PERF` | Cùng seed, viewport, góc nhìn và máy trước/sau. Ghi thời gian sẵn sàng, byte tải, median FPS, p95 frame time và tick sim. Có cải thiện chi phí tải hoặc render cùng hình xe và luật sim. PERF-01 máy iGPU/RAM 8 GB và soak 30 phút thuộc lần nghiệm thu v1 đầy đủ. |

Bàn giao SHA, manifest, URL, danh sách ID đạt/đỏ/áp dụng phương án dự phòng và ảnh/trace. Xem dữ liệu báo cáo thô để bắt thiếu ID, thiếu ca, kết quả cũ hoặc vượt sai phạm vi. Giữ nguyên cổng v1. Bản nộp chỉ có 3D khi Supabase chưa kết nối thì ghi đúng là URL thử 3D.

## Runbook theo hạn

1. Kiểm hai dự án demo và quyền tài khoản. Vercel đã đăng nhập Chrome, chưa thấy SMTF trong danh sách đã xem. Supabase đang ở màn hình đăng nhập lúc khảo sát. Cần chọn dự án riêng hoặc tạo dự án demo khi có quyền. Chuẩn bị SQL/build song song. Chỉ áp seed/migration lên dự án demo đã xác nhận.
2. Build sạch trên SHA đã chọn, xuất manifest artifact và danh sách nguồn. Deploy preview trên Vercel, mở URL public sạch để kiểm access. Ở mốc đầu có thể triển khai landing/3D trước và ghi rõ phạm vi chưa đủ.
3. Ghép lõi đã qua kiểm, rồi UI. Chạy kiểm thực tế trên artifact cuối cùng. Nếu gặp lỗi, gộp theo nguyên nhân, tái hiện nhanh, giao lại owner. Tối đa hai lượt sửa sau vòng đầu. Khi hết lượt, đóng ứng viên, mời chẩn đoán độc lập, thử một cơ chế thay thế có phạm vi hẹp nếu đủ căn cứ. Tiếp tục phần độc lập để giữ tiến độ.
4. Mỗi 20 phút ghi SHA, trạng thái, log, người giữ bước kế tiếp. Chỉ nhắc tiến trình đã dừng còn việc hợp lệ. Không chia nhiều lượt lặp cùng kết quả. Khi chốt, giữ URL đã kiểm gần nhất và phân biệt rõ mốc thử 3D, mốc đủ ba demo và nghiệm thu v1.

Bản giao theo vai trò cần tài liệu kỹ thuật, lệnh kiểm và log, `preflight --verify --result`, SHA, việc còn thiếu và bước tiếp. Prompt ở [nhánh UI](../prompts/DEMO-VERCEL-UI.md) và [nhánh lõi](../prompts/DEMO-VERCEL-CORE.md).

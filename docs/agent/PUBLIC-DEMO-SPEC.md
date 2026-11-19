# Đặc tả phát hành SaiGon SMTF Public Demo v1

**Phiên bản hợp đồng:** `public-demo-v1` · **Commit hiện trạng đã khảo sát:** `3f8e31e` · **Mốc bàn giao triển khai:** `smtf-public-demo-handoff-v1`.

Các mục dưới đây quy định hành vi phải đạt trước khi phát hành. [Handoff](HANDOFF.md) ghi riêng phần đã kiểm chứng, phần đang làm và phần cần nghiệm thu.

## 1. Mục tiêu và phạm vi

Một landing page công khai trên Vercel có ba lối vào cùng origin. Người dùng mở được 3D, điều hành và tra cứu biển số trên một trình duyệt sạch. Hệ thống dùng tài khoản và hồ sơ mẫu, cùng dữ liệu mô phỏng từ khu Bắc TP.HCM. Một khách tự vận hành được toàn bộ bản demo. Các tab cùng origin và cùng hồ sơ trình duyệt thấy cùng dữ liệu. Các hồ sơ trình duyệt và các máy có dữ liệu riêng.

| Trang | Đường dẫn chuẩn | Hành vi đầu tiên |
|---|---|---|
| Landing | `/` | Ba lối vào hiện rõ, nhận focus bàn phím. Giải thích ngắn rằng đây là dữ liệu mẫu lưu trên trình duyệt. |
| Mô phỏng 3D | `/hcmc-poc/` | Cảnh toàn khu Bắc, nút bắt đầu kịch bản, truy cập trực tiếp đến camera và KPI. |
| Trung tâm điều hành | `/index-officer.html` | Hiện tài khoản mẫu có nút điền nhanh. Sau đăng nhập, chọn camera, xem KPI, điều khiển theo vai trò. |
| Tra cứu | `/index-citizen.html` | Vào thẳng ô biển số, có mẫu dễ thử. Đăng nhập khi cần mở hồ sơ hoặc khiếu nại. |

Phát hành public gồm hai gói tĩnh từ cùng commit. Vercel chứa các trang và mã frontend/worker. Cloudflare Pages chứa dữ liệu cảnh, texture, model và giấy phép. FastAPI, SQLite và Docker vẫn phục vụ bản cục bộ và là chuẩn đối chiếu nghiệp vụ. [Hợp đồng v1](CONTRACT-PUBLIC-DEMO.md) quy định phần khác nhau giữa hai chế độ.

## USER-01 Luồng người dùng và trạng thái lỗi

### Tra cứu và hồ sơ công dân

1. Khách tra biển chuẩn hoặc viết liền. Cổng hiển thị kết quả rỗng khi biển hợp lệ và chưa có bản ghi công khai. Cổng hiện lỗi tại ô nhập khi sai định dạng. Chỉ trả trường công khai và hồ sơ được phép, theo hành vi hiện tại của `GET /public/lookup`.
2. Tài khoản công dân mẫu có sẵn một biển gắn với hồ sơ có thể thao tác. Người dùng đăng ký mẫu, đăng nhập, gắn hoặc bỏ biển bằng mã đăng ký mẫu, lọc và mở hồ sơ, cập nhật trạng thái thanh toán mẫu, gửi khiếu nại, theo dõi kết quả và đánh dấu thông báo đã đọc. Form chỉ yêu cầu thông tin mẫu. Thanh toán chỉ đổi trạng thái. Hai lần gửi cùng hồ sơ phải cho kết quả nhất quán, với nhật ký nghiệp vụ liên quan.
3. Trang phân biệt màn hình đang tải, biển không hợp lệ, không tìm thấy, kết quả chưa cập nhật, kho lưu trữ gặp lỗi và lỗi ảnh. Thao tác bằng bàn phím, focus rõ, thông báo có chữ thay vì chỉ đổi màu.

### Cán bộ, chỉ huy và quản trị

1. Cán bộ đăng nhập tài khoản mẫu, lọc và xem bảng/ảnh vi phạm, xác nhận, yêu cầu xác minh, gỡ, thông báo, giải quyết khiếu nại và xem thống kê/nhật ký phù hợp với quyền. Bản ghi bị đổi trong tab khác cập nhật khi có sự kiện hoặc khi lấy lại focus.
2. Chỉ huy và quyền được phép trong bản cục bộ có thể chuyển đèn cố định/thích ứng, ghi đè pha, chọn kịch bản cao điểm/chặn làn/ngập/xe ưu tiên và đặt VMS. UI luôn đọc trạng thái đã áp dụng từ trạm. Khi trạm chưa mở, chỉ rõ cần mở 3D và giữ các chức năng hồ sơ dùng được. Lệnh hết hạn, từ chối hoặc trạm mất kết nối có trạng thái riêng.
3. Quản trị viên xem người dùng mẫu, xem lưu trữ, thêm cán bộ/chỉ huy, bật/tắt tài khoản và đổi các vai trò mà API hiện hành cho phép. Người dân và cán bộ không nâng quyền qua form, URL hay thông điệp sự kiện. Ràng buộc phân quyền của public nhằm trình diễn hành vi nghiệp vụ trong máy khách. Dữ liệu riêng hoặc quyền quản trị thật chỉ thuộc môi trường cục bộ.

## CAM-01 Góc nhìn 3D và camera

1. Bản đồ mở ở góc toàn khu. Mỗi nút có nút **Tới nút giao**, góc cao thấy các vạch dừng và các hướng tiếp cận, nút **Về toàn khu** và **Góc chuẩn**. Chọn lại góc sau resize, fullscreen hoặc đổi Lite giữ cùng nút đang xem. Cảnh được phép cuộn/phóng bằng chuột và chạm, UI có thao tác bàn phím thay thế.
2. Một bảng điều khiển chính có thể thu gọn, không phủ đối tượng đang thao tác ở viewport 390, 768 và 1440 px. Bản đồ, đèn, tuyến, camera và bảng quyết định dùng cùng `junction_id` và nhãn giao lộ. Cán bộ nhìn ảnh đủ khung ở fullscreen, thấy nguồn, thời gian và trạng thái khung cũ. Giữ mã camera cũ, thêm ít nhất một góc quan sát cho mỗi cụm mới.
3. Khi WebGPU không khả dụng, mở bằng WebGL2 nếu có. Nếu không có WebGL2, hiện lý do, đường về hai web, ảnh mẫu có ghi nguồn và nội dung thuyết trình đã đo. Tách quyền dùng các form nghiệp vụ khỏi khả năng render 3D.

## SIM-01 Lõi giao thông và hình học

### Mở rộng mạng

Giữ sáu mã nút bố trí thành năm giao lộ logic hiện tại. Thêm năm cụm theo bảng. Xác minh lại cụm và các vạch dừng trên đồ thị làn trước khi phát hành. Các mã `Bac-*` dưới đây là ID phân phối cho UI và cấu hình, khác với OSM ID. Các nhánh của cùng cụm ở cao độ khác nhau phải có cấu hình tuyến phù hợp, tránh nối tắt xuyên cầu hoặc ngược chiều.

| ID cụm mới | Giao lộ | OSM ID |
|---|---|---|
| `Bac-01` | Phan Đăng Lưu × Lê Quang Định | `12310895540`, `2351201590` |
| `Bac-02` | Ung Văn Khiêm × Nguyễn Gia Trí | `366376129` |
| `Bac-03` | Ung Văn Khiêm × Nguyễn Văn Thương | `366416151` |
| `Bac-04` | Điện Biên Phủ × Nguyễn Văn Thương | `7975327079` |
| `Bac-05` | Điện Biên Phủ × Nguyễn Hữu Cảnh | `2028465981` |

Nguồn kiểm lần đầu là `outputs/hcmc-poc/data/road-graph-31.json`. Kiểm đồ thị có hướng đã thấy đường đi hai chiều tới Hàng Xanh cho các ứng viên. Nghiệm thu ở cấp làn cần ảnh mỗi hướng, đường vào/ra hợp lệ, phép chiếu camera, cao độ, quan hệ xung đột và phép thử xe qua. Nếu không đạt, ghi rõ nguyên nhân và sửa cấu hình cụm trước khi đóng mục. Vạch dừng nằm trên làn vào, đầu đèn đúng bên và đứng ngoài đường xe chạy. Đo và hiệu chỉnh khoảng chuyển làn, bán kính rẽ, khoảng trống quay và vị trí vạch dừng. Cùng hình học đó cấp dữ liệu cho mô phỏng và bản vẽ. Tách đầu đèn giao thông khỏi đèn trang trí khi kiểm ảnh.

### Tuyến, điều tiết và công cụ chẩn đoán

- Sinh chuyến từ cổng/đoạn xuất phát đến một điểm đích theo seed. Danh sách demo gồm chuyến qua Hàng Xanh tới trục Điện Biên Phủ – Nguyễn Hữu Cảnh và chuyến tới Ung Văn Khiêm – Nguyễn Văn Thương. Giải tuyến theo đồ thị có hướng và phép rẽ hợp lệ. Chi phí gồm thời gian đi, hàng chờ và khả năng tiếp nhận; sự cố khóa cạnh làm cạnh bị loại khỏi tuyến. Giữ tuyến khi chênh lệch không đáng kể để tránh đánh võng. Tính lại tại nút có lối hợp lệ và ghi lý do khi đổi hoặc không tìm được tuyến.
- Lõi mô phỏng bước cố định 0,1 giây, độc lập FPS. Kịch bản chạy được với cùng seed ở Node và trình duyệt. Guardrail gồm vùng xung đột, giữ khoảng cách xe, hạn chế đưa xe vào lối ra đầy, tối thiểu/tối đa xanh theo bộ điều khiển và phục vụ nhóm chờ đủ lâu. Khi chuyển nhóm xanh, đi qua vàng 3 giây, đỏ chung 2 giây. Xác minh cả ghi đè và xe ưu tiên tôn trọng luồng chuyển này. Hai chế độ dùng cùng topology và phân bố nhu cầu theo seed.
- Chỉ thay mật độ khi kịch bản yêu cầu. Đếm xe chưa được nhận vào mạng, chờ lối ra, hoàn tất chuyến, phiên phục hồi kẹt, và thời gian kẹt theo nút. Phục hồi phải có sự kiện, nguyên nhân và ID xe. Khi xuất kết quả, phân biệt xe qua vạch hoặc đến đích với xe bị thu hồi/tái sinh.
- Công cụ chẩn đoán có tạm dừng/chạy tiếp, bước 0,1 giây, lọc theo xe/nút và xuất JSON. Mỗi mẫu nêu build ID, seed, kịch bản, thời điểm sim, nút, hướng, số xe chờ, sức chứa lối ra, pha và nguyên nhân dừng. Mã lý do chuẩn trong [hợp đồng](CONTRACT-PUBLIC-DEMO.md). Chế độ gỡ lỗi bật theo yêu cầu và nằm ngoài luồng chấm thi mặc định.

## SIM-A1 Đối chứng và minh bạch quyết định

Bảng quyết định hiển thị nhóm đang xanh, hàng chờ và sức chứa theo nhóm, điểm hai nhóm, giới hạn an toàn đang áp dụng và lý do giữ/chuyển. Nhãn **Đo đang chạy** lấy từ phiên hiện tại. Nhãn **Đối chứng theo seed** lấy từ kết quả cặp cố định/thích ứng có commit, seed, nhu cầu và cửa sổ đo. Dùng seed `31031–31035`, `300–1800 s` từ script A/B hiện có. Mục tiêu `SIM-A1`: trung bình của các mức giảm trễ theo cặp ≥ 15%, lưu lượng qua nút giảm ≤ 5% trên từng seed. Mẫu đối chứng thiếu một cặp, không có xe qua hoặc chứa số không hợp lệ là dữ liệu cần sửa. Công bố cả hàng chờ biên, số chuyến hoàn tất, số xe phục hồi và số đo toàn mạng để nhìn thấy việc dời ùn tắc giữa các nút. [Nghiên cứu áp lực có xét sức chứa](https://arxiv.org/abs/1309.6484)

## AI-01 Nhận diện ảnh

- YOLOX-Nano ONNX 416×416 từ bản `0.1.1rc0`, trọng số `yolox_nano.onnx` có SHA-256 `c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d` và kèm giấy phép. ONNX Runtime Web dùng WASM trong Web Worker. Đầu vào lấy từ khung màu chưa vẽ overlay, thay đổi kích cỡ có lưu tọa độ của vùng ảnh thật. Lọc nhãn xe, score và NMS. Trả khung theo tọa độ chuẩn hóa trong ảnh gốc và gắn `frame_id`. Chỉ vẽ hộp khi frame và camera khớp ảnh đang xem. Mất model, hết thời gian, lỗi worker hoặc ảnh hợp lệ với 0 phát hiện phải hiển thị đúng trạng thái. Kiểm ground truth được gắn nhãn độc lập, gồm có xe, trống, xe sát biên, ánh sáng khác và ảnh bị crop/letterbox. Khi trả ảnh mẫu, vẫn chạy inference thật nếu chọn **Thử nhận diện**. [YOLOX-Nano từ upstream](https://github.com/Megvii-BaseDetection/YOLOX/releases/expanded_assets/0.1.1rc0) · [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- UI chỉ nói bộ điều phối dùng dữ liệu mô phỏng. AI nhận diện hình ảnh chạy riêng. Lớp người dùng thấy thể hiện ảnh đầu vào, nhãn, confidence, hộp, thời gian xử lý, lúc chưa tải và lỗi. Khung bao hình học gỡ lỗi bật riêng, gắn nhãn rõ và giữ ngoài ảnh bằng chứng.
## PERF-01 Hiệu năng và tải tài nguyên

- Chỉ tải lời dẫn và tài nguyên cần cho trang hiện tại. Bắt đầu ở góc toàn khu với LOD phù hợp. Hạ DPR/bóng/LOD khi máy yếu, cho phép ghi đè Lite/tiêu chuẩn. Giới hạn một inference đang chạy và bỏ khung cũ khi mới tới. Chỉ chụp camera đang xem, hạ tần số ảnh khi tab ẩn hoặc GPU quá tải. Hủy timer, listener, worker và object URL khi đổi trang hoặc đóng chế độ xem. Tốc độ sim và luật đèn không thay theo profile đồ họa trong cùng kịch bản.
- Nghiệm thu Lite ở 1366×768 trên máy GPU tích hợp, RAM 8 GB, bằng browser dùng GPU thật. Đo median FPS ≥ 15 ở cửa sổ steady state 60 giây sau 20 giây làm nóng, kèm p95 frame time và tốc độ tick. Soak 30 phút gồm thay camera, ẩn/hiện tab và một lượt suy luận. Chụp tên phần cứng, browser, profile, phiên bản driver và commit. Kết quả headless giúp tái hiện và không thay kết quả máy thật.

## PUB-01 Đóng gói và phát hành

- Lọc cảnh khu Bắc từ đa giác và đoạn nối cần thiết, giữ các cầu biên có tuyến hợp lệ. Cùng quy trình sinh graph, bản đồ đường, bảng camera/đèn và chỉ mục dự báo. Kiểm không có cạnh, junction, camera hoặc tile tham chiếu ID đã lọc. Manifest theo commit ghi relative path, size, SHA-256 và nguồn tài nguyên. Đường dẫn worker dùng origin Vercel. Tài nguyên Pages dùng HTTPS ghim theo deployment giới thiệu trong [runbook public](../deploy-public.md).
- Gói Vercel dưới 90 MiB. Từng file Pages dưới 25 MiB, tối đa 20.000 file. Giữ giấy phép và ghi công nguồn cần thiết. Bundler dùng danh sách cho phép. Sinh thumbnail/thẻ giới thiệu từ dữ liệu mẫu. Loại runtime DB, thông tin đăng nhập cục bộ, dump, ảnh bằng chứng thật và thư mục kết quả các agent khỏi gói. Trên public, kiểm network từ browser giới hạn origin Vercel của bản đó và origin tài nguyên đã ghim.
## DATA-01 Giao dịch và dữ liệu trong trình duyệt

Lưu theo IndexedDB cùng origin. Giao dịch nghiệp vụ cập nhật hồ sơ và nhật ký cùng lúc trước khi phát sự kiện. BroadcastChannel báo dữ liệu đã đổi, chỉ gửi metadata cho ảnh. Một trạm sống mỗi phiên, có đồng hồ phát hiện khung cũ và kiểm lease. Mở hai tab 3D không nhân đôi sự kiện. Khóa trạm được nhả khi đóng/crash. Khi kho bị từ chối hoặc đầy, dữ liệu giữ theo dung lượng còn lại, UI báo chế độ bị giới hạn và có thao tác thử lại. Thao tác xóa/reset dữ liệu mẫu yêu cầu xác nhận. Xác nhận thủ công sau mất trạm sẽ tạo giao dịch mới theo quy tắc quyền hiện hành.

## DOCKER-01 Tương thích bản cục bộ

Bản cục bộ tiếp tục chạy với lệnh ở [runbook](../runbook.md) và máy lưu SQLite. Test 31A vẫn yêu cầu hash `c05ce91e` cho ca cổ điển hiện tại. Kiểm API payload, vai trò và schema SQLite theo hợp đồng v1. Smoke tắt và chạy lại container với volume test, xác minh trạng thái không mất. Dùng dữ liệu và volume tạo riêng cho lần kiểm.

## 6. Điều kiện đóng hạng mục

Mỗi hạng mục có dòng truy vết yêu cầu → test ID → suite chính hoặc chéo → kết quả đỏ có chủ đích → kết quả sạch đúng SHA → bằng chứng và người review. Phần hiện trạng đỏ do thiếu chức năng phải hiện nguyên nhân cụ thể. Lệnh chính là `node scripts/hardtest/run.mjs --profile ci` và `node scripts/hardtest/run.mjs --profile release`. Đọc cách phân tích bằng chứng, thứ tự agent và giới hạn hai lần sửa trong [quy tắc điều phối](RULES.md). Đọc cách chạy như người dùng thật trong [kịch bản nghiệm thu](../qa-public-demo.md). Đây là điều kiện đạt định lượng, không dùng trạng thái “đã triển khai” của subagent làm kết quả cuối.

| Profile | Test ID phải hiện đúng một lần trong báo cáo | Điều kiện |
|---|---|---|
| `ci` | `SIM-REGRESSION`, `WEB-TYPECHECK`, `WEB-TEST`, `WEB-BUILD`, `API-REGRESSION`, `AGENT-PREFLIGHT`, `GATE-META`, `GATE-CROSS` | Hồi quy hiện hành, kiểm runner và phép kiểm độc lập của kết quả. |
| `release` | Mọi ID của `ci`, cộng `GATE-RELEASE-INPUTS`, `PUB-01`, `DATA-01`, `SIM-01`, `SIM-A1`, `AI-01`, `CAM-01`, `USER-01`, `PERF-01`, `DOCKER-01` | Kiểm hành vi chạy thật theo từng mục ở trên. Thiếu suite hoặc bằng chứng thực thi của đúng commit tương ứng với `BLOCKED`. |

`SIM-A1` tính lại ngưỡng từ từng cặp số đo, kể cả nếu báo cáo nguồn đã có cờ đạt. Profile `release` cần browser flow và hiệu năng có bằng chứng độc lập theo tài liệu QA. Các mẫu fixture trong docs và các test xanh của profile `ci` chứng minh phần hiện trạng tương ứng.

### SIM-REGRESSION Hồi quy Node

Chạy `node --test "outputs/hcmc-poc/test/*.test.mjs"`, có test hash 31A và thực thi giao thông theo seed.

### WEB-TYPECHECK Kiểu dữ liệu web

Chạy `npm run typecheck` trong `outputs/smart-traffic/web` sau cài dependencies theo lockfile.

### WEB-TEST Hồi quy web

Chạy `npm test` trong `outputs/smart-traffic/web`, ghi số ca thực sự chạy.

### WEB-BUILD Build web

Chạy `npm run build` trong `outputs/smart-traffic/web`, kiểm hai entry tương ứng.

### API-REGRESSION Hồi quy FastAPI

Chạy pytest với môi trường Python 3.11 đã cài requirements, lấy DB và media tạm của test.

### AGENT-PREFLIGHT Kiểm công cụ nhận việc

Chạy test của `scripts/agent/preflight.mjs`. Kiểm brief đúng và sai, receipt hết hiệu lực khi tài liệu thay đổi, chế độ chỉ đọc, phạm vi diff, kết quả cần đúng HEAD và trường hợp thiếu xác nhận `READY`.

### GATE-META Kiểm chính runner

Agent độc lập kiểm exit code, báo cáo, tiêu chí đủ ID, từ chối thiếu log hoặc kết quả sai SHA. Ca lỗi có chủ đích phải làm runner fail và ghi nguyên nhân đúng. Test script và runner cần được kiểm trên cùng commit.

### GATE-CROSS Kiểm chéo

Agent độc lập viết bộ kiểm gần tương đương từ đặc tả, dùng dữ liệu và cách tính độc lập. Đối chiếu kết quả giữa hai bộ trên ứng viên sạch và ca đỏ có chủ đích. Với yêu cầu critical, ghi ca tối thiểu có khả năng bắt lỗi của từng bộ.

### GATE-RELEASE-INPUTS Đầu vào phát hành

Cổng xác minh `HARDTEST_RELEASE_MANIFEST` và `HARDTEST_RELEASE_EVIDENCE` cùng SHA và hash hợp đồng trước khi chạy profile `release`. Bằng chứng ghi thêm `releaseManifestDigest` của chính manifest ứng viên. Từng tệp bằng chứng phải tồn tại, có nội dung và đúng SHA-256. [Cách chuẩn bị tệp](../deploy-public.md#chạy-cổng-kiểm-phát-hành)

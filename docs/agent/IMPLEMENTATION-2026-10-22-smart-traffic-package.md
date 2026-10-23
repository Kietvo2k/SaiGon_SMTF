# Triển khai Smart Traffic và đóng gói — 22/10/2026

## Phạm vi và trạng thái Git

Nhánh `codex/smart-traffic-package`, nền `547679e`. Giữ các sửa đổi có sẵn về stream/camera trước khi làm; chưa tạo commit hoặc push. Báo cáo `6d9ccd3` của agent trước thuộc worktree khác, không được coi là commit nền của cây này. Các tệp `work/` không liên quan được giữ nguyên.

Kế hoạch: [các phần T1–T6](../superpowers/plans/2026-10-22-smart-traffic-package.md). Thiết kế được cập nhật sau khi người dùng chọn triển khai xe khẩn cấp ngay trong đợt.

## Đã thay đổi

- Citizen vào thẳng tra cứu biển số, không cần đăng nhập hoặc chọn loại xe. Chấp nhận viết liền/chữ thường, báo đầu vào sai; tài khoản/khiếu nại cũ tải riêng khi mở Hồ sơ cá nhân.
- Backend quyết định mức phạt của hồ sơ mới theo policy đang có trong dự án, bỏ qua tiền/nguồn/verified giả từ trạm. Trường hợp thiếu dữ kiện không nhận tiền đã xác minh; không tự sửa hồ sơ lịch sử hoặc tuyên bố rà soát lại luật.
- Cán bộ thấy nhãn giao lộ/hướng của 10 camera và căn cứ/điểm trừ. Ảnh lỗi lúc chưa có frame được thử lại khi làm mới. Cảnh báo công khai được gộp theo đường/horizon để tránh key React trùng.
- Smart Traffic giữ app/API/góc Bắc khi đổi Lite. Giấu bảng vật liệu, độ thực hóa và Flood Lab City Lab; đưa đồ họa vào nhóm thu gọn, đồng hồ trong vùng cuộn HUD.
- Xe khẩn cấp có cứu thương, xe chỉ huy cứu hỏa và cảnh sát. Dùng slot ô tô thật của sim và model riêng, giữ tuyến/IDM/khóa nút; ưu tiên cuốn chiếu tại nút sắp tới. Ưu tiên chọn xe đang chuyển động; khi Lite không có xe phù hợp, chỉ kích hoạt một slot trống đã kiểm an toàn trong pool và trả lại khi dừng. Các hướng xung đột dừng nhường, xe đã giữ khóa được thoát; ghi đè của cán bộ cao hơn tự động ở toàn cụm. Giữ vàng 3 giây/đỏ chung 2 giây, không kế thừa hành vi cố ý vượt đỏ/SPEED/PARK. Vi phạm của xe/xe đang nhường được gắn cờ xem xét đúng mã và thế hệ xe, không tự miễn phạt.
- Chuyến ưu tiên kết thúc khi dừng, reset, tái sinh, qua hai nút hoặc hết 240 giây sim. Có nút đến vị trí xe. Lệnh chỉ huy có audit/SQLite; trạng thái xe đi kèm telemetry JSON trong SQLite. REST nói đã gửi lệnh, HUD trạm phản ánh chạy/lỗi thiếu xe.
- Docker hai service, cùng origin tại `127.0.0.1:8088`; SQLite/khóa JWT/ảnh/log trong volume. Whitelist static; không công khai tài khoản, mã Python, DB hoặc thư mục nghiên cứu. Tài nguyên lớn tách layer khỏi JS để sửa UI không đóng lại toàn bộ nền 3D.
- Chỉ gỡ bốn validator legacy đã đọc runtime/dữ liệu không còn tồn tại. Không xóa nghiên cứu, dữ liệu gốc, DB hoặc mã City Lab còn được classic/test sử dụng. Danh sách và phục hồi: [maintenance](../maintenance.md).

## Kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| Backend đầy đủ sau hỗ trợ emergency | **167 passed** tại môi trường Python có sẵn trên máy (3.14), 5 cảnh báo deprecation; 307,70 giây. API Docker Python 3.11 được kiểm tích hợp bằng smoke/Browser |
| Web React | Typecheck và build qua; **13 tệp, 64 test pass** |
| Nhóm Node thay đổi | **114 test pass**: emergency/controller/kịch bản/URL/stream/Smart UI/đèn |
| Test lỗi trước khi sửa | Thiếu emergency; ưu tiên tự đổi pha ở giây 21; lệch mã xe/thế hệ; ghi đè khác nút cùng cụm; hành vi SPEED trên slot ưu tiên; reset context đều đã có RED rồi GREEN |
| Docker thật | Build, hai service healthy; smoke qua health, 13 static URL, 8 đường dẫn chặn, auth officer/station, WS có auth, ghi SQLite |
| Dữ liệu sau recreate | Metric QA, thời điểm tạo năm user seed và hash JWT secret giữ nguyên; citizen vẫn tra được hồ sơ xác nhận trước recreate |
| Browser công dân | Viết liền `51k88888` thành biển chuẩn, thấy một hồ sơ đã thông báo; không đăng nhập; viewport 390 pixel không tràn ngang |
| Browser cán bộ | Đăng nhập officer/chỉ huy, xác nhận hồ sơ, tên 10 camera, ảnh tải thực 1280×720; bản đồ nhiệt tải xong, console không có lỗi React mới |
| Browser 3D | Cứu thương `V-011664` chạy **479 m, qua 2 nút**, tự kết thúc và lưu kết quả telemetry trong SQLite. Góc nhìn đến xe hoạt động. Ở 390×844: nav kết thúc y=244, HUD bắt đầu y=256, không chồng hai bảng hoặc tràn ngang |

Ảnh: [công dân sau recreate](assets/2026-10-22/citizen-result.png), [Smart Traffic có kịch bản xe](assets/2026-10-22/smart-emergency.png), [bố cục 3D 390 pixel](assets/2026-10-22/smart-mobile.png). Log chi tiết cục bộ trong `work/browser-qa-2026-10-22/` (được ignore, không đi vào image): `backend-final-full.log`, `node-final.log`, các log Docker, snapshot persistence và DOM/ảnh Browser.

Đã dùng review độc lập để tìm và sửa lỗi Docker thiếu node_map/bản đồ đường, đường dẫn Python trong README và ba lỗi emergency về mã xe, khóa nút, ghi đè cụm. Theo yêu cầu tiết kiệm quota của người dùng, rà soát bổ sung chạy bằng OpenCode với `opencode-go/minimax-m3.1-flash-free`; dùng `--standalone` vì dịch vụ nền lỗi kích hoạt plugin. Kết quả OpenCode được đối chiếu lại với code/test, không tự áp dụng mọi nhận xét.

Các probe OpenCode chỉ ra thêm hai lỗi thật: nhả ưu tiên khởi động lại trọn pha xanh làm hướng kia chờ lâu hơn, và giảm mật độ có thể tắt xe đang làm nhiệm vụ. Đã có test RED/GREEN cho cả hai và sửa giữ tuổi pha/giữ slot ưu tiên. Browser tìm thêm lỗi cache entry 3D, đã thêm header revalidate và test smoke (RED trước sửa, GREEN sau rebuild).

Chi tiết sử dụng model miễn phí, kết quả probe và phần nhận xét đã hiệu chỉnh: [review OpenCode](OPENCODE-REVIEW-2026-10-22.md). Browser phát hiện thêm lỗi thông báo không có xe bị HUD ghi đè; trạng thái lỗi/kết quả chuyến hiện được giữ lại, không biến lỗi thành “chưa chạy”.

## Đọc và chạy lại

1. [README](../../README.md): lệnh nhanh và ba địa chỉ web.
2. [Kiến trúc](../architecture.md): entry/module, luồng REST/WS và SQLite.
3. [Runbook](../runbook.md): Docker/cục bộ, tài khoản seed, dừng, backup/restore, chẩn đoán.
4. [Maintenance](../maintenance.md): phần giữ/gỡ, phạm vi test và các hạn chế.

Windows chạy `start-smart.cmd`; Linux/Git Bash chạy `sh start-smart.sh`. Mở `http://127.0.0.1:8088/`, rồi mở **một** tab 3D để sinh số liệu/ảnh. Cán bộ `officer1`, chỉ huy `commander1`; mật khẩu seed mô phỏng xem README. Không xóa volume khi cần giữ dữ liệu.

Chạy cục bộ dùng Python 3.11 trong `.venv311` riêng. Đã kiểm cú pháp/preflight Windows và shell; chưa chạy đè luồng khởi động mới lên các cổng dev đang bận. Luồng Docker đã được khởi động và smoke thực tế.

## Còn mở

- Khảo sát vị trí/hướng/pha từng đầu đèn tại HX-01…HX-06. Mới phân biệt hai lớp đèn và kiểm logic pha; chưa có căn cứ xóa hàng loạt cột/đầu đèn.
- Xe chỉ huy cứu hỏa là ô tô, chưa có xe thang/xe tải dài, điều xe tới địa chỉ, âm thanh còi. Xe khẩn cấp có thể chờ hàng xe/khóa nút hoặc ghi đè cán bộ; không cho xuyên xe để tạo kết quả đẹp. Chưa nghiệm thu mọi seed/tình huống ùn tắc.
- Lưới nhiều camera, A1 đa seed, FPS GPU phần cứng, soak dài hạn, broadcast tuần tự và cách sinh mã vi phạm theo ngày còn trong backlog.
- SQLite lưu nghiệp vụ/metadata; ảnh/media lưu tệp trong cùng volume. Không chuyển sang BLOB trong đợt này.
- Kiểm tra vệ sinh repo còn báo bốn thư mục `__pycache__` sinh từ test. Lệnh xóa đã bị bộ kiểm tra tự động của công cụ chặn theo chính sách; giữ nguyên cache, ignore và loại khỏi Docker, không thử lách bằng công cụ xóa khác.

## Bổ sung đèn và công cụ trình diễn

- `traffic-signals-32.js`: chuyển đầu đèn từ tâm nút ra mép phải vạch dừng của các hướng vào; bóng đỏ trên, xanh dưới; một đầu đèn cho các nhánh gần song song trong cùng cụm. Đèn/vạch nội bộ cùng cụm sẽ được bỏ nếu có cạnh nối trực tiếp trong dữ liệu. Dữ liệu hiện hành không có cạnh trực tiếp HX-01 ↔ HX-05; không ghi nhận là đã xóa một cạnh như vậy.
- Bỏ bảng billboard luôn phóng 40 px và số 0 không có thời điểm xanh. Giữ kích thước thực, chỉ hiện đếm xanh/vàng khi đủ gần; vùng FOV chỉ bật bằng checkbox.
- Ba tab: Vận hành; Đèn & dự báo; Thử nghiệm. Gom sáu mã dữ liệu thành năm giao lộ logic, nhánh gần song song được nhóm lại, mỗi cụm còn 3–6 hướng của mạng đang chạy. Không đổi mã camera/API, không xóa đồ thị OSM gốc.
- Dự kiến pha và giây xanh 60 giây tới bằng bản sao controller với hàng chờ giữ nguyên; không tác động controller/xe thật. Có nhóm A/B, trạng thái hiện tại, xe chờ, tên đường, dải màu và nút đến giao lộ.
- Khung bao xe bật/tắt, bám pose nội suy, một InstancedMesh, tối đa 400 xe trong góc nhìn; loại khỏi camera bằng chứng.
- Thử nghiệm thêm 1/10/50 ô tô/xe máy từ slot an toàn, tổng tối đa 200, có báo thêm một phần/hết chỗ và nút dọn riêng. Dọn không xóa SQLite hoặc xe nền; xe khẩn cấp đang chạy được giữ lại.
- OpenCode `opencode-go/minimax-m3.1-flash-free` soạn hai module DOM mới; agent chính đọc lại, sửa tích hợp ba tab và nối logic. Browser phát hiện tab thứ ba thiếu phần tử panel dù nút đã hiện; đã sửa vòng lặp gắn đủ các panel.
- Cache Browser đã giữ riêng tệp đèn cũ dù entry mới; các URL module sửa được tăng lên `v=32b`, giữ header revalidate để những lần cập nhật sau không trộn bản.

Theo yêu cầu mới, không phát triển tiếp xe khẩn cấp trong phần này. Gom giao lộ/đầu đèn không đồng nghĩa với việc đã co toàn bộ đồ thị đường, đo xong thông lượng hoặc chứng minh hết kẹt xe. Các kiểm tra Node liên quan đã qua 127 test, gồm dự báo fixed 34/16 giây xanh trong 60 giây, không đổi state hash sống, phản ứng với hàng chờ lệch và scale khung bao đúng pose. Bằng chứng Browser bản cuối được ghi ở phần tiếp theo sau khi kiểm tra.

## Chỉnh đèn theo giao lộ logic và bảng dự báo — 22/10/2026

- Thêm `junction-layout-32.js`: gom 6 mã nút Hàng Xanh thành **5 giao lộ logic** (HX-C1…HX-C5), phân loại ngã ba/ngã tư theo số nhánh thực. Nhánh hẻm/dịch vụ bị bỏ khi giao lộ đã có ≥3 nhánh chính; nhánh song song cùng chiều được gộp. HX-01 + HX-05 thành “Ngã tư Hàng Xanh”; HX-04 không còn cắm đèn riêng cho Hẻm 328.
- `traffic-signals-32.js` dựng **một đầu đèn cho mỗi nhánh**, đặt tại vạch dừng bên phải làn vào ngoài cùng, mặt quay về xe tới. Bỏ bảng đếm lơ lửng; bảng đếm gắn liền hộp đèn, chỉ hiện khi đủ gần. Thêm viền lưng và mũ che bóng. Cột camera + nón FOV mặc định ẩn, bật cùng checkbox “Vùng quan sát camera”. Tổng còn 12 đầu đèn thay vì rải theo 6 mã nút.
- Bảng “Đèn & dự báo” đổi từ dropdown một giao lộ sang **thẻ tổng quan 5 giao lộ**: đèn A/B hiện tại, thời gian còn lại hoặc thời điểm xanh kế tiếp, hàng chờ và thanh phân bổ. Chọn thẻ để xem dải pha 60 giây, phân bổ giây xanh A/B và tên các hướng vào. Dự báo chạy bước 0,5 giây (1/5 phép tính cũ), không tác động controller/xe thật.
- Tab “Thử & spawn” đặt phần thêm 1/10/50 NPC lên trước Kịch bản; giữ nguyên giới hạn 200 xe thử và nút dọn không xóa vi phạm. Kịch bản xe khẩn cấp vẫn nằm trong cùng tab nhưng ghi rõ đang ở mức thử, chưa mở rộng.
- Sửa lỗi khung bao xe: camera bằng chứng chạy `drawFor()` sau camera chính từng xóa `count`/`visible` của một InstancedMesh dùng chung, nên bật “Khung bao xe” không thấy gì. Nay chỉ camera chính cập nhật khung bao.
- Kiểm chứng: Node 17 test nhóm đèn/dự báo/giao lộ + 5 test signal-plan + 34 test controller đều pass; Browser thật xác nhận 3 tab, 5 thẻ, 12 đầu đèn (mỗi đầu đúng 1 bóng sáng), bật khung bao thấy hơn 200 khung trong góc nhìn, thêm/dọn 10 NPC và nút “Đến giao lộ” hoạt động. Kiểm tra 3D chạy ở `mode=lite&backend=webgl` để hạn chế tài nguyên. Đã rebuild **chỉ web image**, recreate container; backend giữ nguyên và healthy, các URL `?v=32c` trả 200.
- Còn mở: offset cụm trong `SIGNAL_PLAN_32` vẫn chỉ dùng cho `cycleIdOf`, chưa dịch pha khởi động; muốn green wave thật cần đổi máy trạng thái và cập nhật bộ test liên quan. Xe khẩn cấp vẫn chưa mở rộng.

## Tự động xử lý vi phạm và khiếu nại 1% — 22/10/2026

- Thêm `SMART_AUTO_VIOLATIONS` (Compose và `run-smart` bật `1`, mặc định code tắt để giữ bộ test duyệt tay). Khi bật, route `POST /station/violations` tự chuyển `new`/`needs_review → confirmed → notified`; chỉ tạo `notifications` khi biển đã gắn tài khoản công dân. Khi khởi động, backend backfill mọi vi phạm cũ còn chờ duyệt.
- `SMART_AUTO_COMPLAINT_PCT` mặc định `1`: hash tất định của `(mã vi phạm, vehicle_id, cycle_id, mã lỗi)` chọn khoảng 1% để tạo khiếu nại `auto_1pct`, chuyển vi phạm sang `disputed` và mở complaint. Khiếu nại của biển có chủ gắn `user_id` chủ xe; biển không có chủ dùng `user_id` NULL và chỉ hiện ở cổng cán bộ.
- Cổng cán bộ: bộ lọc mặc định chuyển sang “Tất cả” để thấy vi phạm đã tự xử lý; thêm nhãn “Tự động” trên dòng có `review.by=system`; banner giải thích tỷ lệ 1%. Nhãn loại khiếu nại mới: “Hệ thống tự động ghi nhận (1%)”.
- Kiểm chứng: 4 test mới `test_auto_violations.py` pass (xác nhận/báo về, khiếu nại ép 100%, tỷ lệ hash 1%, backfill); 53 test hiện có của station/officer/lifecycle/citizen/review/admin pass; web typecheck + 64 vitest pass. Đã rebuild backend + web, recreate container; backfill thực tế trên volume: **0 vi phạm chờ duyệt**, 1294 `notified`, 13 `disputed`, 13 khiếu nại `auto_1pct` mở. Một vi phạm mới gửi thử qua API trả ngay `status=notified`.

# Nghiệm thu Public Demo và kịch bản chấm thi

Mọi phép kiểm gắn với một commit và build ID. Ghi riêng `Đạt`, `Không đạt`, `Bị chặn`, cùng bước tái hiện. Mẫu trong hợp đồng giúp phát triển độc lập. QA trên ứng viên dùng runtime đã build, hồ sơ trình duyệt sạch và tài nguyên đúng manifest.

## Kịch bản giám khảo có thể tự chạy

1. Mở landing trong hồ sơ trình duyệt mới. Xem ba lối vào và ghi chú về dữ liệu mẫu. Dùng bàn phím thử focus và mở từng link. Trở về landing bằng điều hướng trên trang.
2. Mở 3D, giữ góc toàn khu. Chọn Hàng Xanh, chạy kịch bản cao điểm với seed `31031`. Quan sát hàng chờ, pha, điểm quyết định và các lối ra. Bật đối chứng cố định/thích ứng, đọc rõ phần đo sống và phần kết quả theo seed. Đổi sang kịch bản chặn làn, quan sát một xe đổi tuyến hợp lệ, tìm đích và xem log tại nút. Thử tạm dừng, chạy một bước và trở về toàn khu.
3. Mở camera gặp tại Hàng Xanh và bật **Thử nhận diện**. So người dùng nhìn thấy đúng ảnh gốc, nhãn xe, confidence, hộp và thời gian suy luận. Thay camera trong lúc model chạy rồi xem frame tương ứng. Mở fullscreen, xoay/resize viewport và quay về góc chuẩn. Thử ca ảnh trống, ảnh cũ, quyền media và lỗi model bằng môi trường kiểm.
4. Mở Trung tâm điều hành cùng hồ sơ trình duyệt. Đăng nhập bằng nút điền **Chỉ huy mẫu**. Chọn camera, mở toàn màn hình, đặt pha hoặc kịch bản và chờ xác nhận từ 3D. Kiểm trạng thái `pending` trước `applied`. Sau đó đóng tab trạm hoặc làm hết hạn lệnh, xác minh thông báo đúng. Mở hai tab 3D và quan sát chỉ một trạm ghi sự kiện.
5. Đăng nhập cán bộ mẫu, mở hồ sơ và xác nhận bản ghi phù hợp. Sang Tra cứu từ landing, thử biển chuẩn, viết liền, biển sai và không có kết quả. Mở hồ sơ bằng tài khoản công dân mẫu, gắn biển bằng mã mẫu, khiếu nại, xử lý lại từ cán bộ, rồi xem thông báo bên công dân. Kiểm mẫu thanh toán đổi trạng thái, không cần cung cấp phương thức thanh toán. Thử các chức năng quản trị bằng tài khoản mẫu riêng. API và giao diện đều từ chối hành động khi dùng sai quyền.
6. Tải lại các trang, kiểm trạng thái hồ sơ và log vẫn đúng. Mở hồ sơ trình duyệt khác và xác nhận dữ liệu mẫu xuất phát lại từ gốc. Thử mất storage trên profile kiểm riêng, tải chậm và khi thiếu GPU. Khi tìm được lỗi, ghi bước nhỏ nhất và đối chiếu tên ca trong đặc tả.

## Checklist bằng chứng theo test ID

| ID | Thao tác hoặc phép đo | Bằng chứng cần giữ |
|---|---|---|
| `PUB-01` | HTTPS, ba route, tài nguyên đúng origin và SHA, whitelist, giới hạn gói, AI tải theo yêu cầu. | Manifest hai gói, ảnh/trace network đã lọc credential. |
| `DATA-01` | Giao dịch/role, nhiều tab, profile tách nhau, lệch version, reload, lỗi kho, hết hạn/ack. | Kết quả endpoint/adapter và ảnh tương ứng. |
| `SIM-01` | Mười cụm, hình học làn, đến đích, đổi tuyến, không qua cạnh cấm, pha an toàn và đếm phục hồi riêng. | Seed, mô tả lỗi, tọa độ/ID, ảnh và log. |
| `SIM-A1` | So sánh theo cặp năm seed và ngưỡng của đặc tả. | JSON thô của benchmark, cửa sổ đo, commit, bảng kết quả theo seed. |
| `AI-01` | Khung tích cực và trống, ảnh đã gán nhãn, crop, frame ID, model lỗi. | Kết quả suy luận thực, ground truth độc lập, hash model và thời gian xử lý. |
| `CAM-01` | Overview, từng cụm mới, 3 góc điều khiển, fullscreen, đổi camera và Lite. | Ảnh overview, nút, frame, kích cỡ và nguồn. |
| `USER-01` | Kịch bản trên các trang, nhập/duyệt/tra cứu/khiếu nại, lệnh, vai trò, profile độc lập. | Trace browser và nhật ký kết quả từng bước. |
| `PERF-01` | WebGPU/WebGL2, Lite 1366×768 trên máy thật và soak 30 phút. | Thông số máy, profile, biểu đồ frame time và tốc độ tick. |
| `DOCKER-01` | Compose, health, các trang local, restart giữ dữ liệu. | Lệnh và output, SHA, volume test. |

Test UI chạy ở 390, 768 và 1440 px. Kiểm bằng trình duyệt có GPU thật cho camera và hiệu năng. Giữ thêm trace ngắn ở Chromium và ít nhất một browser với WebGL2 fallback. Khi WebGL2 vắng, xác minh trang ghi lý do và hai web mở độc lập. Ghi phiên bản browser, GPU và locale. Che token, tài khoản thực, mã đăng ký ngoài fixture và dữ liệu cá nhân trước khi chia sẻ.

## Cho kiểm độc lập và phát hiện test yếu

Suite chính chạy đúng hành vi. Agent meta dùng ca cố ý hỏng để chứng minh runner dừng khi thiếu check, skip, test fail, report không khớp SHA hoặc evidence giả. Với đặc tính sản phẩm, tạo biến thể hỏng cục bộ trong worktree kiểm thử cho từng invariant trọng yếu, ví dụ trả ack trước trạm, đếm xe đã thu hồi như tới đích, bỏ kiểm `frame_id`, hoặc bỏ cô lập profile. Chạy candidate tốt, candidate hỏng, rồi khôi phục candidate tốt và kiểm hash. Kiểm xanh chỉ được ghi sau khi có ca hỏng đỏ ở đúng lý do dự kiến. Agent chéo dùng oracle độc lập và dữ liệu bổ sung, kiểm cùng tiêu chí bằng đường thực thi khác. Không sửa nhánh tích hợp để tạo ca hỏng.

Reviewer đọc diff code/test, đối chiếu từng test ID với đặc tả. Kiểm assertion quan sát được hành vi, ca lỗi thực sự chạy, dữ liệu không lấy từ cùng helper với sản phẩm, timeout/skip không bị coi là đạt, và ca Chrome thực tế không chỉ đọc DOM fixture. Reviewer giữ lỗ hổng dưới dạng repro, không trực tiếp sửa suite. Agent browser-qa thực hiện các thao tác trên preview như người dùng, ghi bằng chứng riêng dù suite tự động đã xanh. [Quy tắc điều phối](agent/RULES.md)

## Ghi và đối chiếu bằng chứng phát hành

Đặt hồ sơ dưới `work/smtf-agent/release/` của worktree tích hợp. `evidence.json` gồm `schemaVersion: 1`, `commit`, `contractDigest` (SHA-256 của hợp đồng), `releaseManifestDigest` (SHA-256 của manifest ứng viên) và `checks`. Ba mục `checks` theo thứ tự bất kỳ với ID `CAM-01`, `USER-01`, `PERF-01`, mỗi mục có `artifacts: [{path, sha256}, ...]`. `path` là file con trong thư mục chứa hồ sơ, `sha256` là hash chữ thường. Ví dụ đường dẫn `camera/overview.png`, `browser/user-flow.zip` và `perf/summary.json`. Mỗi artifact có dữ liệu thật, kèm phép đo/URL/PASS hoặc lỗi ở bản ghi QA. Ghi nhật ký kiểm trong cùng thêm một file Markdown, dẫn tới ảnh, trace và JSON số đo.

Cổng tự động gọi `scripts/hardtest/release/<ID>.test.mjs` cho từng ID release, trừ `SIM-A1` có benchmark riêng. Tên ít nhất một ca chạy trong mỗi suite bắt đầu bằng mã yêu cầu, tiếp theo là dấu cách. Mỗi suite kiểm nội dung thực tế ở biên sản phẩm, kể cả nơi có evidence thủ công. Hash chứng minh tệp còn nguyên và đúng phiên bản, phần review xác minh nội dung. Thiếu suite, artifact hoặc evidence sẽ cho `BLOCKED`. `BLOCKED`, `FAIL` và sai commit dừng phát hành. [Runbook](deploy-public.md)

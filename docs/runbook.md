# Vận hành Smart Traffic

## Chạy bằng Docker

Cần Docker Engine đang hoạt động và Docker Compose v2. Từ thư mục gốc kho mã:

```powershell
docker compose build backend
docker compose build web
docker compose up -d --wait
```

Windows có thể chạy `start-smart.cmd`; Git Bash/Linux dùng `sh start-smart.sh`. Build tuần tự giúp máy ít RAM. Lần đầu cần mạng tải base image và package. Container không cần GPU: cảnh 3D chạy trên GPU của trình duyệt máy người dùng.

Base image được cố định bằng digest; Python runtime khóa trong `docker/requirements.lock`, web dùng `package-lock.json`. Khi cập nhật dependency/base image, đổi khóa có chủ đích rồi chạy lại build và smoke test.

| Màn hình | Địa chỉ |
| --- | --- |
| Trang chọn | http://127.0.0.1:8088/ |
| Mô phỏng 3D Smart Traffic | http://127.0.0.1:8088/hcmc-poc/ |
| Cán bộ | http://127.0.0.1:8088/index-officer.html |
| Công dân | http://127.0.0.1:8088/index-citizen.html |
| Kiểm tra API | http://127.0.0.1:8088/api/v1/health |

Tài khoản mẫu cán bộ: `officer1` / `SaiGon@2026`; chỉ dùng cho bản mô phỏng cục bộ. Trang công dân tra cứu trực tiếp. Mở trang 3D để trạm mô phỏng tạo telemetry và khung camera. Tài khoản trạm tự đăng nhập chỉ khi API là loopback (`localhost`, `127.0.0.1`, `::1`). Không mở tab 3D ở nhiều cửa sổ cùng lúc nếu không muốn có nhiều trạm mô phỏng cạnh tranh.

**Tự động xử lý vi phạm (demo):** `SMART_AUTO_VIOLATIONS=1` (Compose và run-smart bật sẵn) khiến trạm tạo vi phạm là tự `confirmed → notified`, không cần cán bộ bấm; khi khởi động backend sẽ backfill các vi phạm cũ còn `new`/`needs_review`. `SMART_AUTO_COMPLAINT_PCT=1` là tỷ lệ tự sinh khiếu nại mở (`auto_1pct`); đặt `0` để tắt khiếu nại tự động. Vi phạm không có tài khoản chủ xe vẫn chuyển `notified` nhưng không tạo thông báo; khiếu nại tự động của biển không có chủ có `user_id` NULL và chỉ hiện ở cổng cán bộ.

Chỉ nginx được publish tại `127.0.0.1:8088`; backend nằm trong mạng Compose. Web dùng cùng origin `/api/v1`, WebSocket `/ws/v1`, static `/hcmc-poc` và `/shared`. Proxy chỉ công khai `cameras.json`, `plates.json` và `node_map.json` tại đường dẫn seed cũ; tài khoản, mã Python và dữ liệu runtime không nằm trong web image. Bản đồ tên đường `north-roads-32.json` được đưa vào cả web và backend.

Dừng và giữ dữ liệu:

```powershell
docker compose down
```

Hoặc `stop-smart.cmd` / `sh stop-smart.sh`. Lệnh này giữ named volume. Không thêm `--volumes`/`-v`, không dùng `docker volume prune` khi cần giữ dữ liệu.

## Dữ liệu và sao lưu

Volume `saigon-smart-traffic_backend-var` được gắn vào `/app/var`: SQLite, JWT secret, frames và logs. Entrypoint chạy migrations và seed bằng thao tác idempotent; restart không tạo lại mật khẩu hoặc xóa bản ghi. Volume Docker tách biệt `outputs/smart-traffic/var` của chế độ chạy cục bộ.

Sao lưu nhất quán cả DB và media bằng cách dừng backend ngắn hạn rồi chép toàn bộ thư mục. Chạy ở thư mục gốc; thư mục đích mới do người vận hành đặt tên:

```powershell
docker compose stop backend
docker compose cp backend:/app/var ./smart-backup-2026-10-22
docker compose start backend
```

Giữ JWT secret trong bản sao lưu để giữ hợp đồng token; bảo vệ thư mục sao lưu như dữ liệu tài khoản. Khôi phục vào volume mới sau khi đã giữ riêng bản dữ liệu hiện tại. Tạo container backend rồi dừng, chép nội dung bản sao vào `/app/var`, khởi động lại. Không chép DB đang được ghi, không ghi đè dữ liệu khi chưa có bản sao phục hồi.

```powershell
docker compose create backend
docker compose cp ./smart-backup-2026-10-22/. backend:/app/var/
docker compose up -d --wait
```

Các lệnh khôi phục giả định volume đích đã được chuẩn bị riêng, container dừng và đường dẫn bản sao đúng. Muốn kiểm tra phục hồi mà giữ nguyên volume hiện tại, sao chép kho mã thành thư mục thử và đổi `name:` của Compose trước khi tạo container.

## Chạy cục bộ để phát triển

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File outputs/smart-traffic/run-smart.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File outputs/smart-traffic/run-smart.ps1 -Stop
```

Git Bash trên Windows:

```sh
bash outputs/smart-traffic/run-smart.sh
bash outputs/smart-traffic/run-smart.sh --stop
```

Chế độ này cần Python 3.11 và Node.js 20.19+ hoặc 22.12+ (khuyến nghị Node 22 LTS)/npm trên máy; dùng cổng 8821 (static), 8900 (API), 5173 (web). Script ưu tiên `py -3.11` trên Windows, tạo `.venv311` riêng và dừng sớm với hướng dẫn dùng Docker nếu thiếu runtime; không dùng Python 3.14 mặc định hay ghi đè `.venv` cũ. URL API dev mặc định vẫn là `http://127.0.0.1:8900/api/v1`; Docker đặt `VITE_API_BASE=/api/v1` ở bước build. Không dùng bản `dist` Docker để preview dev nếu chưa cấu hình reverse proxy.

## Chẩn đoán

```powershell
docker compose ps
docker compose logs --tail 100 backend web
docker compose exec web nginx -t
docker compose exec backend python -m pip check
```

- Cổng 8088 bận: dừng ứng dụng đang dùng cổng hoặc bản Compose cũ; không đổi sang bind `0.0.0.0` để xử lý lỗi.
- Backend unhealthy: xem lỗi migrations/seed/quyền ghi volume. Health API thực hiện truy vấn bảng `users`, do đó không chỉ chứng minh tiến trình còn chạy.
- Có hình 3D nhưng camera chưa có khung: để tab mô phỏng đang hoạt động, kiểm tra console trình duyệt và kết nối `/ws/v1`; trạm gửi luân phiên 10 camera với tổng tốc độ giới hạn 2 khung/giây, vì vậy mỗi camera cập nhật chậm hơn tổng luồng.
- Đổi mã nguồn: build lại image rồi `docker compose up -d --wait`. Đổi `VITE_*` cần build lại web.
- Runtime 3D dùng URL ổn định nên nginx đặt `Cache-Control: no-cache` cho JS/CSS/HTML; Browser phải revalidate khi mở lại sau rebuild. Nếu tab đã giữ bản cũ trước lần áp dụng quy tắc này, hard reload một lần. Không coi HTTP 200 của file trên server là bằng chứng tab đang chạy đúng nội dung file đó.
- Máy yếu: chọn Lite; chỉ mở một tab 3D, tránh build đồng thời nhiều service.

## Nguồn cấu hình

Đã đối chiếu ngày 22/10/2026: [Compose chờ healthcheck](https://docs.docker.com/compose/how-tos/startup-order/), [vòng đời named volume](https://docs.docker.com/engine/storage/volumes/), [nginx WebSocket proxy](https://nginx.org/en/docs/http/websocket.html). `depends_on: service_healthy` chờ backend sẵn sàng; header Upgrade/Connection được chuyển tiếp rõ ràng để mở WebSocket.

Toolchain: [Vite 7 migration và Node tối thiểu](https://v7.vite.dev/guide/migration.html), [Vitest 4 migration](https://v4.vitest.dev/guide/migration.html), [advisory Vitest được vá ở 4.1.12](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8). Bộ khóa hiện tại Vite 7.3.7, Vitest 4.1.12 và plugin React 5.2.0 đã được kiểm tra bằng `npm audit`, `typecheck`, Vitest trên máy phát triển và build trong Node 22 Docker.

## Xem đèn, phân bổ pha và thử NPC

1. Mở một tab 3D qua Docker ở cổng 8088, chờ lớp nạp GPU biến mất.
2. Chọn **Đèn & dự báo**. Chọn giao lộ rồi bấm **Đến giao lộ**; xem trạng thái hai nhóm, tên nhánh, xe chờ, số giây xanh và dải pha 60 giây tới.
3. Dự báo chạy trên bản sao controller với lượng xe giữ nguyên; khi xe đến/đi hoặc có lệnh mới thì kết quả thay đổi. Đây không phải lịch đèn được cam kết.
4. Bật **Khung bao xe** để xem hộp 3D bám xe; giới hạn 400 xe trong góc nhìn để kiểm soát tải. Tắt khi không cần.
5. Sang **Thử nghiệm**, chọn 1/10/50 rồi **Thêm NPC**. Mỗi lượt chỉ nhận số slot còn trống an toàn, tổng tối đa 200. Nếu không thêm được, giảm mật độ trong **Vận hành**, rồi thử lại.
6. **Dọn NPC thử** chỉ dọn các slot vừa thêm, không xóa vi phạm SQLite hoặc xe nền. Nếu một slot đang làm xe khẩn cấp thì nó được giữ lại đến khi dừng nhiệm vụ và bấm dọn lần nữa.

Sáu mã HX được trình bày thành năm giao lộ logic, mỗi giao lộ 3–6 hướng theo nhánh đang có làn hoạt động. Không xóa dữ liệu OSM gốc hoặc hứa rằng toàn bộ các nút nội bộ của mạng đường đã được co lại. Việc tái cấu trúc toàn bộ đồ thị và đo ùn tắc dài hạn vẫn cần nghiệm thu riêng. Xe khẩn cấp giữ tính năng đã có; theo chỉ đạo mới, đợt này ưu tiên đèn, dự báo và khung bao.

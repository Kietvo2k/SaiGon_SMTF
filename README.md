# SaiGon SMTF · Smart Traffic khu Bắc

Mô phỏng giao thông khu Bắc TP.HCM: cảnh 3D, đèn tín hiệu, camera, phát hiện vi phạm, web cán bộ và tra cứu cho người dân. Dữ liệu xe/biển số/perception là dữ liệu mô phỏng; nền thành phố được tận dụng từ City Lab TP.HCM.

## Khởi động nhanh bằng Docker

Cần Docker đang chạy và Docker Compose v2. Tại thư mục gốc:

```sh
docker compose build backend
docker compose build web
docker compose up -d --wait
```

Hoặc Windows chạy `start-smart.cmd`; Linux/macOS/Git Bash chạy `sh start-smart.sh`.

| Màn hình | Địa chỉ |
|---|---|
| Trang chọn | [127.0.0.1:8088](http://127.0.0.1:8088/) |
| Mô phỏng 3D | [Mở Smart Traffic](http://127.0.0.1:8088/hcmc-poc/) |
| Cán bộ | [Trung tâm điều hành](http://127.0.0.1:8088/index-officer.html) |
| Người dân | [Tra cứu biển số](http://127.0.0.1:8088/index-citizen.html) |

**Mở một tab 3D để trạm sinh dữ liệu và ảnh camera.** Docker chạy API và phục vụ web; cảnh 3D dùng GPU của trình duyệt máy người dùng. Cổng công dân tra cứu không cần tài khoản. Cán bộ dùng tài khoản seed `officer1`, mật khẩu `SaiGon@2026`, chỉ dành cho bản mô phỏng cục bộ.

**Chế độ tự động (demo):** vi phạm mới được xác nhận và báo về ngay, không cần bấm duyệt; khoảng **1%** tự sinh khiếu nại mở để thử quy trình xử lý. Tắt bằng `SMART_AUTO_VIOLATIONS=0`, đổi tỷ lệ bằng `SMART_AUTO_COMPLAINT_PCT` (mặc định `1`).

Dừng bằng `docker compose down`, `stop-smart.cmd` hoặc `sh stop-smart.sh`. SQLite, khóa phiên và ảnh được giữ trong volume; không thêm `-v` nếu cần giữ dữ liệu.

## Chạy cục bộ để phát triển

Cần Node 22.12+ và Python 3.11; scripts tạo và dùng môi trường `outputs/smart-traffic/backend/.venv311`, giữ nguyên các môi trường Python khác.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File outputs/smart-traffic/run-smart.ps1
```

```sh
bash outputs/smart-traffic/run-smart.sh
```

Bản chạy cục bộ dùng cổng 8821 cho 3D, 8900 cho API, 5173 cho hai web. Cách dừng, điều kiện môi trường và chẩn đoán lỗi: [hướng dẫn vận hành](docs/runbook.md).

## Đọc mã và bảo trì

1. [Bản đồ kiến trúc và luồng dữ liệu](docs/architecture.md): bắt đầu ở đâu, module nào làm gì, dữ liệu đi qua đâu.
2. [Vận hành, dữ liệu và sao lưu](docs/runbook.md): Docker/cục bộ, khởi động/dừng, health, backup/restore, lỗi thường gặp.
3. [Phạm vi giữ/gỡ và quy tắc bảo trì](docs/maintenance.md): mã đang chạy, phần lịch sử, tệp đã gỡ và cách phục hồi.
4. [Kế hoạch sửa và đóng gói](docs/superpowers/plans/2026-10-22-smart-traffic-package.md), [bàn giao hiện tại](docs/agent/HANDOFF.md).
5. [Báo cáo kiểm thử Browser trước khi sửa](docs/agent/QA-BROWSER-2026-10-22.md), [yêu cầu UX/nghiệp vụ](docs/agent/BACKLOG-2026-10-22-ux-nghiep-vu.md).
6. [Kết quả triển khai và kiểm thử sau sửa](docs/agent/IMPLEMENTATION-2026-10-22-smart-traffic-package.md).

## Kiểm tra khi thay đổi

```sh
cd outputs/smart-traffic/web
npm ci
npm run typecheck
npm test
npm run build
```

Backend Windows, tại gốc repo:

```powershell
py -3.11 -m venv outputs/smart-traffic/backend/.venv311
outputs/smart-traffic/backend/.venv311/Scripts/python.exe -m pip install -r outputs/smart-traffic/backend/requirements.txt
outputs/smart-traffic/backend/.venv311/Scripts/python.exe -m pytest outputs/smart-traffic/backend/tests -q -p no:cacheprovider
```

Nếu đã chạy script cục bộ thì bỏ bước tạo môi trường. Script chạy app chỉ cài dependency runtime; bước cài `requirements.txt` bổ sung pytest/httpx cho kiểm thử. Linux/macOS dùng `python3.11 -m venv` và `.venv311/bin/python` tương ứng.

Các test Node và kiểm thử Browser theo phần thay đổi được liệt kê trong [bảo trì](docs/maintenance.md). Thay đổi UI phải được kiểm trên Browser thật; số test pass không thay cho việc xem cảnh vẽ và thao tác.

## Giới hạn còn mở

Kịch bản xe khẩn cấp có cứu thương, xe chỉ huy cứu hỏa và cảnh sát: xe thật trong pool, ưu tiên tại nút sắp tới, các hướng xung đột dừng nhường; vẫn giữ khoảng cách và vàng/đỏ chung. Chọn loại xe ở 3D hoặc tài khoản chỉ huy `commander1` (cùng mật khẩu seed). Dừng tự động sau hai nút hoặc 240 giây sim. Khi không có slot phù hợp, HUD báo lỗi để thử lại; xe có thể chờ hàng xe hoặc ghi đè của cán bộ. Chưa có điều xe tới địa chỉ/xe thang cứu hỏa lớn/còi âm thanh.

Đèn thích ứng chưa đạt tiêu chí A1 trên mọi seed. FPS GPU thật, tải dài hạn và bố trí từng đầu đèn phải được nghiệm thu riêng; không dùng FPS headless làm kết luận.

Đọc [backlog](docs/agent/BACKLOG-2026-10-22-ux-nghiep-vu.md) để phân biệt lỗi đã kiểm chứng, yêu cầu mới và phần chưa khảo sát. Mô hình công trình là gần đúng, không dùng làm dữ liệu đo đạc hoặc điều hướng kỹ thuật.

## Dữ liệu và giấy phép

Nguồn gồm OpenStreetMap, Overture, EOX/Copernicus, Google Open Buildings, Three.js, Earcut, Poly Haven. Giữ giấy phép và thông tin nguồn khi đóng gói; xem [GIT-DATA-PACKAGING.md](GIT-DATA-PACKAGING.md). Tài liệu/nghiên cứu City Lab cũ được giữ để truy nguyên, không phải hướng dẫn khởi động Smart Traffic hiện tại.

Cập nhật đèn: Smart HUD có **Vận hành / Đèn & dự báo / Thử nghiệm**. Tab đèn cho xem từng giao lộ, trạng thái, hàng chờ, phân bổ xanh/dải pha dự kiến 60 giây và bật khung bao xe. Tab thử nghiệm thêm 1/10/50 NPC hoặc dọn riêng. Hướng dẫn chi tiết ở [runbook](docs/runbook.md#xem-đèn-phân-bổ-pha-và-thử-npc).

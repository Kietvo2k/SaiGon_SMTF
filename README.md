# Saigon Open City Lab · Smart Traffic khu Bắc

Repo gồm hai hệ chạy trên cùng một nền 3D:

1. **City Lab TP.HCM** (`outputs/hcmc-poc/`): thành phố 3D tương tác khu trung tâm, bản hiện hành là `webgpu-materials-24.html`.
2. **Smart Traffic khu Bắc** (`outputs/smart-traffic/`): mô phỏng giao thông, đèn tín hiệu, camera, vi phạm và hai web (cán bộ, người dân). Lõi dùng chung nằm ở `outputs/shared/digital-twin-core/`.

Mô hình là **gần đúng**: chiều cao, vật liệu và phối cảnh chưa được khảo sát đo đạc, không dùng để điều hướng UAV hay làm căn cứ kỹ thuật công trình. Dữ liệu giao thông và perception trong Smart Traffic là **mô phỏng** (sinh từ mô hình đèn/xe và độ tin cậy perception giả định), không phải dữ liệu camera thật.

## Chạy City Lab

```sh
python3 outputs/hcmc-poc/serve.py        # cổng mặc định 8768, đặt PORT để đổi
```

Mở `http://127.0.0.1:8768/hcmc-poc/`. Trang này chuyển sang `webgpu-materials-24.html?v=31a`. Tham số chi tiết xem [outputs/hcmc-poc/README.md](outputs/hcmc-poc/README.md).

## Smart Traffic khu Bắc

Chạy cả hệ (static 3D, backend API, web) bằng một lệnh:

```sh
bash outputs/smart-traffic/run-smart.sh            # Linux/macOS/Git Bash
bash outputs/smart-traffic/run-smart.sh --stop     # tắt cả cây tiến trình đã bật
powershell -NoProfile -ExecutionPolicy Bypass -File outputs/smart-traffic/run-smart.ps1          # Windows
powershell -NoProfile -ExecutionPolicy Bypass -File outputs/smart-traffic/run-smart.ps1 -Stop
```

Script tạo `.venv` và cài gói backend nếu thiếu, khởi tạo DB, nạp seed, rồi chạy:

| Thành phần | Cổng | Địa chỉ |
|---|---|---|
| Trang 3D khu Bắc | 8821 | `http://127.0.0.1:8821/hcmc-poc/?app=smart&api=http://127.0.0.1:8900` |
| Backend API | 8900 | `http://127.0.0.1:8900` |
| Web cán bộ (điều hành) | 5173 | `http://127.0.0.1:5173/index-officer.html` |
| Web người dân (tra cứu) | 5173 | `http://127.0.0.1:5173/index-citizen.html` |

Tài khoản seed nằm trong `outputs/smart-traffic/backend/app/seed/accounts.json`. README không chép mật khẩu; đổi mật khẩu trước khi dùng ngoài máy phát triển.

### Trạng thái (theo lịch sử commit, chưa có báo cáo nghiệm thu M7)

- **M1 Hàng Xanh** (vi phạm vượt đèn đỏ, bằng chứng, tra cứu): có commit T1–T14. Mục A1 (đèn thích ứng giảm thời gian chờ so với cố định) **chưa đạt** theo commit `d8dd16b`; giữ kịch bản mặc định.
- **M2 khu Bắc gọn** (nền khóa, nhà/cây/xe ngoài khu ẩn, signature ngoài khu ẩn): đã có M2a, M2b, M2c.
- **M3 mạng nút + camera + VMS**: chưa thấy commit.
- **M4 bản đồ nhiệt, dự báo, điều hướng, tua giờ**: có M4a và M4c; phần còn lại chưa hoàn tất.
- **M5 đủ lỗi, xe ưu tiên, bốn kịch bản**: có M5a và M5b-1.
- **M6 web đầy đủ** (vòng đời vi phạm, khiếu nại, nộp phạt, phân quyền): có M6a, M6b, M6c.
- **M7 nghiệm thu tổng**: chưa làm.

### Việc còn mở

- Đo A3 (FPS app smart so với chế độ cổ điển) trên máy có GPU, chạy có hiển thị.
- Thiếu trụ cầu Sài Gòn 2 (306073179) và Thủ Thiêm (165919725), ghi trong `work/m1-notes.md`.
- Chưa có đo tài nguyên dài hạn; xem [docs/PERFORMANCE-24-7.md](docs/PERFORMANCE-24-7.md).
- Kế hoạch phase tiếp theo: [docs/NEXT-PHASE-PROMPTS.md](docs/NEXT-PHASE-PROMPTS.md).
- Đặc tả và kế hoạch: [docs/superpowers/specs/2026-10-14-smart-traffic-bac-design.md](docs/superpowers/specs/2026-10-14-smart-traffic-bac-design.md), [docs/superpowers/plans/2026-10-14-m1-hang-xanh.md](docs/superpowers/plans/2026-10-14-m1-hang-xanh.md).

## Kiểm tra

```sh
node --test "outputs/hcmc-poc/test/*.test.mjs"           # logic sim, đèn, luật vi phạm
node outputs/hcmc-poc/scripts/qa-project-hygiene.cjs      # vệ sinh repo
node outputs/hcmc-poc/scripts/validate_signature_registry_31.cjs
PORT=8879 node outputs/hcmc-poc/scripts/qa-north-32.cjs   # cần server tĩnh đang chạy
outputs/smart-traffic/backend/.venv/Scripts/python.exe -m pytest outputs/smart-traffic/backend/tests -q -p no:cacheprovider
```

Đã biết: `validate_demo_ready.py` và `qa-app-integrity-30b.cjs` vẫn kiểm nhánh shell cũ `?legacy=1`, đã gỡ khỏi điều hướng, nên hai kiểm tra này báo lỗi cho đến khi được cập nhật.

## Lịch sử PoC

Các batch PoC 02–26 và tài liệu demo cũ đã gỡ khỏi cây làm việc (CLEANUP A, C). Shell cũ `?legacy=1` đã gỡ khỏi điều hướng (CLEANUP B); vài tệp của nó còn lại vì validator cũ vẫn đọc. Tra cứu bằng `git log` hoặc `git show <commit>:<đường dẫn>`.

Dự án Gia Lộc (Tây Ninh) đã gỡ khỏi repo, gồm cả hợp đồng nguồn `outputs/shared/digital-twin-core/projects/gia-loc.json`; lõi dùng chung chỉ còn hợp đồng HCMC. Tra cứu phần còn lại bằng `git log`.

## Dữ liệu, giấy phép và phạm vi

Dữ liệu và thư viện có giấy phép riêng: OpenStreetMap (ODbL), Overture, EOX và Copernicus, Google Open Buildings, Three.js, Earcut, Poly Haven. Xem [GIT-DATA-PACKAGING.md](GIT-DATA-PACKAGING.md) về nguồn, quyền và chính sách lưu trữ ảnh vệ tinh/vật liệu.

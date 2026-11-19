# Kế hoạch lõi Public Demo v1

## Mốc và giới hạn

- Mốc chung: `3c9dac9fee352ba8c7ed0e104ee13715ad6439eb` (`smtf-public-demo-handoff-v1`).
- Nhánh tích hợp: `codex/public-demo-core`. Commit `bdda377` chỉ thêm cấu hình researcher.
- Hợp đồng và fixture chuẩn giữ `public-demo-v1`; nhánh lõi không sửa gate hoặc CI.
- Mỗi checkpoint bắt đầu vòng 0, tối đa hai vòng sửa cộng dồn. Các ID tổng vẫn mở đến khi đủ kiểm chính, meta, chéo, review và browser QA đúng candidate.
- Planner `CORE-PLAN-CHECK-00` và researcher `CORE-RESEARCH-01` đã bàn giao kết quả được verify tại mốc chung. Chi tiết và receipt nằm trong ledger cục bộ, không đưa log/runtime vào Git.

## Đường cơ sở đã đo

Geometry đạt; hồi quy Node 265 test, web 64 test/typecheck/build, API 171 test đạt ở nền sản phẩm chung. CI tổng cần chạy lại sau cài dependencies. Docker chưa đo vì daemon chưa chạy.

Lệnh A/B riêng: `node scripts/kpi-ab-32.mjs --seeds 31031,31032,31033,31034,31035 --scenario peak-hang-xanh --duration 1800 --mode both --out work/smtf-agent/baseline/a1`. Không gộp với lệnh 31A.

| Seed | Fixed s/xe | Smart s/xe | Giảm trễ | Qua vạch fixed/smart | Mất lưu lượng |
|---|---:|---:|---:|---:|---:|
| 31031 | 294,367 | 195,585 | 33,5574% | 572 / 717 | -25,3497% |
| 31032 | 253,103 | 204,666 | 19,1373% | 679 / 679 | 0% |
| 31033 | 235,675 | 143,664 | 39,0415% | 604 / 938 | -55,2980% |
| 31034 | 279,588 | 173,256 | 38,0317% | 504 / 795 | -57,7381% |
| 31035 | 214,582 | 175,342 | 18,2867% | 767 / 836 | -8,9961% |

Tính độc lập từ từng cặp JSON thô: trung bình giảm trễ 29,6109%; mọi seed mất lưu lượng ≤5%; cùng demand và cửa sổ 300–1800 s. Đây chưa là nghiệm thu SIM-A1: báo cáo còn thiếu tới đích/chờ biên và có 8.525–9.071 lần phục hồi mỗi run. Giữ raw để phân biệt xe qua vạch, tới đích và thu hồi.

## Các lát và oracle

| Lát | Requirement | Phạm vi lõi | Oracle và phép đo |
|---|---|---|---|
| DATA-T1 | DATA-01, USER-01, DOCKER-01 | Shared ES module; transport local/public; public auth/session, transaction/lease; command/snapshot/ACK FastAPI; nối trạm; Docker COPY | Hợp đồng/fixture cho shape, role từ route thật; Chromium với IndexedDB thật; pending tới sau callback; hết hạn 10 giây thực; tranh lease hai tab; abort không ghi/event dở; local hồi quy |
| DATA-T2 | DATA-01, USER-01 | Hoàn tất route public/citizen/officer/admin, media, dedup và lifecycle | Public API, profile độc lập, pagination/lọc và quyền sở hữu; đăng xuất/disable; hồ sơ và audit cùng giao dịch; UI thật do nhánh UI tích hợp |
| NORTH-DATA | PUB-01, SIM-01, CAM-01 | Cắt graph/cảnh Bắc; mapping, nguồn; 10 cụm; dữ liệu dẫn xuất nhất quán | Nguồn graph chuẩn; ID hai chiều; cấp làn, cao độ, xung đột, vạch dừng và ảnh từng hướng; tham chiếu đã lọc phải đỏ |
| ROUTE-SIM | SIM-01, SIM-A1 | Chuyến có đích; đổi tuyến; lối ra đầy; bộ điều khiển an toàn và bảng lý do | Tự dựng đồ thị nhỏ và đếm xe; 0,1 s; vàng 3 s/đỏ chung 2 s; seed tái lập; A/B tự tính từng cặp, giữ raw toàn mạng/chờ biên/tới đích/phục hồi; 31A riêng |
| AI-CAMERA | AI-01, CAM-01, PERF-01 | Capture theo nút; worker YOLOX-Nano ghim hash; WebGL2; lifecycle ảnh | Ảnh và nhãn độc lập; letterbox/crop/xe biên/trống; frame/camera sai phải đỏ; inference thật; một job; không overlay trên đầu vào; WebGL2 thật |
| PACKAGE | PUB-01, PERF-01, DOCKER-01, USER-01 | Builder Pages/Vercel, Vite entries, manifest, upload gate; ghép UI | Byte/hash từng file, whitelist, origin ghim; ≤20.000 file/<25 MiB Pages, <90 MiB Vercel; browser flows; Docker volume riêng; hiệu năng và soak máy GPU thật |

Allowlist chính xác DATA-T1/T2 lấy từ report planner, đưa nguyên danh sách vào brief từng vai trò trước khi viết. Các lát sau chỉ chốt file cụ thể sau khảo sát và planner phản biện tương ứng. Không dùng helper sản phẩm tính expected.

## Trình tự mỗi lát

1. Brief + preflight + READY + đối chiếu receipt startSha; code/hardtest dùng hai worktree sạch riêng.
2. Hardtest ghi ca đỏ có lý do trước. Code khảo sát và sửa đúng ownership; thu commit/result, verify ở từng worktree.
3. Ghép candidate và chạy suite chính/CI đúng SHA. Meta/cross dùng worktree riêng; biến thể cố tình sai nằm ngoài tích hợp.
4. Review chỉ đọc soi cả code lẫn độ khó test, rồi browser QA trên candidate thật.
5. Mỗi ứng viên sửa sau thất bại dùng vòng 1 hoặc 2. Luôn chạy ca hỏng trước, rồi suite/meta/cross. Hết vòng 2 còn đỏ: đóng băng, repro nhỏ, chẩn đoán độc lập; không giảm ngưỡng hoặc bỏ test.

## Điều kiện bàn giao

Cung cấp commits/SHA, tài liệu runtime và triển khai, ma trận requirement → test → log, hai artifact và manifest. Chạy `ci` và `release` cùng candidate với evidence CAM/USER/PERF theo runbook. Thiếu Docker daemon, GPU thật, preview origin, đồng thuận UI hoặc bất kỳ evidence nào đều phải ghi rõ, không tự suy thành PASS. Điều phối viên phát hành chung tích hợp và upload chính thức.

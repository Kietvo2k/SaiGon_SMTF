# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)

Sinh lúc 2026-10-18T02:20:15.157Z. Mỗi pha 3 phút, lấy mẫu mỗi 30 s. Trang: `http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=http://127.0.0.1:8940` và `http://127.0.0.1:5173/index-officer.html` (đã đăng nhập: có).

| Pha | Mô tả | Tốc độ | visibilityState tab app |
|---|---|---|---|
| C | tab app hiện, tua ×10 | ×10 | visible |

## Trung bình / đỉnh mỗi cột theo pha

| Cột | C TB | C đỉnh |
|---|---|---|
| FPS (rAF/giây) | 80.10 | 82.30 |
| FPS app báo | — | — |
| Heap JS (MB) | 176.74 | 197.47 |
| CPU luồng chính (% lõi) | 45.52 | 58.30 |
| CPU ms/giây | 455.30 | 583.40 |
| Request tới backend / 30 s | 139.33 | 209.00 |
| Byte WS web nhận / 30 s | 5766269.83 | 11380483.00 |
| WS frame / 30 s | 190.00 | 398.00 |
| smart-traffic.db (byte) | 5227178.67 | 5349376.00 |
| var/frames (byte) | 79281520.00 | 82896954.00 |
| sim.t (giây sim) | 869.8 | 1401.8 |
| station_metrics (dòng) | 303.0 | 318.0 |
| signal_state_log (dòng) | 1818.0 | 1908.0 |
| kpi_samples (dòng) | 303.0 | 318.0 |
| violations (dòng) | 437.8 | 457.0 |

## Tốc độ tăng theo giờ (đầu → cuối pha)

| Chỉ số | C |
|---|---|
| Heap JS (MB/giờ) | -1053.600 |
| DB (MB/giờ) | 5.906 |
| var/frames (MB/giờ) | 197.200 |
| Request backend (mỗi giờ) | 20064.000 |
| sim.t (giây sim / giây thực) | 25572.000 |
| station_metrics (dòng/giờ) | 720.0 |
| signal_state_log (dòng/giờ) | 4320.0 |
| kpi_samples (dòng/giờ) | 720.0 |
| violations (dòng/giờ) | 1080.0 |
| Đĩa tổng (MB/giờ) | 203.106 |

## Request tới backend theo đường dẫn (request/phút)

| Đường dẫn | C |
|---|---|
| `/api/v1/auth/login` | 0.80 |
| `/api/v1/auth/me` | 0.40 |
| `/api/v1/officer/kpi` | 14.00 |
| `/api/v1/officer/violations` | 28.00 |
| `/api/v1/station/frames` | 122.80 |
| `/api/v1/station/heartbeat` | 5.60 |
| `/api/v1/station/heat` | 56.40 |
| `/api/v1/station/metrics` | 17.20 |
| `/api/v1/station/violations` | 31.60 |
| `/api/v1/station/violations/VP-20261018-000076/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000077/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000078/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000079/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000080/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000081/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000082/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000083/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000084/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000085/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000086/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000087/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000088/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000089/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000090/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000091/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000092/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000093/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000094/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000095/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000096/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000097/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000098/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000099/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000100/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000101/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000102/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000103/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000104/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000105/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000106/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000107/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000108/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000109/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000110/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000111/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000112/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000113/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000114/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000115/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000116/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000117/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000118/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000119/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000120/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000121/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000122/evidence` | 1.20 |
| `/api/v1/station/violations/VP-20261018-000123/evidence` | 1.20 |

## Ba nguồn tải lớn nhất

| # | Nguồn | Chi tiết | Phần ngân sách |
|---|---|---|---|
| 1 | Khung stream camera 1280×720 gửi lên backend rồi broadcast base64 | 791.877 MB/giờ tới web; 122.8 request/phút /station/frames | 15.84× (ngân sách 50 ws_mb_per_hour) |
| 2 | Nhịp request trạm (metrics/heat/heartbeat/frames) | 334.39999999999947 request/phút | 5.57× (ngân sách 60 req_per_min) |
| 3 | Vòng vẽ 3D (rAF/WebGPU) không có trần FPS | FPS trung bình 80.1, CPU luồng chính 45.52 % một lõi | 4.55× (ngân sách 10 cpu_pct) |

Ngân sách xếp hạng: CPU 10 %/lõi, WS 50 MB/giờ, đĩa 50 MB/giờ, request 60/phút (theo docs/PERFORMANCE-24-7.md mục 4).

## Lỗi trang ghi được (40 dòng đầu)

- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- app console Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- app console Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)


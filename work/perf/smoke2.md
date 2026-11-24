# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)

Sinh lúc 2026-10-17T15:11:54.667Z. Mỗi pha 1 phút, lấy mẫu mỗi 30 s. Trang: `http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=http://127.0.0.1:8940` và `http://127.0.0.1:5173/index-officer.html` (đã đăng nhập: KHÔNG).

| Pha | Mô tả | Tốc độ | visibilityState tab app |
|---|---|---|---|
| A | tab app hiện, ×1 | ×1 | visible |
| B | tab app ẩn (trang trống đè lên), ×1 | ×1 | visible |
| C | tab app hiện, tua ×10 | ×10 | visible |

## Trung bình / đỉnh mỗi cột theo pha

| Cột | A TB | B TB | C TB | A đỉnh | B đỉnh | C đỉnh |
|---|---|---|---|---|---|---|
| FPS (rAF/giây) | 44.70 | 1.00 | 42.30 | 45.10 | 1.00 | 43.60 |
| FPS app báo | — | — | — | — | — | — |
| Heap JS (MB) | 193.55 | 182.18 | 165.37 | 204.71 | 182.79 | 187.11 |
| CPU luồng chính (% lõi) | 98.55 | 11.15 | 98.20 | 98.60 | 11.30 | 98.30 |
| CPU ms/giây | 985.65 | 111.45 | 982.35 | 986.20 | 112.70 | 983.20 |
| Request tới backend / 30 s | 94.00 | 73.00 | 125.50 | 124.00 | 81.00 | 140.00 |
| Byte WS web nhận / 30 s | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| WS frame / 30 s | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| smart-traffic.db (byte) | 3162112.00 | 3196928.00 | 3299328.00 | 3170304.00 | 3203072.00 | 3325952.00 |
| var/frames (byte) | 7711961.00 | 7890429.50 | 10686824.00 | 7712284.00 | 7890515.00 | 11450361.00 |
| sim.t (giây sim) | 56.7 | 84.0 | 583.8 | 71.7 | 87.8 | 732.4 |
| station_metrics (dòng) | 61.0 | 74.0 | 87.0 | 64.0 | 77.0 | 90.0 |
| signal_state_log (dòng) | 366.0 | 444.0 | 522.0 | 384.0 | 462.0 | 540.0 |
| kpi_samples (dòng) | 61.0 | 74.0 | 87.0 | 64.0 | 77.0 | 90.0 |
| violations (dòng) | 42.0 | 43.0 | 58.0 | 42.0 | 43.0 | 62.0 |

## Tốc độ tăng theo giờ (đầu → cuối pha)

| Chỉ số | A | B | C |
|---|---|---|---|
| Heap JS (MB/giờ) | -2678.400 | 147.110 | -5217.600 |
| DB (MB/giờ) | 1.875 | 1.402 | 6.094 |
| var/frames (MB/giờ) | 0.074 | -0.020 | 174.760 |
| Request backend (mỗi giờ) | 22560.000 | 17461.800 | 30120.000 |
| sim.t (giây sim / giây thực) | 3600.000 | 897.010 | 35676.000 |
| station_metrics (dòng/giờ) | 720.0 | 717.6 | 720.0 |
| signal_state_log (dòng/giờ) | 4320.0 | 4305.6 | 4320.0 |
| kpi_samples (dòng/giờ) | 720.0 | 717.6 | 720.0 |
| violations (dòng/giờ) | 0.0 | 0.0 | 960.0 |
| Đĩa tổng (MB/giờ) | 1.949 | 1.382 | 180.854 |

## Request tới backend theo đường dẫn (request/phút)

| Đường dẫn | A | B | C |
|---|---|---|---|
| `/api/v1/auth/login` | 2.00 | — | — |
| `/api/v1/station/frames` | 282.00 | 243.19 | 166.00 |
| `/api/v1/station/heartbeat` | 14.00 | 7.97 | 8.00 |
| `/api/v1/station/heat` | 16.00 | 1.99 | 130.00 |
| `/api/v1/station/metrics` | 38.00 | 25.91 | 26.00 |
| `/api/v1/station/violations` | 24.00 | 5.98 | 58.00 |
| `/api/v1/station/violations/VP-20261017-000043/evidence` | — | 5.98 | — |
| `/api/v1/station/violations/VP-20261017-000044/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000045/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000046/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000047/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000048/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000049/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000050/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000051/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000052/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000053/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000054/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000055/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000056/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000057/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000058/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000059/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000060/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000061/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000062/evidence` | — | — | 6.00 |

## Ba nguồn tải lớn nhất

| # | Nguồn | Chi tiết | Phần ngân sách |
|---|---|---|---|
| 1 | Vòng vẽ 3D (rAF/WebGPU) không có trần FPS | FPS trung bình 44.7, CPU luồng chính 98.55 % một lõi | 9.86× (ngân sách 10 cpu_pct) |
| 2 | Nhịp request trạm (metrics/heat/heartbeat/frames) | 376 request/phút | 6.27× (ngân sách 60 req_per_min) |
| 3 | Pha ẩn không giảm tải (rAF vẫn chạy) | pha B: FPS 1, CPU 11.15 % | 1.11× (ngân sách 10 cpu_pct) |

Ngân sách xếp hạng: CPU 10 %/lõi, WS 50 MB/giờ, đĩa 50 MB/giờ, request 60/phút (theo docs/PERFORMANCE-24-7.md mục 4).

## Lỗi trang ghi được (40 dòng đầu)

- web console Failed to load resource: net::ERR_CONNECTION_REFUSED
- web console Failed to load resource: the server responded with a status of 404 (Not Found)
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
- app console Failed to load resource: the server responded with a status of 409 (Conflict)


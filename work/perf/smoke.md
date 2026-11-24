# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)

Sinh lúc 2026-10-17T14:34:25.615Z. Mỗi pha 1 phút, lấy mẫu mỗi 30 s. Trang: `http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=http://127.0.0.1:8940` và `http://127.0.0.1:5173/index-officer.html` (đã đăng nhập: KHÔNG).

| Pha | Mô tả | Tốc độ | visibilityState tab app |
|---|---|---|---|
| A | tab app hiện, ×1 | ×1 | visible |
| B | tab app ẩn (trang trống đè lên), ×1 | ×1 | visible |
| C | tab app hiện, tua ×10 | ×10 | visible |

## Trung bình / đỉnh mỗi cột theo pha

| Cột | A TB | B TB | C TB | A đỉnh | B đỉnh | C đỉnh |
|---|---|---|---|---|---|---|
| FPS (rAF/giây) | 46.05 | 1.00 | 41.20 | 46.20 | 1.00 | 42.90 |
| FPS app báo | — | — | — | — | — | — |
| Heap JS (MB) | 181.63 | 184.73 | 135.34 | 184.54 | 197.58 | 138.14 |
| CPU luồng chính (% lõi) | 98.65 | 12.55 | 98.40 | 98.70 | 12.60 | 98.60 |
| CPU ms/giây | 986.25 | 125.65 | 983.95 | 986.90 | 126.00 | 986.00 |
| Request tới backend / 30 s | 105.50 | 73.00 | 129.00 | 140.00 | 82.00 | 140.00 |
| Byte WS web nhận / 30 s | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| WS frame / 30 s | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| smart-traffic.db (byte) | 2934784.00 | 2973696.00 | 3084288.00 | 2945024.00 | 2981888.00 | 3117056.00 |
| var/frames (byte) | 2007455.50 | 2661964.50 | 6615165.50 | 2239158.00 | 2662092.00 | 7718041.00 |
| sim.t (giây sim) | 56.8 | 84.3 | 580.6 | 71.8 | 88.0 | 729.0 |
| station_metrics (dòng) | 16.0 | 29.0 | 42.0 | 19.0 | 32.0 | 45.0 |
| signal_state_log (dòng) | 96.0 | 174.0 | 252.0 | 114.0 | 192.0 | 270.0 |
| kpi_samples (dòng) | 16.0 | 29.0 | 42.0 | 19.0 | 32.0 | 45.0 |
| violations (dòng) | 11.5 | 15.0 | 36.5 | 13.0 | 15.0 | 42.0 |

## Tốc độ tăng theo giờ (đầu → cuối pha)

| Chỉ số | A | B | C |
|---|---|---|---|
| Heap JS (MB/giờ) | -698.400 | 3085.200 | 672.000 |
| DB (MB/giờ) | 2.344 | 1.875 | 7.500 |
| var/frames (MB/giờ) | 53.032 | -0.029 | 252.428 |
| Request backend (mỗi giờ) | 25320.000 | 17520.000 | 30960.000 |
| sim.t (giây sim / giây thực) | 3600.000 | 900.000 | 35604.000 |
| station_metrics (dòng/giờ) | 720.0 | 720.0 | 720.0 |
| signal_state_log (dòng/giờ) | 4320.0 | 4320.0 | 4320.0 |
| kpi_samples (dòng/giờ) | 720.0 | 720.0 | 720.0 |
| violations (dòng/giờ) | 360.0 | 0.0 | 1320.0 |
| Đĩa tổng (MB/giờ) | 55.376 | 1.846 | 259.928 |

## Request tới backend theo đường dẫn (request/phút)

| Đường dẫn | A | B | C |
|---|---|---|---|
| `/api/v1/auth/login` | 4.00 | — | — |
| `/api/v1/station/frames` | 248.00 | 238.00 | 138.00 |
| `/api/v1/station/heartbeat` | 12.00 | 10.00 | 8.00 |
| `/api/v1/station/heat` | 16.00 | 2.00 | 128.00 |
| `/api/v1/station/metrics` | 38.00 | 26.00 | 26.00 |
| `/api/v1/station/violations` | 26.00 | 4.00 | 54.00 |
| `/api/v1/station/violations/VP-20261017-000001/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000002/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000003/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000004/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000005/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000006/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000007/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000008/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000009/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000010/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000011/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000012/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000013/evidence` | 6.00 | — | — |
| `/api/v1/station/violations/VP-20261017-000014/evidence` | — | 6.00 | — |
| `/api/v1/station/violations/VP-20261017-000015/evidence` | — | 6.00 | — |
| `/api/v1/station/violations/VP-20261017-000016/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000017/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000018/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000019/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000020/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000021/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000022/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000023/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000024/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000025/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000026/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000027/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000028/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000029/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000030/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000031/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000032/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000033/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000034/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000035/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000036/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000037/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000038/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000039/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000040/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000041/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000042/evidence` | — | — | 6.00 |

## Ba nguồn tải lớn nhất

| # | Nguồn | Chi tiết | Phần ngân sách |
|---|---|---|---|
| 1 | Vòng vẽ 3D (rAF/WebGPU) không có trần FPS | FPS trung bình 46.05, CPU luồng chính 98.65 % một lõi | 9.87× (ngân sách 10 cpu_pct) |
| 2 | Nhịp request trạm (metrics/heat/heartbeat/frames) | 422 request/phút | 7.03× (ngân sách 60 req_per_min) |
| 3 | Pha ẩn không giảm tải (rAF vẫn chạy) | pha B: FPS 1, CPU 12.55 % | 1.25× (ngân sách 10 cpu_pct) |

Ngân sách xếp hạng: CPU 10 %/lõi, WS 50 MB/giờ, đĩa 50 MB/giờ, request 60/phút (theo docs/PERFORMANCE-24-7.md mục 4).

## Lỗi trang ghi được (40 dòng đầu)

- web console Failed to load resource: net::ERR_CONNECTION_REFUSED
- web console Failed to load resource: the server responded with a status of 404 (Not Found)


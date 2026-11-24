# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)

Sinh lúc 2026-10-17T19:48:42.959Z. Mỗi pha 3 phút, lấy mẫu mỗi 30 s. Trang: `http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=http://127.0.0.1:8940` và `http://127.0.0.1:5173/index-officer.html` (đã đăng nhập: có).

| Pha | Mô tả | Tốc độ | visibilityState tab app |
|---|---|---|---|
| A | tab app hiện, ×1 | ×1 | visible |
| B | tab app ẩn (trang trống đè lên), ×1 | ×1 | visible |
| C | tab app hiện, tua ×10 | ×10 | visible |

## Trung bình / đỉnh mỗi cột theo pha

| Cột | A TB | B TB | C TB | A đỉnh | B đỉnh | C đỉnh |
|---|---|---|---|---|---|---|
| FPS (rAF/giây) | 54.73 | 1.00 | 49.82 | 56.00 | 1.00 | 50.20 |
| FPS app báo | — | — | — | — | — | — |
| Heap JS (MB) | 177.51 | 134.50 | 136.24 | 191.04 | 148.01 | 154.10 |
| CPU luồng chính (% lõi) | 96.18 | 10.75 | 97.42 | 96.70 | 11.00 | 97.60 |
| CPU ms/giây | 961.77 | 107.43 | 974.12 | 966.80 | 110.00 | 976.00 |
| Request tới backend / 30 s | 84.00 | 75.33 | 105.33 | 146.00 | 89.00 | 125.00 |
| Byte WS web nhận / 30 s | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| WS frame / 30 s | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| smart-traffic.db (byte) | 3760128.00 | 3760128.00 | 3760128.00 | 3760128.00 | 3760128.00 | 3760128.00 |
| var/frames (byte) | 48453624.00 | 48453624.00 | 48453624.00 | 48453624.00 | 48453624.00 | 48453624.00 |
| sim.t (giây sim) | 116.8 | 218.9 | 1338.2 | 191.7 | 237.5 | 2084.6 |
| station_metrics (dòng) | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| signal_state_log (dòng) | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| kpi_samples (dòng) | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| violations (dòng) | 269.0 | 269.0 | 269.0 | 269.0 | 269.0 | 269.0 |

## Tốc độ tăng theo giờ (đầu → cuối pha)

| Chỉ số | A | B | C |
|---|---|---|---|
| Heap JS (MB/giờ) | -869.520 | -232.560 | 400.560 |
| DB (MB/giờ) | 0.000 | 0.000 | 0.000 |
| var/frames (MB/giờ) | 0.000 | 0.000 | 0.000 |
| Request backend (mỗi giờ) | 12096.000 | 10848.000 | 15168.000 |
| sim.t (giây sim / giây thực) | 3600.000 | 895.200 | 35920.800 |
| station_metrics (dòng/giờ) | 0.0 | 0.0 | 0.0 |
| signal_state_log (dòng/giờ) | 0.0 | 0.0 | 0.0 |
| kpi_samples (dòng/giờ) | 0.0 | 0.0 | 0.0 |
| violations (dòng/giờ) | 0.0 | 0.0 | 0.0 |
| Đĩa tổng (MB/giờ) | 0.000 | 0.000 | 0.000 |

## Request tới backend theo đường dẫn (request/phút)

| Đường dẫn | A | B | C |
|---|---|---|---|
| `/api/v1/auth/login` | 183.20 | 165.20 | 238.40 |
| `/api/v1/auth/me` | 0.40 | — | — |
| `/api/v1/officer/kpi` | 6.00 | 5.20 | 4.80 |
| `/api/v1/officer/violations` | 12.00 | 10.40 | 9.60 |

## Ba nguồn tải lớn nhất

| # | Nguồn | Chi tiết | Phần ngân sách |
|---|---|---|---|
| 1 | Vòng vẽ 3D (rAF/WebGPU) không có trần FPS | FPS trung bình 54.73, CPU luồng chính 96.18 % một lõi | 9.62× (ngân sách 10 cpu_pct) |
| 2 | Nhịp request trạm (metrics/heat/heartbeat/frames) | 201.6 request/phút | 3.36× (ngân sách 60 req_per_min) |
| 3 | Pha ẩn không giảm tải (rAF vẫn chạy) | pha B: FPS 1, CPU 10.75 % | 1.07× (ngân sách 10 cpu_pct) |

Ngân sách xếp hạng: CPU 10 %/lõi, WS 50 MB/giờ, đĩa 50 MB/giờ, request 60/phút (theo docs/PERFORMANCE-24-7.md mục 4).

## Lỗi trang ghi được (40 dòng đầu)

- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED
- app console Access to fetch at 'http://127.0.0.1:8940/api/v1/auth/login' from origin 'http://127.0.0.1:8841' has been blocked by CORS policy: No 'Access-Control-Allow-Origi
- app console Failed to load resource: net::ERR_FAILED


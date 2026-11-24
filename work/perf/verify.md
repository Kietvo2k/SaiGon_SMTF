# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)

Sinh lúc 2026-10-17T16:19:30.013Z. Mỗi pha 1 phút, lấy mẫu mỗi 30 s. Trang: `http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=http://127.0.0.1:8940` và `http://127.0.0.1:5173/index-officer.html` (đã đăng nhập: có).

| Pha | Mô tả | Tốc độ | visibilityState tab app |
|---|---|---|---|
| A | tab app hiện, ×1 | ×1 | visible |
| B | tab app ẩn (trang trống đè lên), ×1 | ×1 | visible |
| C | tab app hiện, tua ×10 | ×10 | visible |

## Trung bình / đỉnh mỗi cột theo pha

| Cột | A TB | B TB | C TB | A đỉnh | B đỉnh | C đỉnh |
|---|---|---|---|---|---|---|
| FPS (rAF/giây) | 45.60 | 1.00 | 45.85 | 46.00 | 1.00 | 46.70 |
| FPS app báo | — | — | — | — | — | — |
| Heap JS (MB) | 194.57 | 174.40 | 147.47 | 199.81 | 177.46 | 155.66 |
| CPU luồng chính (% lõi) | 98.60 | 11.25 | 98.60 | 98.60 | 11.70 | 98.60 |
| CPU ms/giây | 986.15 | 112.50 | 986.20 | 986.30 | 117.00 | 986.40 |
| Request tới backend / 30 s | 108.00 | 78.50 | 144.50 | 146.00 | 86.00 | 151.00 |
| Byte WS web nhận / 30 s | 6075955.50 | 5465196.00 | 5196265.00 | 7614087.00 | 5835602.00 | 5554659.00 |
| WS frame / 30 s | 111.00 | 68.50 | 170.50 | 157.00 | 74.00 | 197.00 |
| smart-traffic.db (byte) | 4573184.00 | 4608000.00 | 4689920.00 | 4579328.00 | 4616192.00 | 4714496.00 |
| var/frames (byte) | 34541182.50 | 34541231.00 | 36030628.00 | 34541442.00 | 34541374.00 | 36620814.00 |
| sim.t (giây sim) | 56.9 | 84.2 | 584.6 | 71.9 | 87.9 | 733.2 |
| station_metrics (dòng) | 361.0 | 374.0 | 387.0 | 364.0 | 377.0 | 390.0 |
| signal_state_log (dòng) | 2166.0 | 2244.0 | 2322.0 | 2184.0 | 2262.0 | 2340.0 |
| kpi_samples (dòng) | 361.0 | 374.0 | 387.0 | 364.0 | 377.0 | 390.0 |
| violations (dòng) | 192.0 | 192.0 | 200.5 | 192.0 | 192.0 | 204.0 |

## Tốc độ tăng theo giờ (đầu → cuối pha)

| Chỉ số | A | B | C |
|---|---|---|---|
| Heap JS (MB/giờ) | 1256.400 | 738.060 | -1965.600 |
| DB (MB/giờ) | 1.406 | 1.881 | 5.625 |
| var/frames (MB/giờ) | -0.059 | -0.033 | 135.083 |
| Request backend (mỗi giờ) | 25920.000 | 18903.000 | 34680.000 |
| sim.t (giây sim / giây thực) | 3600.000 | 903.010 | 35664.000 |
| station_metrics (dòng/giờ) | 720.0 | 722.4 | 720.0 |
| signal_state_log (dòng/giờ) | 4320.0 | 4334.4 | 4320.0 |
| kpi_samples (dòng/giờ) | 720.0 | 722.4 | 720.0 |
| violations (dòng/giờ) | 0.0 | 0.0 | 840.0 |
| Đĩa tổng (MB/giờ) | 1.347 | 1.848 | 140.708 |

## Request tới backend theo đường dẫn (request/phút)

| Đường dẫn | A | B | C |
|---|---|---|---|
| `/api/v1/auth/login` | 2.00 | — | — |
| `/api/v1/auth/me` | 2.00 | — | — |
| `/api/v1/officer/kpi` | 16.00 | 8.03 | 32.00 |
| `/api/v1/officer/violations` | 32.00 | 16.05 | 64.00 |
| `/api/v1/station/frames` | 288.00 | 246.82 | 178.00 |
| `/api/v1/station/heartbeat` | 12.00 | 10.03 | 8.00 |
| `/api/v1/station/heat` | 16.00 | 2.01 | 130.00 |
| `/api/v1/station/metrics` | 38.00 | 26.09 | 26.00 |
| `/api/v1/station/violations` | 26.00 | 6.02 | 72.00 |
| `/api/v1/station/violations/VP-20261017-000193/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000194/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000195/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000196/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000197/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000198/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000199/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000200/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000201/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000202/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000203/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000204/evidence` | — | — | 2.00 |

## Ba nguồn tải lớn nhất

| # | Nguồn | Chi tiết | Phần ngân sách |
|---|---|---|---|
| 1 | Khung stream camera 1280×720 gửi lên backend rồi broadcast base64 | 1390.676 MB/giờ tới web; 288 request/phút /station/frames | 27.81× (ngân sách 50 ws_mb_per_hour) |
| 2 | Vòng vẽ 3D (rAF/WebGPU) không có trần FPS | FPS trung bình 45.6, CPU luồng chính 98.6 % một lõi | 9.86× (ngân sách 10 cpu_pct) |
| 3 | Nhịp request trạm (metrics/heat/heartbeat/frames) | 432 request/phút | 7.20× (ngân sách 60 req_per_min) |

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


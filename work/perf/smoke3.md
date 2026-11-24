# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)

Sinh lúc 2026-10-17T15:23:19.714Z. Mỗi pha 1 phút, lấy mẫu mỗi 30 s. Trang: `http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=http://127.0.0.1:8940` và `http://127.0.0.1:5173/index-officer.html` (đã đăng nhập: có).

| Pha | Mô tả | Tốc độ | visibilityState tab app |
|---|---|---|---|
| A | tab app hiện, ×1 | ×1 | visible |
| B | tab app ẩn (trang trống đè lên), ×1 | ×1 | visible |
| C | tab app hiện, tua ×10 | ×10 | visible |

## Trung bình / đỉnh mỗi cột theo pha

| Cột | A TB | B TB | C TB | A đỉnh | B đỉnh | C đỉnh |
|---|---|---|---|---|---|---|
| FPS (rAF/giây) | 51.30 | 1.00 | 44.70 | 53.40 | 1.00 | 44.80 |
| FPS app báo | — | — | — | — | — | — |
| Heap JS (MB) | 195.75 | 178.13 | 159.06 | 204.54 | 178.78 | 187.04 |
| CPU luồng chính (% lõi) | 98.25 | 11.35 | 96.95 | 98.40 | 11.40 | 97.10 |
| CPU ms/giây | 982.50 | 113.55 | 969.70 | 983.80 | 113.70 | 971.20 |
| Request tới backend / 30 s | 107.00 | 78.00 | 141.50 | 142.00 | 86.00 | 154.00 |
| Byte WS web nhận / 30 s | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| WS frame / 30 s | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| smart-traffic.db (byte) | 3371008.00 | 3403776.00 | 3520512.00 | 3383296.00 | 3411968.00 | 3555328.00 |
| var/frames (byte) | 11442321.50 | 11442264.00 | 14982653.00 | 11443073.00 | 11442559.00 | 16043987.00 |
| sim.t (giây sim) | 56.5 | 83.8 | 585.0 | 71.5 | 87.5 | 733.6 |
| station_metrics (dòng) | 103.0 | 119.0 | 132.0 | 103.0 | 122.0 | 135.0 |
| signal_state_log (dòng) | 636.0 | 714.0 | 792.0 | 654.0 | 732.0 | 810.0 |
| kpi_samples (dòng) | 106.0 | 119.0 | 132.0 | 109.0 | 122.0 | 135.0 |
| violations (dòng) | 62.0 | 62.0 | 82.5 | 62.0 | 62.0 | 89.0 |

## Tốc độ tăng theo giờ (đầu → cuối pha)

| Chỉ số | A | B | C |
|---|---|---|---|
| Heap JS (MB/giờ) | -2108.400 | 157.200 | -6716.400 |
| DB (MB/giờ) | 2.813 | 1.875 | 7.969 |
| var/frames (MB/giờ) | 0.172 | -0.068 | 242.920 |
| Request backend (mỗi giờ) | 25680.000 | 18720.000 | 33960.000 |
| sim.t (giây sim / giây thực) | 3600.000 | 900.000 | 35652.000 |
| station_metrics (dòng/giờ) | -12360.0 | 720.0 | 720.0 |
| signal_state_log (dòng/giờ) | 4320.0 | 4320.0 | 4320.0 |
| kpi_samples (dòng/giờ) | 720.0 | 720.0 | 720.0 |
| violations (dòng/giờ) | 0.0 | 0.0 | 1560.0 |
| Đĩa tổng (MB/giờ) | 2.985 | 1.807 | 250.889 |

## Request tới backend theo đường dẫn (request/phút)

| Đường dẫn | A | B | C |
|---|---|---|---|
| `/api/v1/auth/login` | 2.00 | — | — |
| `/api/v1/auth/me` | 2.00 | — | — |
| `/api/v1/officer/kpi` | 14.00 | 10.00 | 8.00 |
| `/api/v1/officer/violations` | 28.00 | 20.00 | 16.00 |
| `/api/v1/station/frames` | 294.00 | 244.00 | 150.00 |
| `/api/v1/station/heartbeat` | 14.00 | 8.00 | 8.00 |
| `/api/v1/station/heat` | 16.00 | 2.00 | 130.00 |
| `/api/v1/station/metrics` | 38.00 | 26.00 | 26.00 |
| `/api/v1/station/violations` | 20.00 | 2.00 | 72.00 |
| `/api/v1/station/violations/VP-20261017-000063/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000064/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000065/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000066/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000067/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000068/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000069/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000070/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000071/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000072/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000073/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000074/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000075/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000076/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000077/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000078/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000079/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000080/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000081/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000082/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000083/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000084/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000085/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000086/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000087/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000088/evidence` | — | — | 6.00 |

## Ba nguồn tải lớn nhất

| # | Nguồn | Chi tiết | Phần ngân sách |
|---|---|---|---|
| 1 | Vòng vẽ 3D (rAF/WebGPU) không có trần FPS | FPS trung bình 51.3, CPU luồng chính 98.25 % một lõi | 9.82× (ngân sách 10 cpu_pct) |
| 2 | Nhịp request trạm (metrics/heat/heartbeat/frames) | 428 request/phút | 7.13× (ngân sách 60 req_per_min) |
| 3 | Pha ẩn không giảm tải (rAF vẫn chạy) | pha B: FPS 1, CPU 11.35 % | 1.14× (ngân sách 10 cpu_pct) |

Ngân sách xếp hạng: CPU 10 %/lõi, WS 50 MB/giờ, đĩa 50 MB/giờ, request 60/phút (theo docs/PERFORMANCE-24-7.md mục 4).

## Lỗi trang ghi được (40 dòng đầu)

- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- web console WebSocket connection to 'ws://127.0.0.1:8900/ws/v1' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
- app console Failed to load resource: the server responded with a status of 409 (Conflict)


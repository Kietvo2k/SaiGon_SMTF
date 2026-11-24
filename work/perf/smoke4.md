# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)

Sinh lúc 2026-10-17T16:00:08.642Z. Mỗi pha 1 phút, lấy mẫu mỗi 30 s. Trang: `http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=http://127.0.0.1:8940` và `http://127.0.0.1:5173/index-officer.html` (đã đăng nhập: KHÔNG).

| Pha | Mô tả | Tốc độ | visibilityState tab app |
|---|---|---|---|
| A | tab app hiện, ×1 | ×1 | visible |
| B | tab app ẩn (trang trống đè lên), ×1 | ×1 | visible |
| C | tab app hiện, tua ×10 | ×10 | visible |

## Trung bình / đỉnh mỗi cột theo pha

| Cột | A TB | B TB | C TB | A đỉnh | B đỉnh | C đỉnh |
|---|---|---|---|---|---|---|
| FPS (rAF/giây) | 46.35 | 1.00 | 40.15 | 46.70 | 1.00 | 40.30 |
| FPS app báo | — | — | — | — | — | — |
| Heap JS (MB) | 202.20 | 175.19 | 146.93 | 203.15 | 178.58 | 151.98 |
| CPU luồng chính (% lõi) | 98.60 | 11.40 | 98.40 | 98.60 | 11.90 | 98.50 |
| CPU ms/giây | 986.00 | 114.05 | 983.90 | 986.20 | 118.70 | 984.70 |
| Request tới backend / 30 s | 97.00 | 72.50 | 109.50 | 131.00 | 80.00 | 116.00 |
| Byte WS web nhận / 30 s | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| WS frame / 30 s | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| smart-traffic.db (byte) | 3743744.00 | 3782656.00 | 3874816.00 | 3751936.00 | 3788800.00 | 3907584.00 |
| var/frames (byte) | 16392440.00 | 16392513.50 | 18200178.00 | 16392666.00 | 16392720.00 | 19128473.00 |
| sim.t (giây sim) | 56.7 | 84.0 | 577.9 | 71.7 | 87.8 | 724.6 |
| station_metrics (dòng) | 204.0 | 217.0 | 230.0 | 207.0 | 220.0 | 233.0 |
| signal_state_log (dòng) | 1224.0 | 1302.0 | 1380.0 | 1242.0 | 1320.0 | 1398.0 |
| kpi_samples (dòng) | 204.0 | 217.0 | 230.0 | 207.0 | 220.0 | 233.0 |
| violations (dòng) | 91.0 | 91.0 | 101.0 | 91.0 | 91.0 | 106.0 |

## Tốc độ tăng theo giờ (đầu → cuối pha)

| Chỉ số | A | B | C |
|---|---|---|---|
| Heap JS (MB/giờ) | 228.000 | 816.321 | 1212.000 |
| DB (MB/giờ) | 1.875 | 1.411 | 7.500 |
| var/frames (MB/giờ) | -0.052 | -0.047 | 212.470 |
| Request backend (mỗi giờ) | 23280.000 | 17458.200 | 26280.000 |
| sim.t (giây sim / giây thực) | 3600.000 | 903.010 | 35208.000 |
| station_metrics (dòng/giờ) | 720.0 | 722.4 | 720.0 |
| signal_state_log (dòng/giờ) | 4320.0 | 4334.4 | 4320.0 |
| kpi_samples (dòng/giờ) | 720.0 | 722.4 | 720.0 |
| violations (dòng/giờ) | 0.0 | 0.0 | 1200.0 |
| Đĩa tổng (MB/giờ) | 1.823 | 1.364 | 219.970 |

## Request tới backend theo đường dẫn (request/phút)

| Đường dẫn | A | B | C |
|---|---|---|---|
| `/api/v1/auth/login` | 2.00 | — | — |
| `/api/v1/auth/me` | 2.00 | — | — |
| `/api/v1/officer/violations` | 4.00 | — | — |
| `/api/v1/station/frames` | 288.00 | 246.82 | 134.00 |
| `/api/v1/station/heartbeat` | 12.00 | 10.03 | 8.00 |
| `/api/v1/station/heat` | 16.00 | 2.01 | 128.00 |
| `/api/v1/station/metrics` | 38.00 | 26.09 | 26.00 |
| `/api/v1/station/violations` | 26.00 | 6.02 | 54.00 |
| `/api/v1/station/violations/VP-20261017-000092/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000093/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000094/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000095/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000096/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000097/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000098/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000099/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000100/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000101/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000102/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000103/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000104/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000105/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261017-000106/evidence` | — | — | 4.00 |

## Ba nguồn tải lớn nhất

| # | Nguồn | Chi tiết | Phần ngân sách |
|---|---|---|---|
| 1 | Vòng vẽ 3D (rAF/WebGPU) không có trần FPS | FPS trung bình 46.35, CPU luồng chính 98.6 % một lõi | 9.86× (ngân sách 10 cpu_pct) |
| 2 | Nhịp request trạm (metrics/heat/heartbeat/frames) | 388 request/phút | 6.47× (ngân sách 60 req_per_min) |
| 3 | Pha ẩn không giảm tải (rAF vẫn chạy) | pha B: FPS 1, CPU 11.4 % | 1.14× (ngân sách 10 cpu_pct) |

Ngân sách xếp hạng: CPU 10 %/lõi, WS 50 MB/giờ, đĩa 50 MB/giờ, request 60/phút (theo docs/PERFORMANCE-24-7.md mục 4).

## Lỗi trang ghi được (40 dòng đầu)

- web console ReferenceError: ws is not defined
    at rebWs (<anonymous>:14:46)
    at new WS (<anonymous>:15:88)
    at i (http://127.0.0.1:5173/assets/Pager-CdSY7v--.js:40
- web PAGEERROR ReferenceError: ws is not defined
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


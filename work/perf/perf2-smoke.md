# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)

Sinh lúc 2026-10-18T02:06:41.311Z. Mỗi pha 1 phút, lấy mẫu mỗi 30 s. Trang: `http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=http://127.0.0.1:8940` và `http://127.0.0.1:5173/index-officer.html` (đã đăng nhập: có).

| Pha | Mô tả | Tốc độ | visibilityState tab app |
|---|---|---|---|
| A | tab app hiện, ×1 | ×1 | visible |
| B | tab app ẩn (trang trống đè lên), ×1 | ×1 | visible |
| C | tab app hiện, tua ×10 | ×10 | visible |

## Trung bình / đỉnh mỗi cột theo pha

| Cột | A TB | B TB | C TB | A đỉnh | B đỉnh | C đỉnh |
|---|---|---|---|---|---|---|
| FPS (rAF/giây) | 87.30 | 1.00 | 79.50 | 87.40 | 1.00 | 81.40 |
| FPS app báo | — | — | — | — | — | — |
| Heap JS (MB) | 188.63 | 149.16 | 136.44 | 196.56 | 173.51 | 141.93 |
| CPU luồng chính (% lõi) | 38.00 | 10.70 | 42.55 | 42.80 | 10.80 | 42.90 |
| CPU ms/giây | 380.10 | 107.10 | 425.75 | 428.10 | 107.70 | 429.20 |
| Request tới backend / 30 s | 113.50 | 78.50 | 132.50 | 151.00 | 86.00 | 138.00 |
| Byte WS web nhận / 30 s | 6780137.00 | 5559281.00 | 4705397.00 | 8434301.00 | 6016290.00 | 5528067.00 |
| WS frame / 30 s | 121.00 | 68.50 | 157.00 | 166.00 | 74.00 | 174.00 |
| smart-traffic.db (byte) | 4349952.00 | 4386816.00 | 4456448.00 | 4358144.00 | 4395008.00 | 4481024.00 |
| var/frames (byte) | 60125453.00 | 60124537.00 | 61768806.50 | 60127242.00 | 60125053.00 | 62743172.00 |
| sim.t (giây sim) | 56.5 | 83.8 | 442.9 | 71.5 | 87.6 | 548.6 |
| station_metrics (dòng) | 129.0 | 142.0 | 152.0 | 132.0 | 145.0 | 152.0 |
| signal_state_log (dòng) | 774.0 | 852.0 | 912.0 | 792.0 | 870.0 | 912.0 |
| kpi_samples (dòng) | 129.0 | 142.0 | 152.0 | 132.0 | 145.0 | 152.0 |
| violations (dòng) | 334.0 | 334.0 | 338.0 | 334.0 | 334.0 | 338.0 |

## Tốc độ tăng theo giờ (đầu → cuối pha)

| Chỉ số | A | B | C |
|---|---|---|---|
| Heap JS (MB/giờ) | 1903.200 | -5845.200 | 1317.600 |
| DB (MB/giờ) | 1.875 | 1.875 | 5.625 |
| var/frames (MB/giờ) | 0.409 | -0.118 | 223.015 |
| Request backend (mỗi giờ) | 27240.000 | 18840.000 | 31800.000 |
| sim.t (giây sim / giây thực) | 3588.000 | 900.000 | 25380.000 |
| station_metrics (dòng/giờ) | 720.0 | 720.0 | 0.0 |
| signal_state_log (dòng/giờ) | 4320.0 | 4320.0 | 0.0 |
| kpi_samples (dòng/giờ) | 720.0 | 720.0 | 0.0 |
| violations (dòng/giờ) | 0.0 | 0.0 | 0.0 |
| Đĩa tổng (MB/giờ) | 2.284 | 1.757 | 228.640 |

## Request tới backend theo đường dẫn (request/phút)

| Đường dẫn | A | B | C |
|---|---|---|---|
| `/api/v1/auth/login` | 2.00 | — | — |
| `/api/v1/auth/me` | 2.00 | — | — |
| `/api/v1/officer/kpi` | 14.00 | 10.00 | 18.00 |
| `/api/v1/officer/violations` | 28.00 | 20.00 | 36.00 |
| `/api/v1/station/frames` | 320.00 | 246.00 | 196.00 |
| `/api/v1/station/heartbeat` | 14.00 | 8.00 | 8.00 |
| `/api/v1/station/heat` | 16.00 | 2.00 | 92.00 |
| `/api/v1/station/metrics` | 38.00 | 26.00 | 26.00 |
| `/api/v1/station/violations` | 20.00 | 2.00 | 64.00 |
| `/api/v1/station/violations/VP-20261018-000001/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000002/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000003/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000004/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000005/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000006/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000007/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000008/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000009/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000010/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000011/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000012/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000013/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000014/evidence` | — | — | 6.00 |
| `/api/v1/station/violations/VP-20261018-000015/evidence` | — | — | 6.00 |

## Ba nguồn tải lớn nhất

| # | Nguồn | Chi tiết | Phần ngân sách |
|---|---|---|---|
| 1 | Khung stream camera 1280×720 gửi lên backend rồi broadcast base64 | 1551.85 MB/giờ tới web; 320 request/phút /station/frames | 31.04× (ngân sách 50 ws_mb_per_hour) |
| 2 | Nhịp request trạm (metrics/heat/heartbeat/frames) | 454 request/phút | 7.57× (ngân sách 60 req_per_min) |
| 3 | Vòng vẽ 3D (rAF/WebGPU) không có trần FPS | FPS trung bình 87.3, CPU luồng chính 38 % một lõi | 3.80× (ngân sách 10 cpu_pct) |

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


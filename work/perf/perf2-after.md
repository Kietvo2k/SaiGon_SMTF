# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)

Sinh lúc 2026-10-18T02:16:53.591Z. Mỗi pha 3 phút, lấy mẫu mỗi 30 s. Trang: `http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=http://127.0.0.1:8940` và `http://127.0.0.1:5173/index-officer.html` (đã đăng nhập: có).

| Pha | Mô tả | Tốc độ | visibilityState tab app |
|---|---|---|---|
| A | tab app hiện, ×1 | ×1 | visible |
| B | tab app ẩn (trang trống đè lên), ×1 | ×1 | visible |
| C | tab app hiện, tua ×10 | ×10 | visible |

## Trung bình / đỉnh mỗi cột theo pha

| Cột | A TB | B TB | C TB | A đỉnh | B đỉnh | C đỉnh |
|---|---|---|---|---|---|---|
| FPS (rAF/giây) | 89.08 | 1.00 | 80.95 | 91.60 | 1.00 | 85.90 |
| FPS app báo | — | — | — | — | — | — |
| Heap JS (MB) | 175.07 | 131.68 | 134.85 | 192.44 | 143.38 | 150.88 |
| CPU luồng chính (% lõi) | 34.88 | 10.62 | 43.00 | 43.50 | 11.00 | 47.20 |
| CPU ms/giây | 348.67 | 106.28 | 429.93 | 434.60 | 110.10 | 472.00 |
| Request tới backend / 30 s | 88.33 | 74.67 | 126.67 | 149.00 | 85.00 | 147.00 |
| Byte WS web nhận / 30 s | 5699770.33 | 5470882.67 | 4578312.67 | 8266252.00 | 5746200.00 | 5180695.00 |
| WS frame / 30 s | 95.67 | 69.00 | 159.50 | 165.00 | 88.00 | 198.00 |
| smart-traffic.db (byte) | 4556800.00 | 4652373.33 | 4893354.67 | 4595712.00 | 4698112.00 | 5033984.00 |
| var/frames (byte) | 62750769.50 | 62787434.67 | 69113199.83 | 62752835.00 | 62945637.00 | 73725146.00 |
| sim.t (giây sim) | 116.7 | 218.9 | 1023.1 | 191.7 | 237.5 | 1556.2 |
| station_metrics (dòng) | 186.0 | 223.0 | 260.0 | 201.0 | 238.0 | 278.0 |
| signal_state_log (dòng) | 1116.0 | 1338.0 | 1560.0 | 1206.0 | 1428.0 | 1668.0 |
| kpi_samples (dòng) | 186.0 | 223.0 | 260.0 | 201.0 | 238.0 | 278.0 |
| violations (dòng) | 349.0 | 349.2 | 382.8 | 349.0 | 350.0 | 409.0 |

## Tốc độ tăng theo giờ (đầu → cuối pha)

| Chỉ số | A | B | C |
|---|---|---|---|
| Heap JS (MB/giờ) | -1139.280 | -197.280 | 343.440 |
| DB (MB/giờ) | 1.875 | 1.969 | 6.188 |
| var/frames (MB/giờ) | -0.027 | 4.425 | 198.111 |
| Request backend (mỗi giờ) | 12720.000 | 10752.000 | 18240.000 |
| sim.t (giây sim / giây thực) | 3600.000 | 895.200 | 25608.000 |
| station_metrics (dòng/giờ) | 720.0 | 720.0 | 792.0 |
| signal_state_log (dòng/giờ) | 4320.0 | 4320.0 | 4752.0 |
| kpi_samples (dòng/giờ) | 720.0 | 720.0 | 792.0 |
| violations (dòng/giờ) | 0.0 | 24.0 | 1128.0 |
| Đĩa tổng (MB/giờ) | 1.848 | 6.394 | 204.299 |

## Request tới backend theo đường dẫn (request/phút)

| Đường dẫn | A | B | C |
|---|---|---|---|
| `/api/v1/auth/login` | 0.40 | — | — |
| `/api/v1/auth/me` | 0.40 | — | — |
| `/api/v1/officer/kpi` | 6.00 | 5.60 | 10.00 |
| `/api/v1/officer/violations` | 12.00 | 11.20 | 20.00 |
| `/api/v1/station/frames` | 154.40 | 138.00 | 102.80 |
| `/api/v1/station/heartbeat` | 6.00 | 4.80 | 4.80 |
| `/api/v1/station/heat` | 8.00 | 1.60 | 52.80 |
| `/api/v1/station/metrics` | 17.20 | 14.80 | 14.80 |
| `/api/v1/station/violations` | 7.60 | 2.00 | 28.00 |
| `/api/v1/station/violations/VP-20261018-000016/evidence` | — | 1.20 | — |
| `/api/v1/station/violations/VP-20261018-000017/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000018/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000019/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000020/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000021/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000022/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000023/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000024/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000025/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000026/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000027/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000028/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000029/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000030/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000031/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000032/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000033/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000034/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000035/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000036/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000037/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000038/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000039/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000040/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000041/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000042/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000043/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000044/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000045/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000046/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000047/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000048/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000049/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000050/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000051/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000052/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000053/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000054/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000055/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000056/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000057/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000058/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000059/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000060/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000061/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000062/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000063/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000064/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000065/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000066/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000067/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000068/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000069/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000070/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000071/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000072/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000073/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000074/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261018-000075/evidence` | — | — | 1.20 |

## Ba nguồn tải lớn nhất

| # | Nguồn | Chi tiết | Phần ngân sách |
|---|---|---|---|
| 1 | Khung stream camera 1280×720 gửi lên backend rồi broadcast base64 | 782.744 MB/giờ tới web; 154.4 request/phút /station/frames | 15.65× (ngân sách 50 ws_mb_per_hour) |
| 2 | Nhịp request trạm (metrics/heat/heartbeat/frames) | 212 request/phút | 3.53× (ngân sách 60 req_per_min) |
| 3 | Vòng vẽ 3D (rAF/WebGPU) không có trần FPS | FPS trung bình 89.08, CPU luồng chính 34.88 % một lõi | 3.49× (ngân sách 10 cpu_pct) |

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


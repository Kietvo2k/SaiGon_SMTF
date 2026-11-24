# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)

Sinh lúc 2026-10-17T20:59:09.081Z. Mỗi pha 3 phút, lấy mẫu mỗi 30 s. Trang: `http://127.0.0.1:8821/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=http://127.0.0.1:8900` và `http://127.0.0.1:5173/index-officer.html` (đã đăng nhập: có).

| Pha | Mô tả | Tốc độ | visibilityState tab app |
|---|---|---|---|
| A | tab app hiện, ×1 | ×1 | visible |
| B | tab app ẩn (trang trống đè lên), ×1 | ×1 | visible |
| C | tab app hiện, tua ×10 | ×10 | visible |

## Trung bình / đỉnh mỗi cột theo pha

| Cột | A TB | B TB | C TB | A đỉnh | B đỉnh | C đỉnh |
|---|---|---|---|---|---|---|
| FPS (rAF/giây) | 50.57 | 1.00 | 47.33 | 51.00 | 1.00 | 48.70 |
| FPS app báo | — | — | — | — | — | — |
| Heap JS (MB) | 183.05 | 127.01 | 138.75 | 200.55 | 134.73 | 149.70 |
| CPU luồng chính (% lõi) | 96.27 | 11.27 | 96.18 | 96.60 | 11.80 | 96.50 |
| CPU ms/giây | 962.63 | 112.73 | 962.00 | 965.70 | 118.50 | 965.40 |
| Request tới backend / 30 s | 85.67 | 75.17 | 137.50 | 148.00 | 86.00 | 146.00 |
| Byte WS web nhận / 30 s | 5250703.33 | 5481576.33 | 4105446.50 | 7934369.00 | 5818602.00 | 5370199.00 |
| WS frame / 30 s | 91.67 | 72.67 | 166.00 | 164.00 | 106.00 | 193.00 |
| smart-traffic.db (byte) | 3811328.00 | 3919872.00 | 4156757.33 | 3858432.00 | 3960832.00 | 4304896.00 |
| var/frames (byte) | 48568165.67 | 48866571.00 | 55116578.17 | 48626205.00 | 48995659.00 | 60108221.00 |
| sim.t (giây sim) | 116.8 | 218.9 | 1337.0 | 191.6 | 237.4 | 2082.5 |
| station_metrics (dòng) | 28.0 | 65.0 | 98.6 | 43.0 | 80.0 | 113.0 |
| signal_state_log (dòng) | 168.0 | 390.0 | 591.6 | 258.0 | 480.0 | 678.0 |
| kpi_samples (dòng) | 28.0 | 65.0 | 98.6 | 43.0 | 80.0 | 113.0 |
| violations (dòng) | 269.7 | 271.3 | 303.4 | 270.0 | 272.0 | 334.0 |

## Tốc độ tăng theo giờ (đầu → cuối pha)

| Chỉ số | A | B | C |
|---|---|---|---|
| Heap JS (MB/giờ) | -1258.800 | 139.200 | -132.240 |
| DB (MB/giờ) | 2.063 | 1.969 | 6.469 |
| var/frames (MB/giờ) | 3.841 | 8.501 | 216.362 |
| Request backend (mỗi giờ) | 12336.000 | 10824.000 | 19800.000 |
| sim.t (giây sim / giây thực) | 3597.600 | 892.800 | 35858.400 |
| station_metrics (dòng/giờ) | 720.0 | 720.0 | 624.0 |
| signal_state_log (dòng/giờ) | 4320.0 | 4320.0 | 3744.0 |
| kpi_samples (dòng/giờ) | 720.0 | 720.0 | 624.0 |
| violations (dòng/giờ) | 24.0 | 48.0 | 1272.0 |
| Đĩa tổng (MB/giờ) | 5.904 | 10.470 | 222.831 |

## Request tới backend theo đường dẫn (request/phút)

| Đường dẫn | A | B | C |
|---|---|---|---|
| `/api/v1/auth/login` | 0.40 | — | — |
| `/api/v1/auth/me` | 0.40 | — | — |
| `/api/v1/media/stream/CAM-HX-001` | 0.40 | — | — |
| `/api/v1/officer/kpi` | 6.40 | 5.60 | 12.40 |
| `/api/v1/officer/violations` | 12.80 | 11.20 | 24.80 |
| `/api/v1/station/frames` | 142.00 | 137.60 | 92.80 |
| `/api/v1/station/heartbeat` | 5.60 | 5.20 | 4.80 |
| `/api/v1/station/heat` | 8.00 | 1.60 | 74.00 |
| `/api/v1/station/metrics` | 17.20 | 14.80 | 14.80 |
| `/api/v1/station/violations` | 11.20 | 2.00 | 32.00 |
| `/api/v1/station/violations/VP-20261017-000270/evidence` | 1.20 | — | — |
| `/api/v1/station/violations/VP-20261017-000271/evidence` | — | 1.20 | — |
| `/api/v1/station/violations/VP-20261017-000272/evidence` | — | 1.20 | — |
| `/api/v1/station/violations/VP-20261017-000273/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000274/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000275/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000276/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000277/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000278/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000279/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000280/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000281/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000282/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000283/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000284/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000285/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000286/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000287/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000288/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000289/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000290/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000291/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000292/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000293/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000294/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000295/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000296/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000297/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000298/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000299/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000300/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000301/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000302/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000303/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000304/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000305/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000306/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000307/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000308/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000309/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000310/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000311/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000312/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000313/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000314/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000315/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000316/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000317/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000318/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000319/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000320/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000321/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000322/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000323/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000324/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000325/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000326/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000327/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000328/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000329/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000330/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000331/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000332/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000333/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000334/evidence` | — | — | 1.20 |

## Ba nguồn tải lớn nhất

| # | Nguồn | Chi tiết | Phần ngân sách |
|---|---|---|---|
| 1 | Khung stream camera 1280×720 gửi lên backend rồi broadcast base64 | 721.074 MB/giờ tới web; 142 request/phút /station/frames | 14.42× (ngân sách 50 ws_mb_per_hour) |
| 2 | Vòng vẽ 3D (rAF/WebGPU) không có trần FPS | FPS trung bình 50.57, CPU luồng chính 96.27 % một lõi | 9.63× (ngân sách 10 cpu_pct) |
| 3 | Nhịp request trạm (metrics/heat/heartbeat/frames) | 205.59999999999997 request/phút | 3.43× (ngân sách 60 req_per_min) |

Ngân sách xếp hạng: CPU 10 %/lõi, WS 50 MB/giờ, đĩa 50 MB/giờ, request 60/phút (theo docs/PERFORMANCE-24-7.md mục 4).

## Lỗi trang ghi được (40 dòng đầu)

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


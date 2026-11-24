# PERF-1 · Số nền tài nguyên chạy dài (app=smart, khu Bắc)

Sinh lúc 2026-10-17T16:29:42.072Z. Mỗi pha 3 phút, lấy mẫu mỗi 30 s. Trang: `http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview&api=http://127.0.0.1:8940` và `http://127.0.0.1:5173/index-officer.html` (đã đăng nhập: có).

| Pha | Mô tả | Tốc độ | visibilityState tab app |
|---|---|---|---|
| A | tab app hiện, ×1 | ×1 | visible |
| B | tab app ẩn (trang trống đè lên), ×1 | ×1 | visible |
| C | tab app hiện, tua ×10 | ×10 | visible |

## Trung bình / đỉnh mỗi cột theo pha

| Cột | A TB | B TB | C TB | A đỉnh | B đỉnh | C đỉnh |
|---|---|---|---|---|---|---|
| FPS (rAF/giây) | 58.10 | 1.00 | 53.83 | 58.60 | 1.00 | 56.20 |
| FPS app báo | — | — | — | — | — | — |
| Heap JS (MB) | 184.77 | 135.85 | 152.06 | 209.09 | 148.99 | 164.00 |
| CPU luồng chính (% lõi) | 98.02 | 11.22 | 96.65 | 98.20 | 12.00 | 98.10 |
| CPU ms/giây | 980.27 | 112.15 | 966.20 | 982.30 | 119.90 | 980.70 |
| Request tới backend / 30 s | 90.50 | 75.83 | 146.50 | 143.00 | 88.00 | 183.00 |
| Byte WS web nhận / 30 s | 5159732.67 | 5518294.83 | 3749995.50 | 7513881.00 | 5820121.00 | 5127984.00 |
| WS frame / 30 s | 92.50 | 69.83 | 160.33 | 152.00 | 87.00 | 195.00 |
| smart-traffic.db (byte) | 4801194.67 | 4909738.67 | 5145941.33 | 4849664.00 | 4952064.00 | 5275648.00 |
| var/frames (byte) | 37220356.33 | 38233671.33 | 44759970.33 | 37923889.00 | 38487432.00 | 48453624.00 |
| sim.t (giây sim) | 116.9 | 219.1 | 1335.7 | 191.8 | 237.8 | 2079.7 |
| station_metrics (dòng) | 418.0 | 455.0 | 491.0 | 433.0 | 470.0 | 503.0 |
| signal_state_log (dòng) | 2508.0 | 2730.0 | 2946.0 | 2598.0 | 2820.0 | 3018.0 |
| kpi_samples (dòng) | 418.0 | 455.0 | 491.0 | 433.0 | 470.0 | 503.0 |
| violations (dòng) | 207.0 | 212.7 | 248.3 | 211.0 | 214.0 | 269.0 |

## Tốc độ tăng theo giờ (đầu → cuối pha)

| Chỉ số | A | B | C |
|---|---|---|---|
| Heap JS (MB/giờ) | -697.440 | -268.861 | 100.080 |
| DB (MB/giờ) | 2.250 | 1.967 | 5.906 |
| var/frames (MB/giờ) | 28.302 | 8.945 | 176.731 |
| Request backend (mỗi giờ) | 13032.000 | 10912.700 | 21096.000 |
| sim.t (giây sim / giây thực) | 3600.000 | 899.400 | 35774.400 |
| station_metrics (dòng/giờ) | 720.0 | 719.5 | 480.0 |
| signal_state_log (dòng/giờ) | 4320.0 | 4317.1 | 2880.0 |
| kpi_samples (dòng/giờ) | 720.0 | 719.5 | 480.0 |
| violations (dòng/giờ) | 168.0 | 48.0 | 840.0 |
| Đĩa tổng (MB/giờ) | 30.552 | 10.912 | 182.637 |

## Request tới backend theo đường dẫn (request/phút)

| Đường dẫn | A | B | C |
|---|---|---|---|
| `/api/v1/auth/login` | 0.40 | — | — |
| `/api/v1/auth/me` | 0.40 | — | — |
| `/api/v1/officer/kpi` | 9.20 | 6.00 | 26.80 |
| `/api/v1/officer/violations` | 18.40 | 11.99 | 53.60 |
| `/api/v1/station/frames` | 137.20 | 137.11 | 84.00 |
| `/api/v1/station/heartbeat` | 5.60 | 5.20 | 4.80 |
| `/api/v1/station/heat` | 8.00 | 1.60 | 73.60 |
| `/api/v1/station/metrics` | 17.20 | 14.79 | 14.80 |
| `/api/v1/station/violations` | 12.40 | 1.60 | 28.00 |
| `/api/v1/station/violations/VP-20261017-000205/evidence` | 1.20 | — | — |
| `/api/v1/station/violations/VP-20261017-000206/evidence` | 1.20 | — | — |
| `/api/v1/station/violations/VP-20261017-000207/evidence` | 1.20 | — | — |
| `/api/v1/station/violations/VP-20261017-000208/evidence` | 1.20 | — | — |
| `/api/v1/station/violations/VP-20261017-000209/evidence` | 1.20 | — | — |
| `/api/v1/station/violations/VP-20261017-000210/evidence` | 1.20 | — | — |
| `/api/v1/station/violations/VP-20261017-000211/evidence` | 1.20 | — | — |
| `/api/v1/station/violations/VP-20261017-000212/evidence` | — | 1.20 | — |
| `/api/v1/station/violations/VP-20261017-000213/evidence` | — | 1.20 | — |
| `/api/v1/station/violations/VP-20261017-000214/evidence` | — | 1.20 | — |
| `/api/v1/station/violations/VP-20261017-000215/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000216/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000217/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000218/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000219/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000220/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000221/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000222/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000223/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000224/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000225/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000226/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000227/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000228/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000229/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000230/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000231/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000232/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000233/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000234/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000235/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000236/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000237/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000238/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000239/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000240/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000241/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000242/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000243/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000244/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000245/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000246/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000247/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000248/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000249/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000250/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000251/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000252/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000253/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000254/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000255/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000256/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000257/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000258/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000259/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000260/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000261/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000262/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000263/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000264/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000265/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000266/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000267/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000268/evidence` | — | — | 1.20 |
| `/api/v1/station/violations/VP-20261017-000269/evidence` | — | — | 1.20 |

## Ba nguồn tải lớn nhất

| # | Nguồn | Chi tiết | Phần ngân sách |
|---|---|---|---|
| 1 | Khung stream camera 1280×720 gửi lên backend rồi broadcast base64 | 708.581 MB/giờ tới web; 137.2 request/phút /station/frames | 14.17× (ngân sách 50 ws_mb_per_hour) |
| 2 | Vòng vẽ 3D (rAF/WebGPU) không có trần FPS | FPS trung bình 58.1, CPU luồng chính 98.02 % một lõi | 9.80× (ngân sách 10 cpu_pct) |
| 3 | Nhịp request trạm (metrics/heat/heartbeat/frames) | 217.1999999999999 request/phút | 3.62× (ngân sách 60 req_per_min) |

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
- web console Failed to load resource: net::ERR_CONTENT_LENGTH_MISMATCH
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 409 (Conflict)
- app console Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- app console Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- app console Failed to load resource: the server responded with a status of 429 (Too Many Requests)
- app console Failed to load resource: the server responded with a status of 429 (Too Many Requests)


# A1 — peak-hang-xanh (cửa sổ 300–1800 s)

Thời lượng: 1800 s/seed · tập seed: 31031, 31032, 31033, 31034, 31035

| seed | A1 fixed (s/xe) | A1 smart (s/xe) | Δdelay | qua vạch fixed | qua vạch smart | Δthông lượng |
|---|---|---|---|---|---|---|
| 31031 | 85.391 | 73.876 | 13.5 % | 3165 | 3395 | -7.3 % |
| 31032 | 72.704 | 61.576 | 15.3 % | 3413 | 3697 | -8.3 % |
| 31033 | 70.985 | 45.982 | 35.2 % | 3550 | 4447 | -25.3 % |
| 31034 | 83.34 | 63.293 | 24.1 % | 3083 | 3409 | -10.6 % |
| 31035 | 59.64 | 50.314 | 15.6 % | 3987 | 4259 | -6.8 % |
| **TB** | | | **20.7 %** | | | -11.7 % |

- TB Δdelay ≥ 15 %: **ĐẠT**
- Không seed nào tệ hơn fixed: **ĐẠT**
- Thông lượng không giảm > 5 %: **ĐẠT** (Δthông lượng TB -11.7 %; dương = smart ít xe qua hơn)

Tham số controller: `{"yellowS":3,"allRedS":2,"minGreenS":8,"maxGreenS":45,"decisionIntervalS":1,"switchMargin":0.15,"fixed":{"green0S":22,"green1S":16},"clusterM":80,"algorithm":"max-pressure"}`

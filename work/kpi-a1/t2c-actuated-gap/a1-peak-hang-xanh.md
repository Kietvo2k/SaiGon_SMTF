# A1 — peak-hang-xanh (cửa sổ 300–1800 s)

Thời lượng: 900 s/seed · tập seed: 31031, 31032, 31033, 31034, 31035

| seed | A1 fixed (s/xe) | A1 smart (s/xe) | Δdelay | qua vạch fixed | qua vạch smart | Δthông lượng |
|---|---|---|---|---|---|---|
| 31031 | 72.444 | 135.65 | -87.2 % | 1304 | 658 | 49.5 % |
| 31032 | 50.821 | 118.792 | -133.7 % | 1490 | 672 | 54.9 % |
| 31033 | 57.237 | 125.181 | -118.7 % | 1444 | 693 | 52.0 % |
| 31034 | 65.203 | 120.796 | -85.3 % | 1270 | 699 | 45.0 % |
| 31035 | 58.66 | 133.43 | -127.5 % | 1595 | 636 | 60.1 % |
| **TB** | | | **-110.5 %** | | | 52.3 % |

- TB Δdelay ≥ 15 %: **CHƯA ĐẠT**
- Không seed nào tệ hơn fixed: **CHƯA ĐẠT**
- Thông lượng không giảm > 5 %: **CHƯA ĐẠT** (Δthông lượng TB 52.3 %; dương = smart ít xe qua hơn)

Tham số controller: `{"yellowS":3,"allRedS":2,"minGreenS":8,"maxGreenS":45,"decisionIntervalS":1,"switchMargin":0.15,"fixed":{"green0S":22,"green1S":16},"clusterM":80,"algorithm":"actuated-gap"}`

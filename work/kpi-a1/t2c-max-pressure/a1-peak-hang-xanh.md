# A1 — peak-hang-xanh (cửa sổ 300–1800 s)

Thời lượng: 900 s/seed · tập seed: 31031, 31032, 31033, 31034, 31035

| seed | A1 fixed (s/xe) | A1 smart (s/xe) | Δdelay | qua vạch fixed | qua vạch smart | Δthông lượng |
|---|---|---|---|---|---|---|
| 31031 | 72.444 | 63.216 | 12.7 % | 1304 | 1312 | -0.6 % |
| 31032 | 50.821 | 47.956 | 5.6 % | 1490 | 1756 | -17.9 % |
| 31033 | 57.237 | 45.797 | 20.0 % | 1444 | 1724 | -19.4 % |
| 31034 | 65.203 | 46.017 | 29.4 % | 1270 | 1652 | -30.1 % |
| 31035 | 58.66 | 48.115 | 18.0 % | 1595 | 1769 | -10.9 % |
| **TB** | | | **17.2 %** | | | -15.8 % |

- TB Δdelay ≥ 15 %: **ĐẠT**
- Không seed nào tệ hơn fixed: **ĐẠT**
- Thông lượng không giảm > 5 %: **ĐẠT** (Δthông lượng TB -15.8 %; dương = smart ít xe qua hơn)

Tham số controller: `{"yellowS":3,"allRedS":2,"minGreenS":8,"maxGreenS":45,"decisionIntervalS":1,"switchMargin":0.15,"fixed":{"green0S":22,"green1S":16},"clusterM":80,"algorithm":"max-pressure"}`

# A1 — peak-hang-xanh (cửa sổ 300–1800 s)

Thời lượng: 900 s/seed · tập seed: 31031, 31032, 31033, 31034, 31035

| seed | A1 fixed (s/xe) | A1 smart (s/xe) | Δdelay | qua vạch fixed | qua vạch smart | Δthông lượng |
|---|---|---|---|---|---|---|
| 31031 | 72.444 | 68.49 | 5.5 % | 1304 | 1413 | -8.4 % |
| 31032 | 50.821 | 55.01 | -8.2 % | 1490 | 1590 | -6.7 % |
| 31033 | 57.237 | 49.045 | 14.3 % | 1444 | 1674 | -15.9 % |
| 31034 | 65.203 | 42.638 | 34.6 % | 1270 | 1723 | -35.7 % |
| 31035 | 58.66 | 54.029 | 7.9 % | 1595 | 1551 | 2.8 % |
| **TB** | | | **10.8 %** | | | -12.8 % |

- TB Δdelay ≥ 15 %: **CHƯA ĐẠT**
- Không seed nào tệ hơn fixed: **CHƯA ĐẠT**
- Thông lượng không giảm > 5 %: **ĐẠT** (Δthông lượng TB -12.8 %; dương = smart ít xe qua hơn)

Tham số controller: `{"yellowS":3,"allRedS":2,"minGreenS":8,"maxGreenS":45,"decisionIntervalS":3,"switchMargin":0.15,"fixed":{"green0S":22,"green1S":16},"clusterM":80,"algorithm":"max-pressure"}`

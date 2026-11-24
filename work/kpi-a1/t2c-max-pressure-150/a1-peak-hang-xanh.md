# A1 — peak-hang-xanh (cửa sổ 300–1800 s)

Thời lượng: 900 s/seed · tập seed: 31031, 31032, 31033, 31034, 31035

| seed | A1 fixed (s/xe) | A1 smart (s/xe) | Δdelay | qua vạch fixed | qua vạch smart | Δthông lượng |
|---|---|---|---|---|---|---|
| 31031 | 72.444 | 67.687 | 6.6 % | 1304 | 1309 | -0.4 % |
| 31032 | 50.821 | 56.864 | -11.9 % | 1490 | 1438 | 3.5 % |
| 31033 | 57.237 | 52.01 | 9.1 % | 1444 | 1542 | -6.8 % |
| 31034 | 65.203 | 47.979 | 26.4 % | 1270 | 1562 | -23.0 % |
| 31035 | 58.66 | 57.354 | 2.2 % | 1595 | 1658 | -3.9 % |
| **TB** | | | **6.5 %** | | | -6.1 % |

- TB Δdelay ≥ 15 %: **CHƯA ĐẠT**
- Không seed nào tệ hơn fixed: **CHƯA ĐẠT**
- Thông lượng không giảm > 5 %: **ĐẠT** (Δthông lượng TB -6.1 %; dương = smart ít xe qua hơn)

Tham số controller: `{"yellowS":3,"allRedS":2,"minGreenS":8,"maxGreenS":45,"decisionIntervalS":1,"switchMargin":0.15,"fixed":{"green0S":22,"green1S":16},"clusterM":80,"algorithm":"max-pressure-150"}`

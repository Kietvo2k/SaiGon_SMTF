# A1 — peak-hang-xanh (cửa sổ 300–1800 s)

Thời lượng: 900 s/seed · tập seed: 31031, 31032, 31033, 31034, 31035

| seed | A1 fixed (s/xe) | A1 smart (s/xe) | Δdelay | qua vạch fixed | qua vạch smart | Δthông lượng |
|---|---|---|---|---|---|---|
| 31031 | 72.444 | 67.038 | 7.5 % | 1304 | 1394 | -6.9 % |
| 31032 | 50.821 | 49.62 | 2.4 % | 1490 | 1434 | 3.8 % |
| 31033 | 57.237 | 51.907 | 9.3 % | 1444 | 1579 | -9.3 % |
| 31034 | 65.203 | 44.04 | 32.5 % | 1270 | 1777 | -39.9 % |
| 31035 | 58.66 | 58.818 | -0.3 % | 1595 | 1622 | -1.7 % |
| **TB** | | | **10.3 %** | | | -10.8 % |

- TB Δdelay ≥ 15 %: **CHƯA ĐẠT**
- Không seed nào tệ hơn fixed: **CHƯA ĐẠT**
- Thông lượng không giảm > 5 %: **ĐẠT** (Δthông lượng TB -10.8 %; dương = smart ít xe qua hơn)

Tham số controller: `{"yellowS":3,"allRedS":2,"minGreenS":8,"maxGreenS":45,"decisionIntervalS":5,"switchMargin":0.15,"fixed":{"green0S":22,"green1S":16},"clusterM":80,"algorithm":"max-pressure"}`

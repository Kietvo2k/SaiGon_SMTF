# A1 — peak-hang-xanh (cửa sổ 300–1800 s)

Thời lượng: 1800 s/seed · tập seed: 31036, 31037, 31038, 31039, 31040

| seed | A1 fixed (s/xe) | A1 smart (s/xe) | Δdelay | qua vạch fixed | qua vạch smart | Δthông lượng |
|---|---|---|---|---|---|---|
| 31036 | 54.02 | 52.443 | 2.9 % | 4220 | 4348 | -3.0 % |
| 31037 | 51.774 | 44.639 | 13.8 % | 4063 | 4418 | -8.7 % |
| 31038 | 75.233 | 59.911 | 20.4 % | 3320 | 4110 | -23.8 % |
| 31039 | 76.141 | 84.045 | -10.4 % | 3355 | 3236 | 3.5 % |
| 31040 | 61.414 | 51.546 | 16.1 % | 3657 | 4229 | -15.6 % |
| **TB** | | | **8.6 %** | | | -9.5 % |

- TB Δdelay ≥ 15 %: **CHƯA ĐẠT**
- Không seed nào tệ hơn fixed: **CHƯA ĐẠT**
- Thông lượng không giảm > 5 %: **ĐẠT** (Δthông lượng TB -9.5 %; dương = smart ít xe qua hơn)

Tham số controller: `{"yellowS":3,"allRedS":2,"minGreenS":8,"maxGreenS":45,"decisionIntervalS":1,"switchMargin":0.15,"fixed":{"green0S":22,"green1S":16},"clusterM":80,"algorithm":"max-pressure"}`

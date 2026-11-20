# Runtime public khu Bắc

Lát `CORE-NORTH-DATA-CODE-00` cung cấp dữ liệu public cho `PUB-01`, `SIM-01` và
`CAM-01`. Bộ sinh là `scripts/build_public_north.mjs`, chạy từ root repo và đọc
`outputs/hcmc-poc/data/road-graph-31.json`, `outputs/hcmc-poc/data/scene.json` cùng
đa giác bất biến `regionPolygon('bac')` trong `city-region-31.js`.

## Provenance và hình học

Manifest hiện ghi hash nguồn graph
`1da1f3d4cc8a0e9de2e050f21ee2bf4450cbe4fc9a23e16726f46ef03bdb6149` và scene
`50b89a3b8035ddc23c81ce20590f1274737d7443657fc791f3a6c069cf96dfa2`. Mọi đoạn
đường được cắt theo giao tuyến từng đoạn với đa giác, sau đó tạo node biên có ID
âm tất định. Điểm nguồn giữ `source_node_id`, `layer`, `elevationClass`, hướng,
làn và hình học; node trùng tọa độ khác tầng không bị hợp nhất.

`mapping.json` có `edgeMap`, `nodeMap`, `roadMap`, `junctions` và provenance
graph/scene. `edgeMap` giữ `source_edge_id`, `inside_length_m` và fragment cho
cạnh public; các cạnh nguồn 23217 và 23534 được kiểm độc lập dù cả hai endpoint
nằm ngoài vùng. `junctions` gồm năm cụm HX (`HX-C1` đến `HX-C5`) và năm cụm Bắc
(`Bac-01` đến `Bac-05`). Seed public chỉ chứa mười camera, mỗi camera có
`junction_id`, pose, FOV và phạm vi.

## Runtime và artifact

Classic path giữ script `data/scene.js` và `data/road-graph-31.js`. Smart path
không dùng các script classic: bootstrap fetch
`data/public-north/scene.json` và `data/public-north/road-graph.json`, gán
`window.CITY_DATA`/`window.ROAD_GRAPH_31`, rồi mới import runtime. Vì vậy module
3D không khởi tạo trước khi dữ liệu Bắc hoàn tất. Khi `app=smart`, runtime chỉ
prewarm region `bac`; path classic vẫn prewarm `REGIONS_31` như trước.

Artifact public nằm dưới `outputs/hcmc-poc/data/public-north/` gồm manifest,
graph JSON, scene JSON, mapping và scene JS tương thích. Mỗi file có byte/hash
trong manifest; scene public nhỏ hơn 25 MiB. Seed dẫn xuất nằm riêng dưới
`outputs/smart-traffic/backend/app/seed/public-north/`.

## Giới hạn nghiệm thu

Builder chứng minh cắt vùng, mapping và tải runtime khu Bắc. Nó không thay thế
nghiệm thu định tuyến chống kẹt, A/B nhiều seed, chiếu camera thực, YOLOX-Nano,
WebGL2 trên GPU thật hoặc Docker. Các mục đó phải chạy trên candidate tích hợp
qua cổng release và browser-qa. Cao độ cầu trong nguồn là ước lượng minh họa theo
attribution OSM/ODbL, không phải khảo sát hiện trường.

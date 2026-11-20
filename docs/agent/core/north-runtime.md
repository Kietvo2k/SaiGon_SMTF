# Runtime public khu Bắc

Lát `CORE-NORTH-DATA-CODE-02`, sửa cuối 2/2 tại nền
`77068fbcaddde1bc68fdae16a15a8da424c8e0a6`, triển khai phần dữ liệu và đường nạp
của `PUB-01`, `SIM-01`, `CAM-01`. Nghiệm thu tích hợp và phát hành vẫn thuộc lead.

## Sinh dữ liệu và provenance

```powershell
python -c "import shapely; print(shapely.__version__)"
node scripts/build_public_north.mjs
node scripts/build_public_north.mjs --python python --out-root C:/duong-dan-tuyet-doi/kiem-north
```

Wrapper Node gọi helper Shapely **2.1.2** bằng argv, không qua shell và không
fetch mạng. Helper nhận `--input <json> --output <json>` với
`{schemaVersion:1,polygon,edges,layers}`. `edges[].c` là mảng x/z phẳng; polygon
layers có outer ring và holes. Helper trả `fragments`, các polygon part và
`repairs`. Station đầu/cuối và từng vertex trong fragment dùng chiều dài planar
của polyline nguồn. Profile nội suy theo tỉ lệ `sourceEdge.length / planarLength`
rồi dịch station về đầu fragment; `edge.y` song song geometry.

Nguồn graph SHA-256
`1da1f3d4cc8a0e9de2e050f21ee2bf4450cbe4fc9a23e16726f46ef03bdb6149` và scene
`50b89a3b8035ddc23c81ce20590f1274737d7443657fc791f3a6c069cf96dfa2` được khóa.
Builder hash **raw checkout bytes trước parse**, không chuẩn hóa EOL hay JSON.
Sai digest hoặc Shapely sai phiên bản làm lệnh dừng trước khi thay artifact.
Manifest ghi `sourceBytesRule: "raw checkout bytes; no EOL normalization"`,
digest/size/path tương đối của từng nguồn; không có giờ build hay đường dẫn máy.
Nguồn classic chỉ đọc. `.gitattributes` giữ output dẫn xuất ở UTF-8/LF.

## Graph và scene

Mỗi fragment của một `source.edges[].c` sinh đúng một road và một edge; scene
chiếu từ chính bảng fragment đó. Có **6.815 cạnh nguồn giao dương**, **6.819
fragment**, **5.458 topology node**, **23.131 building part**. Graph và scene
cùng 6.819 road với geometry song song. Cạnh cong, hai đầu ngoài, trùng ranh và
đường ra/vào polygon nhiều lần đều được giữ. Clip theo từng segment với station
liên tục để không nhầm lần đi qua điểm tự giao.

`edge.from/to` giữ identity topology nguồn. Node cắt mang khóa
`cut:<source-edge>:<station>`, khác cạnh/tầng không hợp nhất bằng tọa độ.
`graph.nodes` chỉ chứa endpoint topology thật/cắt; `road.nodes` song song các
shape vertex và có thể chứa ID không nằm trong `graph.nodes`.
`source_shape_node_ids` ghi shape provenance. `road.edges`, `v0/v1`, adjacency
reciprocal và degree đều dựng lại từ cạnh thật. Bearing dùng `atan2(dx,-dz)`.
Giữ hướng/làn/layer/metadata nguồn, profile/y và `rampOf` là ID cụm cầu nguồn.
Bridge cluster remap road references, giữ cluster có ramp còn lại dù main span
ngoài vùng; diagnostics classic không dùng được loại khỏi runtime.

`mapping.json` có join thật hai chiều qua `edgeMap`, `roadMap`, `nodeMap`,
`buildingMap`, `junctions`; không có `source-*` placeholder. Building/water/green
được giao polygon thật, giữ holes và tách MultiPolygon. Building ID nguồn được
giữ lần đầu; source ID lặp và mọi part sau dùng ID dẫn xuất duy nhất, kèm
`source_id`, `source_index`, `fragment`. `make_valid` được ghi vào `repairs` khi
nguồn polygon không hợp lệ.

## Cấu hình và consumer

`runtime-sidecars.json` chứa `signalRows`, `nodeMapUrl`, `camerasUrl`,
`heatHistoryUrl`, provenance và các `globals` dẫn xuất. Street furniture,
footbridge/correction, signature registry phiên bản 31A và semantic records
đều remap theo fragment/part còn lại. Heat public có `ne=6819`, remap mọi cột
nguồn sang fragment tương ứng; đây là lịch sử classic dẫn xuất, chưa phải số đo
benchmark của mạng mới.

Smart HTML tải scene/graph/sidecars public rồi gán globals trước import runtime.
Các script dữ liệu classic chỉ chạy ở nhánh classic. `prepareSmart32` tải seed
public cùng heat một lần trước bộ lọc lock; 12 signal row cấp cùng cấu hình cho
mô phỏng, layout, vạch, đầu đèn, camera/capture/station/perception và forecast.
Classic giữ default `SIGNAL_PLAN_32`; `buildSignalPlan32` chỉ thêm tùy chọn nội bộ
`rows`. Public cần làn tiếp cận thật, không dùng fallback đầu đèn. Vạch dừng lấy
`geo.laneY` tại station làn, và bỏ nhánh nội bộ cùng cụm khỏi vạch đèn.

Seed giữ sáu HX node ID trong năm cụm HX, thêm sáu OSM của năm cụm Bắc:
`Bac-01` gồm `12310895540` và `2351201590`. Tổng cộng 12 OSM trong 10 cụm.
Giữ đủ `CAM-HX-001…010`, thêm `CAM-BAC-001…005`. Pose Bắc lấy anchor node thật,
trục road nguồn theo hạng/tổng chiều dài; yaw/pitch nhìn vào node, có
`pose_source` để tái hiện phép đo. Không đặt trần số camera.

Ba Son, Bạch Đằng, Marina, Grand Marina, Hero Corridor và Identity Facades ngoài
Bắc được guard tại caller; smart không dựng/fetch các mô hình đó. Smart prewarm
chỉ `bac`, không gọi `cityDensity.prewarmRegions()`. Loader chỉ hoàn tất khi
module bắt buộc dựng được và forecast Worker xác nhận ready trên cùng graph và
stats của trạm; lỗi cấu hình/mesh không được đổi thành cảnh không giao thông.

## Kiểm chứng và giới hạn

Tái hiện nền được lưu ở `work/smtf-agent/north-r2-code/`: primary cũ đỏ ENOENT
inventory ignored, consumer thật có 0 làn và fetch hai seed classic rồi thiếu
OSM `366440827`. Đây là hai bằng chứng tách biệt.

Consumer sau sửa dùng width/filter/signal points thật dựng 1.054 drivable edge,
1.333 state, 2.472 làn, 54 spawn lane, 0 oneway lane violation, đủ 10 layout có
làn vào/ra. `createRoadNetwork31` với Three vendor dựng được mesh và profile
source edge 83 (`roadY=2.16` ở đầu nguồn). Ba build (hai tại root, một out-root
sạch) so byte/hash toàn bộ chín output và xác minh mọi input bất biến.

Chromium WebGL2 thực đã phát `citylab:renderer-ready`, `loading.done=true`,
sim tick tiến, đủ signals/capture/heat/forecast/station, không pageerror hay
console warning/error. Năm camera Bắc có JPEG 1280×720; camera HX có seq tăng và
ảnh đổi. Forecast Worker thật trả một kết quả 30 phút, giữ nguyên cơ chế giảm
pool theo ngân sách của worker. Log/ảnh nằm trong thư mục ignored
`work/smtf-agent/north-r2-code/browser-*`; đây là smoke phát triển trên draft.

Code không thay simulation/31A, camera-capture, forecast worker/client, transport,
API/backend hay UI React. Browser QA đúng SHA tích hợp, mọi hướng tại 10 cụm,
resize/fullscreen/Lite, điều tiết/tuyến/đến đích, A/B, AI, GPU tích hợp 8 GB,
Docker và gói public/preview/release vẫn cần kiểm riêng. Cao độ cầu là ước lượng
minh họa OSM/ODbL, không phải khảo sát hiện trường.

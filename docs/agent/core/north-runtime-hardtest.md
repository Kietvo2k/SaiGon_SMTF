# Hardtest NORTH-DATA — sửa cuối 2/2

Task gốc `CORE-NORTH-DATA-TEST-02/hardtest`, base/start
`77068fbcaddde1bc68fdae16a15a8da424c8e0a6`, hợp đồng `public-demo-v1`.
Tác giả test độc lập code. Chỉ sửa chín đường dẫn trong brief; không đổi sản phẩm,
meta/cross, fixture hợp đồng, gate, CI hay hồi quy 31A.

Brief gốc đặt chính tài liệu writable này trong requiredReads, khiến verify
không thể giữ invariant sau bàn giao. Lead cấp
`CORE-NORTH-DATA-TEST-HANDOFF-02` ở worktree sạch cùng base, cùng scope, cùng
vòng 2 trước cherry-pick commit test. RequiredReads mới dùng snapshot tài liệu gốc
SHA-256 `01a151aa9c4c3c6ab80fb28c27a340683d62ed97ef69736a064940b3ee368e19`.
Giữ receipt gốc `b68aebd3b6535aa3cb75a16d70bc5510a87c442bc5780224a7f58f4752bf5f98`
và receipt bàn giao
`3043b62f7b33edfd3cf9dde2df6bce7ad29d7608241ab4f0e3b5f4cf7e5d13e5`.
Đây là sửa thủ tục bàn giao, không thêm vòng sản phẩm.

## Chạy suite

Từ root ứng viên đã ghép code và test:

```powershell
node --test --test-reporter=tap scripts/hardtest/north/north-data.test.mjs scripts/hardtest/north/consumer.test.mjs scripts/hardtest/north/runtime.test.mjs
node scripts/hardtest/north/mutant-red.mjs
```

Cần Node hỗ trợ `node:module.registerHooks` (máy kiểm Node 24.18.1), Python
và Shapely 2.1.2 đã ghim. Oracle không import helper sản phẩm để tính expected.
Fixture polygon tracked được đối chiếu với `regionPolygon('bac')`; suite không
đọc inventory trong `work/`. Source graph raw bytes được ghim
`1da1f3d4cc8a0e9de2e050f21ee2bf4450cbe4fc9a23e16726f46ef03bdb6149`,
scene `50b89a3b8035ddc23c81ce20590f1274737d7443657fc791f3a6c069cf96dfa2`.

Có thể dùng `NORTH_TEST_ROOT` là đường dẫn tuyệt đối tới sản phẩm để chẩn đoán
độc lập mà không chép sản phẩm vào nhánh test. Kết quả đó phải ghi root, SHA,
dirty status và byte/hash đầu vào; không thay cho nghiệm thu SHA tích hợp.
`NORTH_TEST_PYTHON` chọn executable cho seam synthetic nếu máy không dùng
`python` mặc định. CLI builder vẫn được kiểm qua `--out-root` và
`--python`, không thêm tùy chọn sản phẩm.

## Requirement → ca kiểm

| Yêu cầu | Oracle và hành vi đã kiểm |
|---|---|
| PUB-01 | Raw source SHA/polygon, manifest byte/hash, giới hạn Pages, mapping join hai chiều, dense indices, graph/scene/edge geometry và road.edges. BuildingMap duy nhất, metadata, center ngoài hole, diện tích hole nguồn còn nguyên; multipart, enclosing polygon và repair có ghi nhận. |
| SIM-01 | JS tự clip mọi segment theo station, giữ cong/collinear/hai đầu ngoài/point-only/concave/self-cross/đảo hướng; đúng tập 6.815 source edge, từng fragment trong 2 cm, source subsection, endpoint identity, reciprocal adjacency/bearing/boundary, shape IDs, profile/y/rampOf. |
| CAM-01 | Đúng 12 OSM trong 10 cụm, Bac-01 gồm cả 12310895540 và 2351201590. Giữ đủ CAM-HX-001…010, thêm ít nhất CAM-BAC-001…005, tổng >=15 không có trần. Association, FOV/pose, vị trí trong Bắc và phép chiếu ma trận độc lập của góc Bắc vào 1280×720. |
| SIM-01/PUB-01 | buildTrafficNetwork31 dùng width/filter/signalPoints thật; lanes/states/spawn >0, 0 oneway violations. Kiểm config public trên source graph đầy đủ và graph clip. createRoadNetwork31 dùng Three vendor thật, mesh không rỗng, roadY và laneY so profile nguồn, có edge83. Corridor literal gồm nút khác ID cùng tọa độ/khác tầng; nextSt là object. |
| CAM-01/SIM-01 | Layout, approach, incoming/outgoing của mọi cụm; vạch bỏ cạnh nội bộ Bac-01 và lấy y theo geo.laneY. prepareSmart32 thật fetch seed public, public rows đủ 12. |
| PUB-01 | Thực thi inline HTML bootstrap và prewarm block thật bằng VM với fetch/renderer recorder; chỉ public JSON, globals có trước renderer, không script classic, chỉ compile Bắc và không gọi prewarmRegions classic. Lỗi fetch/module bắt buộc chặn readiness. |
| PUB-01/CAM-01 | Thực thi block cài module thật với recorder ở boundary: signals/capture/station nhận cùng camera registry; heat nhận config/history public; forecast nhận cùng graph/stats. Sidecar road/way/building/signature và bridge cluster/wayIds đóng; source_way_ids là provenance riêng. |
| SIM-01 | expandHeatHistory32 thật, ne đúng public edges và mọi cột hourly remap theo source edge tới tất cả fragment. Forecast worker thật init dựng cùng stats và chạy một job từ exportState thật. |
| PUB-01 | Hai build vào out-root riêng phải byte/hash giống nhau và snapshot artifact; lỗi executable Python không thay artifact. |
| CAM-01 release | Kiểm nội dung package scene/graph/config/node_map/cameras, geometry/topology/adjacency và tập ID; bắt scene rỗng dù outer manifest được rehash. |

28 ca chạy, không skip/cancel/todo. Schema road.nodes song song scene.c gồm
shape IDs và cut keys; graph.nodes chỉ endpoint/topology. Không đòi mọi shape ID
có trong graph.nodes. Profile station được đổi đúng hệ chiều dài, không dùng
inside_length_m tự khai làm oracle.

## Red trước code và probe chẩn đoán

Baseline checkout sạch tại `77068fb` chạy primary cũ exit 1 do
`ENOENT north-data-source-inventory.json` trước assertion. Giữ riêng
`work/smtf-agent/logs/north-r2-hardtest/base-portability.tap`; không credit lỗi
này là bắt mutant.

Sau khi thay fixture/oracle, baseline cùng sản phẩm cũ chạy đầy đủ 28 ca:
5 PASS, 23 FAIL, 0 skip/cancel/todo, exit 1. Log
`base-primary-final-2.tap` ở cùng thư mục. Các fail phân biệt geometry/coverage,
closure/topology/profile, registry/camera và runtime public còn thiếu. Nhánh test
giữ sản phẩm nền, vì vậy result bàn giao là `failed` có kỳ vọng.

Probe ngoài nhánh test dùng sản phẩm tại
`C:/Users/Admin/AppData/Local/CodexLauncher/cli-home/worktrees/north-r2-code/tautog`.
HEAD lúc snapshot vẫn `77068fb`, có diff sản phẩm chưa commit; snapshot đầy đủ
trong summary mutant cuối. Source raw SHA vẫn như trên. Manifest cuối SHA-256
`8f173fc4d9feb1d23b33b7ae92ead207df3d502d3112e90d72c356a927074b48`.
Lượt cuối `draft-primary-final.tap`: 28/28 PASS, exit 0, 36,02 giây.
Đây là probe draft, chưa là kết quả nghiệm thu ứng viên sạch.

Các probe trước đã tìm hai lỗi sản phẩm rồi code sửa trong cùng vòng:
14 profile lặp station cuối do số thực, và 15 public building ID trùng vì source
có nhiều part dùng cùng ID. Một probe rebuild đọc artifact trong khi code đang
tái sinh sidecar đã đỏ; lượt cuối khóa snapshot và so byte lại. Giữ nguyên log
`draft-data-1.tap`, `draft-primary-3.tap` và các lượt kế tiếp, không ghi đè.

## Mutant chạy primary thật và phục hồi

`mutant-red.mjs` xuất input cần thiết vào sandbox ignored riêng, sửa file thật,
rehash manifest để assertion semantic chạy, rồi gọi suite chính bằng child
process. Nó yêu cầu đúng assertion/lý do, exit 1 và 0 skip/cancel/todo;
ENOENT, lỗi import/spawn/timeout, SyntaxError/ReferenceError/TypeError không được
credit. Cuối mỗi biến thể phục hồi exact bytes/hash trong finally.

18 biến thể gồm xóa edge giữ map, adjacency rỗng, đổi oneway, mất profile,
station profile sai, mất road.edges, gộp endpoint source, mất OSM thứ hai Bac-01,
mất camera HX (giữ tổng số), pose ngoài Bắc, target sau camera, sidecar road index
cũ, heat ne cũ, bootstrap fetch classic, prewarm tất cả vùng, gọi
prewarmRegions classic, scene rỗng đã rehash và scene rỗng trong package release
đã rehash outer manifest.

Lượt cuối:
`work/smtf-agent/logs/north-r2-hardtest/mutant-4IfEOX/summary.json`:
18/18 bị assertion bắt, 36 restore đúng hash, sourceUnchanged=true và
sandboxRemoved=true. Primary sạch trước/sau đều 28/28, release control và restore
đều xanh; release mutant đỏ tại `CAM artifact scene rỗng`. Mỗi TAP/stderr được
giữ riêng cùng hashes trước/sau.

Hai lượt đầu dừng do điều kiện harness: reason cho endpoint quá hẹp, rồi pattern
OSM khớp hai test thay vì một test targeted. Không tính hai lượt đó là PASS.
Log `mutant-Sr4AWI` và `mutant-BIvMJP` giữ nguyên; cả hai đã restore hash,
source không đổi và sandbox được dọn. Lượt `mutant-0MmKpZ` đạt trước bổ sung
closure wayIds; lượt `mutant-4IfEOX` xác minh lại phiên bản cuối.

## Giới hạn bàn giao

VM chỉ thực thi bootstrap/prewarm và block wiring với boundary recorder; Three
dựng mesh nhưng không render GPU. Phép chiếu camera không chứng minh occlusion,
vạch/đầu đèn trong ảnh, resize/fullscreen/Lite hay byte network của trình duyệt.
Package control là fixture chẩn đoán, không phải gói public đã phát hành.

Lead cần ghép commit code và test, chạy lại explicit suite NORTH, meta/cross
độc lập, review, browser QA đúng SHA, CI/31A/Docker và release. Không suy nghiệm
thu PUB-01/SIM-01/CAM-01 từ probe draft hoặc từ CI chưa đưa NORTH vào inventory.
Nếu ứng viên sửa 2 còn đỏ thì đóng băng theo RULES; không thêm vòng con.

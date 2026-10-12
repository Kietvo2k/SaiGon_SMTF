# Sài Gòn City Lab — Visual Runtime 30B và Hero Corridor

## Bản hiện hành 30B — renderer thật và vùng trình diễn có mật độ cao

Mở [Hero Corridor Lam Sơn–Đồng Khởi](http://127.0.0.1:8768/hcmc-poc/webgpu-materials-24.html?v=30b&view=corridor) hoặc [toàn cảnh](http://127.0.0.1:8768/hcmc-poc/webgpu-materials-24.html?v=30b&view=overview). Batch 30B thay hậu kỳ giả lập bằng graph TSL chính thức của Three.js r186: GTAO có normal/depth prepass, TRAA theo velocity/depth, selective emissive bloom, RCAS sharpen và CSM ba cascade ở cấu hình mặc định `presentation`. `?quality=balanced` giảm mẫu và cascade; `?quality=performance` giữ pipeline depth-aware nhẹ. WebGL 2 tự hạ về `balanced-webgl`.

Ba proxy thô của Nhà hát Thành phố, Continental và Caravelle được loại khỏi mesh hợp nhất và thay bằng vỏ hero có ảnh đúng địa điểm, chi tiết kiến trúc nổi cùng metadata tác giả/giấy phép. Lớp nhận dạng WebGPU bổ sung 11 mặt ảnh đã qua kiểm tra bề mặt; 5 mặt cần tách bề mặt và 1 vỏ lấy mẫu tiếp tục bị giữ lại, không tự động phủ sai. Đường Lam Sơn–Đồng Khởi bám sáu centerline OSM đã lưu và nhận atlas PBR 1K CC0 cho asphalt/vỉa hè, gồm diffuse, normal OpenGL, roughness và AO; bề rộng, đèn và vạch qua đường vẫn là proxy trình diễn. Biên nhận URL và SHA-256 nằm trong `assets/pbr30/SOURCES.json`. Cảnh này là lát cắt chứng minh kiến trúc mở rộng: toàn thành phố giữ LOD vĩ mô, hành lang quan trọng nhận chất lượng cận cảnh, sau này có thể thay bằng BIM/photogrammetry/3DGS mà không đổi renderer.

Xem [kiến trúc và nghiệm thu Runtime 30B](VISUAL-RUNTIME-30B.md). Khởi động lạnh cấu hình trình diễn phải biên dịch nhiều graph GPU và cascade; cấu hình hiệu năng là đường lui tức thời cho máy demo yếu.

## Bước H 31A — Khu mô phỏng (`&region=`) để giảm tải GPU

Trong `Điều khiển cảnh` có nhóm nút **Khu mô phỏng** (radiogroup, mũi tên/Home/End đổi khu): Toàn bộ hoặc một trong bốn khu. Tham số URL `&region=all|trung-tam|ven-song|bac|nam` (ưu tiên hơn `localStorage` khoá `citylab.31h.region`; giá trị lạ về Toàn bộ). Kết hợp được với mọi mức `&density=`, `&quality=`, `&backend=webgl`, ví dụ `webgpu-materials-24.html?v=30b&view=overview&region=trung-tam&density=balanced`.

| id | Khu | Ranh (đo từ polygon nước của `CITY_DATA`, không phải ranh hành chính) | Công trình |
|---|---|---|---|
| `trung-tam` | Lõi Quận 1 · Bến Nghé | bờ tây sông, nam rạch Thị Nghè, bắc rạch Bến Nghé | 23 366 |
| `ven-song` | Ven sông · Ba Son · Thủ Thiêm | toàn bộ bờ đông (Thủ Thiêm, Thảo Điền) + dải bờ tây Ba Son · Marina · Grand Marina | 8 393 |
| `bac` | Phía bắc · Thị Nghè · Bình Thạnh | bờ tây, bắc rạch Thị Nghè (Landmark 81, Thanh Đa) | 23 115 |
| `nam` | Phía nam · Quận 4 · Khánh Hội | nam rạch Bến Nghé và nam sông quanh Thủ Thiêm | 15 852 |

Bốn đa giác dùng chung đỉnh (`city-region-31.js`, `regionOf(x,z)`), phủ toàn cảnh không hở không chồng; mỗi công trình, cây, đèn, chi tiết, tàu thuộc đúng một khu theo tâm/vị trí. Chọn khu: công trình, cây, chi tiết 28, thiết bị mái, đèn, tàu và xe ngoài khu không vẽ; **signature registry luôn hiển thị 100 %** (công trình/cây/đèn/module signature ngoài khu vẫn có mặt). Mặt đất, nước, đường và cầu vẫn vẽ (mặt đường là mesh gộp theo loại lớp nên không tách được theo khu); nhãn ngoài khu ẩn trừ nhãn gắn signature. Camera bay tới khung của khu; `Toàn vùng` trong một khu = khung khu đó; góc nhìn có tâm ở khu khác tự chuyển sang khu chứa tâm và báo ngắn gọn. Xe: `materialStatus.motion.api.setRegion({id, polygon})` (hoặc `null`). Trạng thái: `window.webgpuMaterials24.region` (`id, label, buildings, trees, vehicles, vessels, triangles, drawCalls…`), `document.body.dataset.region`. QA: `node outputs/hcmc-poc/scripts/qa-region-31.cjs [webgpu|webgl]`.

## Bước I 31A — Chế độ Preview/Lite (`&mode=`) cho máy yếu

Trong `Điều khiển cảnh` có nhóm nút **Chế độ** (radiogroup trên cùng, mũi tên/Home/End đổi chế độ, nhãn tiếng Việt): `Preview · chất lượng đầy đủ` (mặc định, trải nghiệm hiện tại y nguyên) và `Lite · máy yếu`. Tham số URL `&mode=preview|lite` (ưu tiên hơn `localStorage` khoá `citylab.31i.mode`; giá trị lạ về Preview). `Lite` gói sẵn: mật độ `light` (22.599 nhà so với 70.539 ở Đầy đủ, **signature registry vẫn 100 %**), hồ sơ chất lượng `performance` (thay `presentation`), texture thu nhỏ một nửa mỗi cạnh (pixel × 1/4, `anisotropy` ≤ 2, tắt mipmap ở bản lite) và UI gọn (ẩn chú giải họ vật liệu, nút xem khối nền, mục kiểm định Flood Lab; giữ điều hướng `data-view`, ánh sáng, mật độ, khu mô phỏng, chế độ, chọn công trình, Flood Lab mở được). Người dùng vẫn chỉnh tay mật độ/khu sau khi chọn mode; lựa chọn tay được giữ (localStorage/URL) cho tới khi đổi mode. Đổi mode tải lại trang có giữ trạng thái (view, light, region) và có thông báo rõ, vì pipeline chất lượng phải dựng lại. Trạng thái: `window.webgpuMaterials24.mode` (`id, label, density, quality, textureScale, uiCompact, textures:{sentinel, atlas, mask:[w,h]}`), `document.body.dataset.mode`. Đo headed 1600×900: Lite giảm ~70 % tam giác và ~48 % draw call ở overview WebGPU (góc cận Ba Son giảm ~84 % tam giác, ~77 % draw call), bộ nhớ texture pixel giảm 75 % (58,7 MB → 14,7 MB); FPS trên máy đo mạnh bão hòa ~103 ở cả hai chế độ. QA: `PORT=8811 node outputs/hcmc-poc/scripts/qa-mode-31.cjs [webgpu|webgl]`.

Cách tạo texture lite: `data/sentinel-2016-lite.jpg` (1024²), `assets/facades15/facade-atlas-lite.jpg` + `facade-mask-lite.png` (1024×1280) được thu từ bản đầy đủ bằng Pillow (`Image.LANCZOS`, JPEG quality ~70); facade công trình signature không mất, chỉ giảm độ phân giải. Thêm texture mới thì tạo thêm bản `-lite` cùng tỉ lệ và giữ nguyên tên trong `textureUrlsForMode()` của `city-mode-31.js`.

## Bản hiện hành 28B — hình học đô thị phân cấp theo camera

Mở [WebGPU Material Engine](http://127.0.0.1:8768/hcmc-poc/webgpu-materials-24.html?v=28b&view=materials). Bản này dùng Three.js r186, `WebGPURenderer`, TSL/NodeMaterial và WebGL 2 fallback để phủ 8 họ vật liệu lên toàn bộ 70.726 công trình trong vùng 38,57 km². Bản 24E khôi phục kết cấu dây văng cầu Ba Son, Marina Central Tower 55 tầng / 240 m, sửa bốn footprint Grand Marina thành cụm tháp 45–47 tầng, hạ tương phản ô kính ban ngày và tách hiệu chỉnh khỏi dữ liệu cảnh gốc.

PoC 28B dùng City Visual Runtime trên Three.js r186 WebGPU/TSL làm giao diện City Lab mặc định. Runtime bổ sung hậu kỳ HDR có depth micro-contact, bóng thích nghi theo camera, semantic facade kit, nước đa tần số có Fresnel, Kelvin wake động, cây HLOD và camera có quán tính. Lớp Detail Runtime 28 tạo parapet, gờ mặt đứng, cornice khối đế, mái che, lightbox tầng trệt, rooftop plant và đèn đường bằng instancing rồi chuyển LOD theo camera. Wake chỉ còn ba cặp V fade độc lập, không dùng rectangular prop wash gây vệt ngang. Toàn bộ phần nâng cấp được viết độc lập theo phương pháp clean-room; không sử dụng mã hay asset từ SpiderBench. Kiến trúc và giới hạn được ghi trong [Visual Runtime 28](VISUAL-RUNTIME-28.md); tài liệu 27A được giữ như lịch sử. Shell WebGL cũ vẫn có thể mở bằng `?legacy=1` cho mục đích đối chiếu kỹ thuật. Chạy `for file in scripts/qa-*.cjs; do node "$file"; done` để kiểm tra toàn bộ cổng phát hành hiện hành.

Từ thư mục gốc, chạy `python3 scripts/clean_workspace.py` để xem trước rác có thể tái tạo và thêm `--apply` để xóa. Lệnh chỉ xử lý allow-list, bảo vệ mọi file đang được Git theo dõi và giữ nguyên dữ liệu nguồn cùng receipt/provenance.

Urban Motion 26B khôi phục giao thông động trực tiếp trong scene WebGPU: 3.200 phương tiện ưu tiên xe máy và ô tô chạy trên các đoạn tim đường OSM đã loại đoạn cắt footprint/công viên; 22 tàu, phà và sà lan chạy hai chiều trên tuyến minh họa giữa lòng sông Sài Gòn. Wake dùng ba dải chữ V đồng phẳng, mở rộng và mờ dần trên mặt nước thay cho khối trắng cứng. Đây là chuyển động procedural phục vụ cảm nhận đô thị, không phải dữ liệu giao thông thời gian thực hoặc AIS. Xem [Motion QA 26B](MOTION-QA-26B.md).

Batch 25A đã dựng registry mưa–ngập–triều theo Refinery: 9 nguồn gốc chính thức, 64 claim có evidence span, raw snapshot và SHA-256. Catalog kịch bản khóa mọi điều khiển vô hạn và fail-closed khi thiếu hyetograph, hydrograph triều, hệ cao độ, DTM hoặc mạng thoát nước. [IOC Flood 25G](http://127.0.0.1:8768/hcmc-poc/webgpu-materials-24.html?v=25g&view=flood25) đưa camera đến Thảo Điền, thêm mưa–gió động 0–200 mm, triều tham chiếu 1,40–1,80 m, lớp nước proxy và cảnh báo 3D. Nút **Kịch bản xấu nhất** chuyển sang toàn cảnh, bật cảnh báo đỏ và các beacon tuyến đường; mọi giá trị vẫn được gắn nhãn stress test, không phải dự báo. Chạy `node scripts/qa-flood-25a.cjs` để kiểm tra hash, provenance, giới hạn mưa–triều và fail-closed solver UI.

# Lịch sử - PoC 23 Construction Change Lens

## Bản hiện hành 23A - biến động xây dựng có kiểm soát

Mở [Construction Change Lens](http://127.0.0.1:8768/hcmc-poc/?legacy=1&v=23a&view=changes23). Chế độ này trình bày 7 footprint mới đã áp dụng, 87 chiều cao đã đối chiếu và 127 hình học đang chờ con người kiểm chứng. Nút **Trước snapshot / Sau đối chiếu** thay đổi hình học thật trong bộ nhớ; ba lớp màu, bộ lọc ưu tiên/thời gian và hành trình bốn điểm giúp trình bày nhanh cho lãnh đạo.

127 hình học màu đỏ chỉ là tín hiệu rà soát và không được nhập vào scene chính. Bộ dữ liệu máy đọc được, bảng CSV 127 đối tượng, phương pháp tái lập, cơ chế kiểm tra bản Overture và dự thảo công văn xin xác nhận GITC nằm trong [hồ sơ PoC 23](../../research/vibecode-23-change-lens/README.md).

```sh
python3 scripts/build_change_lens_23.py
python3 scripts/check_overture_release_23.py
node scripts/qa-construction-change-23.cjs
```

## Lịch sử - Hero Cluster 20B

## Bản hiện hành 20B — Nhà hát, Continental, Caravelle, Lam Sơn và Đồng Khởi

Mở [cụm Nhà hát–Lam Sơn](http://127.0.0.1:8768/hcmc-poc/?v=20b&view=district20) hoặc [trình diễn lãnh đạo 62 giây](http://127.0.0.1:8768/hcmc-poc/?v=20b&view=executive19). Năm điểm nhìn nối cảnh Nhà hát 20A với Hotel Continental, Caravelle Saigon, công trường Lam Sơn và trục Đồng Khởi. Continental và cánh thấp Caravelle dùng ảnh đúng địa điểm đã hiệu chỉnh phối cảnh; đường, xe, đèn và cây bám các đoạn đường OSM lưu trữ nhưng kích thước đồ đường phố vẫn là minh họa.

Caravelle tách rõ hai mức bằng chứng: cánh thấp bám bao hình 30 m đã lưu, tháp dùng thông tin **24 tầng** từ lịch sử chính thức và quy tắc hiển thị 3,2 m/tầng; chiều cao và vị trí tháp chưa khảo sát. Góc Continental và Đồng Khởi dùng camera theo hành lang phố để không xuyên khối công trình. Mọi cảnh 20B đều giữ `planningGeometryEnabled: false`.

Xem [hướng dẫn demo 20B](../DEMO-20B-HUONG-DAN.md), [TIP](../../research/vibecode-20b/TIP.md) và [báo cáo nghiệm thu](../../research/vibecode-20b/COMPLETION-REPORT.md).

## Lịch sử — Architectural Hero Zone 20A

## Bản hiện hành 20A — cảnh chủ đạo Nhà hát Thành phố

Mở [Hero Zone Nhà hát](http://127.0.0.1:8768/hcmc-poc/?v=20a&view=hero20) hoặc [trailer lãnh đạo 53 giây](http://127.0.0.1:8768/hcmc-poc/?v=20a&view=executive19). Cảnh cận thay tấm ảnh phủ toàn khối bằng vỏ kiến trúc nổi: mái, mansard, vòm, cột, cửa, phào, lan can, ô cửa và bậc. Ảnh đúng địa điểm được giới hạn trong vùng nhận dạng ở vòm giữa; bản gốc Commons 3.920×2.208 px được hiệu chỉnh thành texture 1.600×1.600 px mà không sinh thêm chi tiết. Public realm có người, cây, đèn và vật thể tỷ lệ với LOD cự ly gần.

Ba trạng thái **Ngày / Giờ vàng / Chạng vạng** giữ chung camera. Footprint và trục mặt đứng bám dữ liệu mở; hình học kiến trúc là `photo_derived_approximation`; sân và hoạt động là `illustrative_proxy`. Không có hình học quy hoạch tương lai. Xem [hướng dẫn demo](../DEMO-20A-HUONG-DAN.md) và [báo cáo nghiệm thu](../../research/vibecode-20a/COMPLETION-REPORT.md).

# Lịch sử — Executive Visual Story 19

## Bản hiện hành 19 — trình diễn trực quan cho lãnh đạo

Mở [trailer 53 giây](http://127.0.0.1:8768/hcmc-poc/?v=19a&view=executive19) hoặc [toàn cảnh ban ngày](http://127.0.0.1:8768/hcmc-poc/?v=19a&view=overview) rồi bấm **Trình diễn thành phố**. Năm cảnh đi từ bối cảnh vùng đến Bạch Đằng, Nguyễn Huệ, ảnh Nhà hát Thành phố và kết bằng blue-hour minh họa. Có thể tiến/lùi, tạm dừng, chọn cảnh trực tiếp hoặc thoát về khám phá tự do.

Ảnh Nhà hát đi cùng tác giả và giấy phép; hình học vẫn được ghi là gần đúng. Cảnh đêm chỉ là lớp trình diễn, không mô tả chiếu sáng tại một thời điểm thực. Batch 19 không mở hình học quy hoạch tương lai. Xem [hướng dẫn trình diễn](../DEMO-19-HUONG-DAN.md) và [Verify 19](../../research/vibecode-19/COMPLETION-REPORT.md).

## Bản hiện hành 18 — ảnh, địa hình và LOD theo vùng

Mở [toàn cảnh ban ngày](http://127.0.0.1:8768/hcmc-poc/?v=18b&view=overview). Trong Khám phá chọn **Ảnh & địa hình**, hoặc mở [surface18](http://127.0.0.1:8768/hcmc-poc/?v=18b&view=surface18). Đã có Sentinel RGB ngày 26/04/2026, GEDTM v1.2 ground/uncertainty và DSM riêng; 189 mảnh công trình với hai mức GLB, đọc COG trong Worker và tải mô hình có ngân sách.

Chạy `python3 outputs/hcmc-poc/serve.py` từ thư mục dự án; phải dùng máy chủ Range đợt 18, giữ cả thư mục `../shared/digital-twin-core/`. Bản HTML độc lập lịch sử không có các công cụ 17/18. Nền cũ vẫn nạp lúc startup và được khôi phục khi về bản đồ nền hoặc Phân tích. Đợt này chưa chuyển viewer Gia Lộc.

Ảnh nguồn 10 m/địa hình mô hình khoảng 31 m không thay khảo sát cm hay LiDAR. Fine/coarse là LOD hiển thị, chưa là CityGML LoD2/3. COPC/SfM/3DGS và geometry quy hoạch giữ điều kiện triển khai. [Runbook 18](../DEMO-18-HUONG-DAN.md) · [Kiến trúc và nguồn 18](../../research/vibecode-18/ARCHITECTURE-AND-SOURCES.md) · [Verify 18](../../research/vibecode-18/VERIFY.md).


## Lịch sử bản 17 — lõi nguồn và phân tích dùng chung

Mở [City Lab TP.HCM](http://127.0.0.1:8768/hcmc-poc/?v=17b&view=overview). Bản 17 chạy qua HTTP và dùng `../shared/digital-twin-core/`; cần bàn giao cả hai thư mục. `SAIGON-3D.html` là gói lịch sử trước đợt này, chưa chứa công cụ Phân tích mới.

Từ thư mục dự án, chạy `python3 outputs/hcmc-poc/serve.py` nếu server chưa chạy. Mặc định tổng quan ban ngày. Chọn **Phân tích → Mẫu hành lang Nguyễn Huệ** để thử A/B/C 25/50/100 m; thu gọn bảng để xem toàn bản đồ. Mở **Phạm vi & khoảng cách** để tự vẽ vùng/tuyến, bấm Enter kết thúc, Escape hủy. Kết quả có nhóm ID nguồn, diện tích hợp loại phần chồng và lớp đối tượng chọn; chuyển A/B/C giữ góc nhìn. **Xuất kết quả & lưu đối chiếu** tải JSON/CSV/HTML có hình học, nguồn, epoch, hash và phương pháp.

Lõi kiểm hash byte JSON và chạy chuẩn hóa/truy vấn trong Worker. Phân tích hiện dùng mặt bằng và chiều cao mô hình, nền HCMC vẫn phẳng. Các số liệu là ước lượng sàng lọc; số ID nguồn chưa phải số nhà/thửa kiểm chứng. Cấu hình Gia Lộc dùng cùng lõi; UI Gia Lộc chưa chuyển sang plugin này. Chưa có orthophoto 1 cm, LiDAR đo kiểm hoặc hình học quy hoạch tương lai được duyệt mới trong đợt 17.

Hướng dẫn demo: [DEMO-17-HUONG-DAN.md](../DEMO-17-HUONG-DAN.md). Kiến trúc và nguồn sơ cấp: [ARCHITECTURE-AND-SOURCES.md](../../research/vibecode-17/ARCHITECTURE-AND-SOURCES.md). Hợp đồng API và lệnh tiếp nhận: [README lõi](../shared/digital-twin-core/README.md). Nghiệm thu: [VERIFY.md](../../research/vibecode-17/VERIFY.md).

Kiểm lại lõi bằng `node --test outputs/shared/digital-twin-core/tests/*.cjs` từ thư mục dự án; kiểm catalog và hash bằng `python3 outputs/shared/digital-twin-core/scripts/prepare-project.py --check` và `node outputs/shared/digital-twin-core/scripts/project-data.cjs verify hcmc`.

Phần dưới ghi lịch sử giao diện và pipeline trước đợt 17.

## Giao diện lãnh đạo

Bản **16b**: nền kính khói, nav/drawer cùng bề rộng, nội dung so sánh thu gọn; cache bóng và giảm lượt phản xạ, chất lượng tạm giảm khi di chuyển rồi khôi phục. Mở `?v=16b`. Phép đo Chrome cùng cảnh cho CPU frame7,77→3,94ms; FPS đứng yên chưa tăng rõ. Xem `research/vibecode-16b/VERIFY.md` để biết điều kiện đo và giới hạn.

Mở `http://127.0.0.1:8768/hcmc-poc/?v=16a` để vào toàn cảnh ban ngày với bốn tác vụ **Khám phá / Quy hoạch / So sánh / Tham quan**. Bảng thông tin thu gọn; nút Nghiên cứu mở công cụ PoC cũ. URL có `view` cụ thể vẫn giữ góc được yêu cầu. UAV được hoãn và ẩn trong giao diện lãnh đạo.

Quy hoạch có bốn đầu mối nguồn kèm cơ quan, ngày, trạng thái và giới hạn; chưa có lớp hình học tương lai được đối chiếu. So sánh hiện dùng mô hình nền và lớp ảnh công trình, không phải hiện trạng–quy hoạch. Kiểm kê đủ 20 mục, giữ 5 mặt chưa đủ điều kiện; sửa metadata footprint Union Square và Continental đúng nguồn Overture. Xem `research/vibecode-16/VERIFY.md`, `research/vibecode-16/SCAN-GEOMETRY.md` và `../DEMO-16-HUONG-DAN.md`.

Phần bên dưới ghi lại nền tảng và các công cụ nghiên cứu được giữ từ các phiên bản trước.

## Xem kết quả

Mở `../SAIGON-3D.html` bằng Chrome/Safari có WebGL. Bản này nhúng dữ liệu, ảnh và thư viện; font ngoài có fallback. Máy không cần key API. Các liên kết tài liệu/nguồn vẫn cần Internet hoặc thư mục bàn giao tương ứng.

Hoặc chạy từ bất kỳ thư mục nào:

```sh
python3 /duong-dan/hcmc-poc/serve.py
```

Sau đó mở http://127.0.0.1:8768/hcmc-poc/?v=15a . Server chỉ bind loopback. Bản demo bắt đầu ở “Toàn khu vực” với ánh sáng ban ngày để giới thiệu đầy đủ phạm vi 38,57 km²; Cinematic Night là cao trào ở góc 18; Reality Enrichment là góc kiểm tra chi tiết ở góc 19. Giao diện map-first chỉ giữ ba nút điều khiển thường trực. Dùng mũi tên hoặc WASD để di chuyển trên mặt phẳng, Q/E để xoay, +/- để zoom; `H` ẩn UI, `F` bật toàn màn hình, `0` đặt lại góc và `Esc` đóng lớp nổi. Chuột vẫn hỗ trợ kéo trái, kéo phải và cuộn. “Lưu góc nhìn” lưu PNG có attribution vào thư mục outputs chứa dự án; ở bản HTML độc lập, ảnh được tải về theo cơ chế của trình duyệt. Xem `../DEMO-RUNBOOK-POC-12.md` trước buổi trình diễn.

## Dựng lại từ dữ liệu đã lưu

Tạo môi trường Python riêng và cài requirements.txt, sau đó:

```sh
python scripts/prepare_scene.py
python research/refinery.py research
python research/bites.py research
```

Script prepare_scene đọc bản OSM và Overture đã lưu; không gọi mạng. `scene.json` và `scene.js` là dữ liệu suy ra, không phải nguồn gốc. Các builder 07B–10 dựng lại tile GLB, kế hoạch thu ảnh, registry vật liệu, texture atlas và lớp chi tiết đô thị; các validator cùng tên kiểm tra từng đầu ra. Để đóng gói lại một file sau thay đổi, chạy `python scripts/package_single.py`.

## Thu thập đợt mới

Tạo bản sao thư mục trước khi tải mới để giữ nguyên snapshots của đợt cũ. `scripts/fetch_osm.py`, `fetch_ground.py`, `capture_sources.py` ghi file đích; không chạy chúng lên bản lưu trữ bất biến.

Lệnh Overture đã dùng:

```sh
python -m overturemaps download --bbox=106.684,10.750,106.739,10.808 -f geojson --type=building -o data/overture-region.geojson
```

Client chọn release theo catalog khi tải mới; file `.state` ghi release thực tế. Đợt bàn giao sử dụng 2026-08-19.0. Không coi “latest” là cố định.

Batch 22 bổ sung lớp delta công trình mà không thay nguồn nền. `scripts/build_building_gap_22.py` tạo hồ sơ đã lọc từ snapshot OSM trực tiếp, lớp Nhà cao tầng HCMGIS và chiều cao Google Temporal 2023. `scripts/prepare_scene.py` chỉ thêm footprint có độ phủ hiện hành không quá 10%; hiệu chỉnh chiều cao chỉ khi điểm HCMGIS nằm trong footprint, diện tích tương thích và nguồn Google độc lập đồng thuận trong ngưỡng đã khai báo. Bản ghi HCMGIS không có điều khoản tái sử dụng rõ trong metadata chỉ được dùng để đối chiếu nội bộ.

```sh
python scripts/build_building_gap_22.py
python scripts/prepare_scene.py
```

## Nguồn và quyền

OSM: https://www.openstreetmap.org/copyright — ODbL, attribution; dữ liệu suy ra từ OSM được bàn giao để hỗ trợ nghĩa vụ share-alike. Overture có các nguồn Google Open Buildings, Microsoft ML Buildings và OSM; giữ `sourceRecords`, đọc giấy phép theo nguồn/theme: https://docs.overturemaps.org/attribution/ . Không tuyên bố tất cả nội dung Overture cùng một giấy phép permissive.

EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017), CC BY 4.0. Không dùng các bản EOX 2018–2025 có hạn chế NC.

Three.js MIT và Earcut ISC: giấy phép trong vendor/. Mã PoC do dự án tạo có thể chỉnh sửa; các giấy phép dữ liệu vẫn áp dụng riêng. Ảnh minh họa xuất từ scene phải giữ attribution ở chân ảnh.

## Các giả định

Xem báo cáo tổng. Nền phẳng; hầu hết chiều cao ước lượng; cây, vật liệu, texture atlas, thiết bị mái, dải hiệu, ánh sáng, đế, bó tháp Landmark 81 và sân đáp Bitexco có phần minh họa. Đây không phải bản đồ cho điều hướng UAV. Khoảng trống dữ liệu được giữ rõ trong giao diện và report.

## PoC 13

Chọn góc nhìn **19 · Reality Enrichment** để xem batch chi tiết cự ly gần và dùng nút A/B trong HUD để so với khối nền.

## PoC 14 · Surface Realism

Góc nhìn 20: năm bộ PBR ambientCG CC0, 15 texture và 1.200 tán cây cutout ở vùng gần. Nút PBR cho phép so sánh bật/tắt. Vật liệu thư viện chưa phải ảnh chụp bề mặt tại TP.HCM. Danh mục 27 giải pháp nằm tại `research/visual-14/index.html` trong ứng dụng; báo cáo tại `../POC-14-VISUAL-RESEARCH.md`.

## PoC 15 · Photo Facade Lab

Góc 21 bổ sung 20 mặt đứng từ 20 ảnh đúng công trình, với lựa chọn công trình, đối chiếu ảnh nguồn và A/B. Xem `../POC-15-PHOTO-FACADES.md` và gallery `research/facades-15/index.html` trong ứng dụng. Phần khuất, vị trí UV và độ sâu vẫn gần đúng; ảnh nguồn có thời điểm 2006–2025.

### Bản sửa 15b

Giữ 14 dải ảnh phẳng và vỏ Vietcombank theo footprint bộ phận với vật liệu lấy mẫu; 5 mặt không phẳng chờ tách bề mặt. Cấm kéo cao khối đế; A/B khôi phục cả hình học và UV. Xem phần Correction 15b trong `../POC-15-PHOTO-FACADES.md`.

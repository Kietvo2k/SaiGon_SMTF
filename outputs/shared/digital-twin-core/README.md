# RtR Twin · lõi nguồn dữ liệu dùng chung, phiên bản 1

Lõi này tách **nguồn dữ liệu, hình học địa lý, mô hình hiển thị và kết quả phân tích**. TP.HCM dùng hợp đồng này; cấu hình vùng và nguồn nằm riêng trong `projects/`. Đợt 17 tích hợp trải nghiệm phân tích vào City Lab TP.HCM. Hợp đồng và dữ liệu Gia Lộc đã gỡ khỏi repo trong CLEANUP C, tra cứu bằng `git log`; lõi giữ lại phần dùng chung mà app HCMC nạp.

## Đã thực hiện

- `source-core.js`: browser `window.RTRTwin.SourceCore` và CommonJS cùng API; không phụ thuộc dịch vụ mạng.
- `schema.json`: hợp đồng JSON Schema 2020-12 cho cấu hình dự án và nguồn. Bộ kiểm chạy trong ứng dụng kiểm các điều kiện nguồn, hình học và mục đích sử dụng. Đây là hợp đồng riêng RtR, không tự nhận chứng nhận STAC hoặc OGC.
- `projects/hcmc.json`: nguồn OSM, Overture, chiều cao Google mô hình, ảnh EOX lịch sử, mẫu Terrarium chưa đủ quyền/terrain; đầu mối dữ liệu mở, GIS quy hoạch, LiDAR lịch sử và hồ sơ quy hoạch chính thức. Đầu mối chưa có dữ liệu thô luôn bị chặn nhập.
- CLI xác minh byte, chuẩn hóa bản đồ hiện có, nhập GeoJSON vào khu cách ly kèm báo cáo QC. CLI không tải mạng, xuất bản hoặc sửa scene cũ.

## Hợp đồng không được đánh đồng

| Trường | Ý nghĩa |
|---|---|
| `release` | Bản phát hành dữ liệu; không phải ngày chụp |
| `snapshotTimestamp` | Mốc snapshot cơ sở dữ liệu nếu nguồn cung cấp |
| `sourceEpoch` / `sourcePeriod` | Mốc/chu kỳ sản phẩm mô hình hoặc nguồn tổng hợp |
| `captureDate` | Ngày quan sát thực được nguồn xác định; chưa biết thì `null` |
| `resolution.native` | Lưới file gốc hoặc GSD gốc được xác nhận |
| `resolution.effective` | Độ phân giải hiệu dụng có căn cứ; không lấy độ mịn lưới nội suy thay thế |
| `resolution.output` | Lưới dẫn xuất; nội suy không bổ sung chi tiết đo thực |
| `horizontalCRS`, `coordinateUnits` | CRS và đơn vị tọa độ: EPSG:4326 dùng `degree`; các CRS chiếu đã ghi nhận dùng `m` |
| `units`, `valueUnits` | `units` giữ tương thích cho giá trị/đại lượng vật lý; `valueUnits.height='m'` khi biết. Không dùng `units` suy ra đơn vị tọa độ |
| `verticalDatum` | Hệ cao độ được kiểm chứng; chưa biết thì `null` |
| `assets[].sha256` | Danh tính byte; không chứng minh dữ liệu đúng hoặc hiện trạng đúng |
| `acquisition.status` | `acquired` / `lead` / `unavailable`; đã tải vẫn có thể bị chặn quyền, CRS hoặc chất lượng |
| `validation.stage`, `quality` | Điều kiện nhập đã khai báo; không phải chứng chỉ đo đạc độc lập |

Mô hình Google lưới gốc 0,5 m, độ phân giải hiệu dụng khoảng 4 m, không phải ảnh quan sát 0,5 m. Chiều cao là mô hình phía trên mặt đất; ngày 2023 của mô hình không gán sang ảnh chụp footprint Microsoft. Terrain LiDAR 5 m được nhắc trong báo cáo TP.HCM không phải mật độ điểm LiDAR, độ chính xác hay gói LAS đã tải.

## API

```js
const normalized = RTRTwin.SourceCore.normalizeScene(CITY_DATA, projectConfig);
// {features, sources, frame, project, gates, normalization}
// features là GeoJSON WGS84, geometry Polygon/MultiPolygon.
const local = RTRTwin.SourceCore.forwardLocal([106.71, 10.77], projectConfig.frame);
const geographic = RTRTwin.SourceCore.inverseLocal([local[0], local[1]], projectConfig.frame);
const gate = RTRTwin.SourceCore.capabilityGate(projectConfig, 'spatial_query');
const permission = RTRTwin.SourceCore.inspectSource(sourceRecord, 'ingestion');
```

CLI chấp nhận mọi slug dự án an toàn khi có manifest tương ứng trong `projects/`; không giới hạn cứng địa danh. `verify` tách `byteIntegrityValid` khỏi `admissionReady`, và `prepare` không tạo artifact nếu không có nguồn/hình học building được nhập hợp lệ.

`normalizeScene` hỗ trợ scene HCMC (`buildings[].r`), scene solution dạng `raw_polygon_wgs84` (adapter còn trong mã, hợp đồng Gia Lộc đã gỡ) và GeoJSON FeatureCollection. Trong mỗi trường hợp nguồn phải vượt điều kiện nhập; geometry invalid bị loại và ghi lý do trong `normalization.excluded`. Hình học GeoJSON đã là WGS84: dữ liệu CRS chiếu phải được xử lý bằng pipeline phù hợp trước khi nhập.

`properties.id` là ID biểu diễn độc lập với `sourceId`. Overture dùng GERS; OSM dùng ID đang giữ trong scene. Trùng ID nguồn được nhóm theo nguồn, nhưng các way ID khác nhau của một công trình chưa được hòa giải danh tính vật lý. Không gọi số khối, số nhóm nguồn hay building part là số nhà đã kiểm kê. 10 khối minh họa Landmark được phân lớp `illustrative`, không dùng trong inventory GIS.

Chiều cao giữ `{value, kind, surveyed, sourceKey, modelEpoch}` cùng `rawHeight`, `levels`, `partIndex`, `parentSourceId` và `sourceRecords`. Dữ liệu nguồn Overture nguyên bản vẫn giữ tại asset được fingerprint; scene legacy chỉ có bản source record rút gọn, lõi không sáng tác các trường đã mất trong scene.

Khung render HCMC là x Đông/z Nam; adapter Gia Lộc (đã gỡ khỏi repo) từng dùng canonical x Đông/z Bắc. Adapter đảo đúng hệ số của scene đang có, không phải chuyển sang CRS đo đạc. GIS dùng GeoJSON geographic qua thuật toán riêng; muốn nghiệm thu XY/Z phải bổ sung khống chế, CRS/hệ cao độ chính thức và kiểm tra độc lập.

`inspectSource` trả `{allowed, errors, warnings}` cho `ingestion`, `citation`, `survey`, `planning`, `hydrology`, `volume`, `clearance`. `capabilityGate` chỉ mở những mục đích có nguồn phù hợp. Đo đạc khảo sát, mô phỏng thủy văn đầy đủ, quy hoạch được phê duyệt và ảnh dựng chân thực từ capture đều đang chặn ở dự án HCMC. Thủy văn đầy đủ cần terrain đã QC cùng mạng thoát nước, mưa, triều/điều kiện biên và hiệu chuẩn; có terrain đơn lẻ không mở chức năng này.

## Chạy offline

Các lệnh giả sử đang ở thư mục dự án và Node/Python có trong PATH. Node đi kèm máy hiện tại: `/Users/os/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.

```bash
# Tái tạo catalog từ asset gốc; không tải thêm dữ liệu.
python3 outputs/shared/digital-twin-core/scripts/prepare-project.py
python3 outputs/shared/digital-twin-core/scripts/prepare-project.py --check

# Kiểm toàn bộ fingerprint hiện có của dự án HCMC.
node outputs/shared/digital-twin-core/scripts/project-data.cjs verify hcmc

# Chuẩn hóa toàn scene vào thư mục mới; chưa xuất bản.
node outputs/shared/digital-twin-core/scripts/project-data.cjs prepare hcmc outputs/shared/digital-twin-core/prepared/hcmc-17a

# Nhập một nguồn GeoJSON WGS84 + hợp đồng nguồn vào thư mục cách ly MỚI.
node outputs/shared/digital-twin-core/scripts/project-data.cjs import-geojson hcmc /absolute/input.geojson /absolute/source.json outputs/shared/digital-twin-core/quarantine/new-batch

# Kiểm source/coordinate/admission; fixture là dữ liệu tổng hợp riêng của test.
node --test outputs/shared/digital-twin-core/tests/source-core.cjs
```

Đường dẫn đích nằm trong `prepared/` hoặc `quarantine/` và chưa tồn tại. CLI chặn thay thế thư mục cũ và escape qua symlink/path traversal. Nhập hợp lệ tạo `input.geojson`, `source.json`, `normalized.geojson`, `qc.json` (`published:false`). Nhập không hợp lệ vẫn lưu bản input/hợp đồng/báo cáo lỗi vào khu cách ly và không tạo artifact normalized. JSON không đọc được hoặc đường dẫn đích không an toàn làm lệnh thất bại trước khi ghi. Không có bước tự đưa dữ liệu cách ly lên bản đồ.

Hợp đồng nguồn nhập có thể dùng cấu trúc của một entry trong `projects/hcmc.json`: đổi ID/title/URL, khai báo quyền được kiểm chứng, `role:'footprints'`, `horizontalCRS:'EPSG:4326'`, `coordinateUnits:'degree'`, giá trị chiều cao `m`, `captureDate` xác định hoặc `null`, `acquisition.status:'acquired'`, validation và **duy nhất một asset có SHA-256 khớp input**. Giữ mốc không biết là `null`; không lấy ngày tải làm ngày quan sát. Nguồn mới chưa có kiểm độc lập không khai `survey_validated`.


## GIS Worker và giao diện TP.HCM

`analysis-client.js` cung cấp API bất đồng bộ; `analysis-worker.js` nạp SourceCore/Turf/GIS khi mở công cụ. Ví dụ đầu vào được kiểm byte:

```js
const client = new RTRTwin.AnalysisClient({
  workerUrl: '../shared/digital-twin-core/analysis-worker.js', config: projectConfig
});
const response = await fetch(projectConfig.input.url);
if (!response.ok) throw new Error('Không tải được dữ liệu');
const bytes = await response.arrayBuffer();
await client.init({type: 'rtr-raw-json/1.0', bytes});
// Buffer chuyển quyền sở hữu sang Worker; không sử dụng lại bytes.
const result = await client.query({
  geometry: {type: 'LineString', coordinates: [[106.70057,10.77681],[106.70605,10.77247]]},
  mode: 'corridor', distances: [25,50,100]
});
client.cancel(); // loại kết quả yêu cầu cũ; không cắt CPU đang chạy đồng bộ trong Worker
client.destroy();
```

Tuyến trên là fixture phân tích, không phải tuyến quy hoạch hoặc mẫu đường Nguyễn Huệ của UI. `init` dạng bytes yêu cầu SHA-256 khớp `config.input.sha256`, Web Crypto và JSON UTF-8 hợp lệ. Hash và JSON parse đều trong Worker; không fallback sang parse trên main thread hoặc bỏ kiểm hash. `init(sceneData)` dạng object cũ vẫn hỗ trợ và ghi `inputIntegrity.verified:false`. UI đợt 17 dùng dạng bytes được kiểm.

Query nhận WGS84 Polygon/MultiPolygon cho `mode:'area'`, LineString và khoảng cách mét cho `corridor`. Các scenario trả geometry, coverage, FeatureCollection và summary; provenance giữ nguồn, frame, normalization và inputIntegrity. Thuật toán chọn có giao/tiếp xúc biên, giữ holes/khối lõm, clipping và union thật. Area/length dùng mô hình cầu WGS84; buffer dùng azimuthal-equidistant cục bộ với 16 bước cung mặc định. Đây là phép sàng lọc, chưa là phép đo nghiệm thu địa chính.

Kernel giới hạn phạm vi cục bộ tối đa hai độ, tối đa 1.000 đỉnh query, buffer ≤1.000 m và mặc định ≤20.000 bbox candidates; vượt ngưỡng báo lỗi, không cắt ngầm kết quả. UI hiện giới hạn 128 điểm vẽ và A/B/C 5–500 m. Dữ liệu >3.000 feature yêu cầu Worker; fallback object nhỏ có nhãn rõ, raw-byte không fallback. Lỗi/timeout/destroy/reinit và kết quả cũ có kiểm lifecycle riêng. Cancellation bỏ kết quả cũ ngay; muốn ngắt CPU bị treo thì timeout chấm dứt Worker và cần khởi tạo lại.

```sh
node --test outputs/shared/digital-twin-core/tests/*.cjs
```

Bằng chứng oracle độc lập và kiểm tích hợp: `research/vibecode-17/COMPLETION-GIS.md` và `VERIFY.md`; hướng dẫn thao tác: `outputs/DEMO-17-HUONG-DAN.md`. GUI đợt này là plugin trên engine cũ, không phải migration engine hoặc streaming service mới.

## Kiến trúc sản xuất tiếp theo

Catalog kỹ thuật trong `projects/techniques.json` ghi rõ nhánh **đã triển khai** và nhánh **chưa triển khai**. COG/range requests và masks; GeoParquet/indexed storage; 3D Tiles 1.1 streaming; CityGML/CityJSON/BIM semantics; camera registration + Gaussian splats là các adapter tiếp theo, cần bộ dữ liệu, QC và kiểm tương thích thực tế. Không thay engine toàn ứng dụng bằng nhánh mới chưa kiểm. Đầu mối chính thức trong catalog chỉ dùng dẫn nguồn; chưa có hình học quy hoạch được duyệt để dựng sa bàn tương lai. Các asset bổ sung GlobalBuildingAtlas có điều kiện phi thương mại bị loại khỏi nhánh thương mại.

# Verify — Batch 18

Ngày 14/09/2026. Chủ thầu kiểm kết quả theo 16 tiêu chí Blueprint, đọc Completion ba Thợ, kiểm file sản phẩm và xem bản demo thực. Phạm vi là nhánh ảnh/địa hình và LOD của vùng mẫu TP.HCM, không phải nghiệm thu toàn Digital Twin hay yêu cầu đo đạc cm trong hồ sơ Gia Lộc.

## Đối chiếu tiêu chí

| ID | Kết quả | Bằng chứng và giới hạn |
|---|---|---|
| R18-01 | Đạt điều tra nguồn | DCAT 102 dataset, năm nhóm đã nối distribution; PDF schema/ZIP thật có hash; service 401/body rỗng không được coi là dữ liệu vận hành. Quyền/geometry chính thức chưa đủ vẫn held |
| R18-02 | Đạt tiếp nhận ảnh | Sentinel 26/04/2026 RGB 601×645, kiểm tám ứng viên SCL; 0% cloud/shadow và NoData theo sản phẩm trên cửa sổ kiểm |
| R18-03 | Đạt phân vai cao độ | Ground GEDTM v1.2, DSM GLO30, uncertainty riêng; EGM2008, scale/offset, kỳ dữ liệu và giới hạn mô hình được giữ |
| R18-04 | Đạt COG/provenance | Bốn COG actual bytes/hash/layout/bounds/overviews PASS; grid khoảng 10/31 m, không suy thành độ chính xác cm |
| R18-05 | Đạt gate raster | SourceCore thật, exact path/hash membership; clones thiếu quyền/acquisition và metadata thay thế bị chặn |
| R18-06 | Đạt Range | Tám server tests; actual HEAD206 32 bytes, Content-Range và ETag SHA256; HTTP200 bị Worker từ chối trước body |
| R18-07 | Đạt Worker window/overview | Actual browser read và sáu buffer/mask khớp Rasterio; overview ban đầu256²/262.144 bytes, patch native-cap; không nâng chi tiết nguồn |
| R18-08 | Đạt giới hạn/lifecycle | 18 Core18 tests gồm cache/cancel/stale/async-reinit/timeout/NoData/budgets; error rõ, không fallback decoder main thread |
| R18-09 | Đạt tham chiếu tính toán | 70.709 base offsets và mốc origin khớp oracle Rasterio; nền nhà một base phẳng, đường drape bỏ cầu/hầm; thủy hệ chỉ viền tham chiếu |
| R18-10 | Đạt file LOD/ID | 189 chunks,378 GLB,70709 representation IDs; binary/index/roof/sidecar checks và Khronos đều PASS |
| R18-11 | Đạt trục subset | PROJ ECEF origin và hai đường glTF/ENU ở ba vị trí khớp; chưa chuyển EGM2008 sang ellipsoid, chưa chứng nhận georeg/conformance |
| R18-12 | Đạt chọn LOD | Frustum/SSE/count/bytes tests; live toàn vùng32 mảnh,26 fine/6 coarse,6.236.420 bytes;107 mảnh bị bỏ theo ngân sách, không phủ toàn thành phố |
| R18-13 | Đạt UI kính/collapse | Desktop/mobile/viewport thực; nav vẫn năm cột. Root phát hiện badge che nav; Thợ sửa theo biến layout và thêm checks rect/left alignment |
| R18-14 | Đạt ảnh tham chiếu thật | 20/20 photo bytes/dimensions khớp; phóng tệp đã lưu, credit và kích thước đúng tệp; đi tới workflow mặt đứng cũ. Một số tệp là thumbnail nguồn, không coi kích thước đó là camera original. Hai bộ ảnh đa góc mới chỉ là leads; chưa có reconstruction |
| R18-15 | Đạt phục hồi | Default ban ngày, night/camera/light/footer phục hồi; analysis17 được trở về nền phẳng; keyboard/pick/photo/mobile checks. Baseline17 GUI14/14 PASS sau hooks18 |
| R18-16 | Đạt bàn giao có phạm vi | Blueprint/TIP/Completion/kiến trúc/runbook, QA và fingerprints riêng đợt18; demo HTTP18b được xem trực tiếp |

## Các phép kiểm đã chạy

Lưu ý CLEANUP A: các tệp bằng chứng trong `qa/` được ghi ở mục này đã gỡ khỏi cây làm việc; tra cứu lại bằng `git show <commit trước CLEANUP A>:research/vibecode-18/qa/<tệp>`.

- **12/12 source compiler tests** và bốn asset QC PASS; ba SourceCore contracts được tiếp nhận, quyền chưa kiểm/acquisition lead bị từ chối. Root chạy lại `--self-test --verify` trên bản cuối.
- **18/18 Core18 tests**, root chạy trên bản cuối: `node --test outputs/shared/digital-twin-core/tests/streaming-18.cjs outputs/shared/digital-twin-core/tests/cog-18.cjs outputs/shared/digital-twin-core/tests/tiles-18.cjs`.
- **8/8 server tests**, root và UI Builder đã chạy trên máy chủ HTTP thực: `python3 outputs/hcmc-poc/scripts/test_server_18.py`.
- **Actual browser COG reads** có 206/ETag/Content-Range, cache và overview. Sáu giá trị buffer/mask SHA khớp independent Rasterio/GDAL; không chỉ kiểm API mock. Kết quả: `qa/cog-browser-results.json`, `qa/ground-alignment-oracle.json`.
- **Oracle sản phẩm của Chủ thầu**:378 GLBs/189 chunks/70709 IDs,3.038.830 vertices,1.540.550 triangles; roof area chênh lớn nhất0,032314 m² so với polygon nguồn. Báo cáo `qa/produced-tiles-oracle.json`, script `qa/check-produced-tiles.py`.
- **Khronos glTF validator**2.0.0-dev.3.10:378/378 files,0 errors/0 warnings; QA tool cài chỉ trong tmp, không thêm runtime dependency. [Report](qa/khronos-glb-validation.json), [validator primary source](https://github.com/KhronosGroup/glTF-Validator).
- **20/20 ảnh retained** hash/dimensions PASS qua Pillow. Báo cáo `qa/real-photo-audit.json`, script `qa/check-real-photos.py`.
- **24/24 UI checks trên Chromium PASS**, 0 JavaScript errors: `qa/ui-results.json`. Bao gồm separate overview/detail, actual tile ID picking, keyboard, mobile, badge không đè nav, legacy analysis và exact night restore. **4/4 adversarial browser checks PASS**: catalog ground mismatch, corrupted GLB bị chặn, retry và restore. Báo cáo integrity: `qa/ui-integrity-results.json`.

Oracle cao độ có chênh **0 m về tính toán** ở tolerance1e−9m; điều này không chứng minh nguồn có sai số0m hay chính xác nanometre. Oracle trục/hình học cũng không chứng minh vị trí và chiều cao công trình đúng ngoài thực địa.

## Kiểm trực quan và lỗi đã sửa

Chủ thầu xem screenshot desktop, toàn vùng, mobile và trực tiếp trình duyệt in-app894×998. Live18b: imageoverview256²/overview1, full AOI; detail235×237/overview0; không lỗi. Sau nút toàn vùng:32 chunks,6,0MiB xấp xỉ,26fine/6coarse; camera mũi tên phải dịch target từ `[0,0,0]` tới `[167.2096,0,-172.1655]` sau khi chạm bản đồ. Times Square2D hiển thị nguồn2388×3490px, ngày16/01/2020,CC BY-SA4.0; không dùng ảnh sinh để thay công trình.

Các lỗi tìm qua kiểm độc lập và đã sửa: lệch quy tắc tâm pixel của nearest resize; crop không giữ scale/offset; NoData/biên nội suy; thiếu lớp đệm DTM; admission chỉ dựa boolean; generation callbacks cũ; overview probe bị patch ghi đè; badge che nav và badge phân tích cũ cùng hiện. GLB/sidecar được kiểm hash trước parse, có thử byte hỏng thật.

Sau suite UI cuối chỉ đổi nhãn ảnh thành “Ảnh đang dùng”, kiểm cú pháp và DOM cityhall 1280×982px PASS; không đổi hình học hay chạy lại suite cho thay đổi chữ. Snapshot release lấy allowlist từ catalog, không đọc các bản sao tên “ 2” không được tham chiếu phát hiện trong thư mục đầu ra. Các bản sao không được coi là tài sản nguồn hay mô hình bổ sung.

Thợ GIS dọn thêm 323 bản sao phát sinh không tham chiếu, không đọc contents hay đổi catalog. Kiểm ngay và sau năm giây: còn đúng 758 tệp, gồm 378 GLB/380 JSON, không thiếu tham chiếu hay thêm bản sao. Tổng tệp trong fingerprint snapshot là 875, gồm tài sản hiện hành và tài liệu/QA/lõi; kiểm lại hashes/bytes PASS.

UI ghi rõ nguồn và giới hạn. Khối LOD neutral có bóng để dễ đọc hình, chưa có vật liệu/mặt đứng thực cho mọi công trình. Ảnh vẫn mờ khi xem vượt lưới10m; đây là hạn chế nguồn/overview, không phải bằng chứng đã có ảnh đo chi tiết.

## Bàn giao và các phần giữ điều kiện

[Runbook18](../../outputs/DEMO-18-HUONG-DAN.md), [kiến trúc/nguồn](ARCHITECTURE-AND-SOURCES.md), Completion tổng (tệp `COMPLETION.md` đã gỡ trong CLEANUP A). [Fingerprint snapshot](qa/release-fingerprints.json) ràng buộc file bản bàn giao, bao gồm GLB/sidecar/COG hiện hành. Kiểm lại bằng `python3 research/vibecode-18/qa/verify-release.py`; không tạo lại snapshot để che file đã thay đổi.

Chưa có COPC decoder/pointcloud, SfM/3DGS reconstruction, orthophoto1cm, checkpoint đo đạc, CityGML LoD2/3, hydrology, hay geometry quy hoạch tương lai được tiếp nhận. Gia Lộc viewer chưa chuyển sang surface18. Scene cũ và animation hooks vẫn tồn tại; chưa công bố giảm startup/RAM/FPS toàn ứng dụng. Không commit/push/publish trong đợt này.

# Đề xuất dọn dẹp repo: worktree smart-bac

- Ngày: 2026-10-16. Nhánh: `Kietvo2k/smart-traffic-bac`. HEAD: `8d03812`.
- Chế độ: chỉ đọc. Không xóa, không sửa, không commit file nào ngoài file này.
- Không đụng ba file đang do hai agent khác sửa (chưa commit): `outputs/hcmc-poc/violation-perception-32.js`, `outputs/hcmc-poc/data/signature-registry-31.{js,json}`, `outputs/hcmc-poc/test/violation-32.test.mjs`. Cả ba đều thuộc nhóm GIỮ.
- Phạm vi: 2966 file đang track, tổng 1333,0 MB (MiB). File untracked trong `work/` (kpi-*, m2a-*, …) nằm ngoài đề xuất.

## 1. Tóm tắt

| Mức | File | MB | Ghi chú |
|---|---:|---:|---|
| Xóa chắc chắn (sau khi sửa link mục 5) | 687 | 619,7 | 46,5% |
| Xóa sau khi xác nhận Q4 | 59 | 15,3 | bằng chứng nguồn |
| **Đề xuất xóa tổng** | **746** | **635,1** | **47,6%** |
| Quyết định riêng Q1: tách Gia Lộc | 533 | 59,3 | không xóa tại chỗ |
| Quyết định riêng Q2: ảnh bằng chứng baseline/bridge | 32 | 70,6 | |
| Quyết định riêng Q3: nhánh legacy `?legacy=1` | 83 | 18,1 | |
| Tối đa nếu chọn hết Q1–Q3 | 1394 | 783,1 | 58,7% |

`git rm` chỉ giảm cây làm việc. Lịch sử `.git` không giảm nếu không viết lại lịch sử (Q6).

## 2. Cách kiểm

- Danh sách: `git ls-files`. Dung lượng: `stat`.
- Đồ thị tham chiếu: quét mọi file văn bản đã track (js, mjs, cjs, html, css, py, json, md, ps1, sh…). Lấy các chuỗi có đuôi file, phân giải theo đường dẫn tương đối, theo `outputs/hcmc-poc/`, theo `outputs/`, và theo tên file duy nhất. Có khoảng 6,7 nghìn cạnh.
- Gốc chạy thật: `webgpu-materials-24.html` (kèm module graph), `index.html` (legacy, vì `qa-project-hygiene.cjs` dòng 58 kiểm tra nhánh này), `serve.py`, `run-smart.ps1|sh`, `outputs/smart-traffic/**`, QA đang dùng (`qa-*-31.cjs`, `qa-*-32.cjs`, `qa-project-hygiene.cjs`), `outputs/hcmc-poc/test/*.mjs`, test của `outputs/shared/digital-twin-core/tests/`, và `scripts/*-32.*`. Đồ thị này có 1278 file, 531,8 MB.
- Tài liệu giữ: `docs/superpowers/**`, `outputs/hcmc-poc/VISUAL-RUNTIME-31.md`, `outputs/hcmc-poc/RELEASE-QA-31A.md`, `GIT-DATA-PACKAGING.md`, `outputs/shared/digital-twin-core/README.md`. Đích không phải `.md`/`.html` của các tài liệu này được coi là bằng chứng và giữ lại. Ví dụ: ảnh nghiệm thu `research/vibecode-31-release/`.
- Chính sách giữ theo `GIT-DATA-PACKAGING.md`: ảnh nguồn và bản đồ vật liệu (`assets/`), biên nhận và provenance dạng JSON/CSV, native window, `tiles-18/` cùng catalog, lõi `shared/`.
- Giới hạn: phân tích tĩnh. Đường dẫn ghép chuỗi động không có đuôi file có thể bị sót. Sau khi xóa phải chạy kiểm tra mục 7.

## 3. Kết quả các câu hỏi đã nêu

1. **Tile Copernicus `outputs/tayninh-data-batch-01/raw/global/copdem-glo30-n11-e106.tif` (49 MB) có được app HCMC dùng không?** Không. Không file nào trong `outputs/hcmc-poc/` hay `outputs/smart-traffic/` nhắc tới `tayninh` (kiểm bằng `git grep`). Chỉ `outputs/shared/digital-twin-core/projects/gia-loc.json` (dòng 379, 382) và `outputs/shared/digital-twin-core/tests/source-core.cjs` đọc nó. HCMC dùng bản crop riêng `outputs/hcmc-poc/data/surface-18/cog/copdem-glo30-dsm-padded-wgs84.tif`. Không xóa, xử lý theo Q1.
2. **`outputs/shared/digital-twin-core/*`.** Giữ toàn bộ. App WebGPU (không legacy) không nạp trực tiếp, nhưng `index.html` (legacy) nạp `source-core.js`, `analysis-client.js`, `lod-18.js`, `raster-client-18.js`, và `twin-*` sử dụng chúng. Test shared core đọc `projects/hcmc.json` và `projects/gia-loc.json`. `GIT-DATA-PACKAGING.md` yêu cầu giữ layout này.
3. **`outputs/tayninh-*` và `outputs/review-gia-loc`.** Dự án Gia Lộc, 595 file, 127,6 MB. Trong đó 62 file (68,3 MB) là phần contract `gia-loc.json` (22 đường dẫn Tây Ninh) và test đọc. 533 file (59,3 MB) không app hay contract nào dùng.

## 4. Bảng đề xuất theo nhóm

| Nhóm | Đường dẫn (gộp) | File | MB | Đánh giá |
|---|---|---:|---:|---|
| (a) | `outputs/tayninh-data-batch-01…04`, `outputs/tayninh-imagery-campaign-05`, `outputs/review-gia-loc` (phần ngoài contract) | 533 | 59,3 | **TÁCH** sang repo riêng (Q1). Không xóa tại chỗ |
| (a) | Phần contract `gia-loc.json` và test đọc | 62 | 68,3 | **GIỮ** |
| (b) | `outputs/*.md`: POC-02…15, DEMO-16/19/20A/20B/24A, DEMO-RUNBOOK-POC-12, BAO-CAO-POC, LO-TRINH, SA-BAN, CODEBASE-CLEANUP-POC-12 | 28 | 0,1 | **XÓA**, sửa link: `README.md` dòng 25–47, `outputs/hcmc-poc/index.html` dòng 12 |
| (b) | `outputs/hcmc-poc/*.md`: VISUAL-RUNTIME-27/28/30B, RELEASE-QA-25G/27A/28B, UI-QA-25G, VISUAL-CALIBRATION-25G, VISUAL-QA-26, MOTION-QA-26B, PROMPT-31-ROAD-BRIDGE-TRAFFIC-DENSITY | 11 | <0,1 | **XÓA**. Viết lại `outputs/hcmc-poc/README.md` |
| (b) | `outputs/hcmc-poc/research/**/*.md` | 28 | 0,1 | **XÓA** |
| (b) | `research/**/*.md` (vibecode-17…30, flood, visual-spectrum) | 35 | 0,2 | **XÓA**. Giữ 5 tài liệu được tài liệu giữ dẫn tới (xem mục 6) |
| (c) | `research/baseline-30b/probe` (93 PNG) và issues, tools | 103 | 195,8 | **XÓA**. Không có tham chiếu nào, kể cả chú thích |
| (c) | `research/vibecode-31-*` (density, traffic, street, road, bridge, j, fixes, h, i, signature), trừ phần giữ | 271 | 347,6 | **XÓA** (screens, issues, zoom, khảo sát các vòng 31 cũ). **GIỮ** `research/vibecode-31-release/` (17 file, 36 MB), 4 ảnh khảo sát và 4 ảnh traffic mà `VISUAL-RUNTIME-31.md` dẫn tới |
| (c) | `research/vibecode-17/18/19/20a/20b/22/23/24/29/30`, `hcmc-visual-spectrum-26`, `hcmc-flood-digital-twin` (không .md, trừ refinery giữ) | 74 | 17,6 | **XÓA** |
| (c) | `outputs/hcmc-poc/research` (không .md): vibecode-31-g3, snapshots JSON, vibecode-16* | 29 | 33,8 | **XÓA**. **GIỮ** `visual-14/`, `facades-15/` (trang UI dẫn tới), `issues-31/`, 4 ảnh g3 mà VISUAL-RUNTIME-31 dẫn tới |
| (c) | Ảnh `research/baseline-30b/screens` (16) và `research/vibecode-31-bridge/screens` (16) | 32 | 70,6 | **GIỮ TẠM**, xem Q2 |
| (c) | Trang nguồn HTML/PDF/XML và `research/vibecode-18/evidence-source-owned` (không JSON) | 59 | 15,3 | **XEM LẠI**, xem Q4 |
| (d) | `outputs/hcmc-poc/data` (30 file): `surface-18/quarantine` (trừ 5 tif mà `surface-18/manifest.json` dẫn tới), `surface-18/working`, `height-region.json` (3,6 MB), `overture-*`, `google-height-*`, `height-pilot.*`, `3dtiles/` | 30 | 24,1 | **XÓA**. File provider zip 14,4 MB: xem Q5 |
| (d) | `outputs/hcmc-poc/scripts` (56 file, build/validate/QA PoC 12–23, `archive/`) và `outputs/hcmc-poc/city-visual-runtime-27.js` | 57 | 0,2 | **XÓA**. Sửa `outputs/hcmc-poc/README.md` dòng 61, 62, 147, 151, 161 và `README.md` dòng 25–26 |
| (d) | Giữ trong `scripts/` (16 file): script tái tạo dữ liệu đang nạp (`build_road_graph_31.py`, `build_signature_registry_31.py`, …) và script được `RELEASE-QA-31A.md` dẫn tới (`validate_demo_ready.py`, …) | — | — | **GIỮ** |
| (d) | `outputs/hcmc-poc/assets` (73 file) | 73 | 26,9 | **GIỮ**: "retained photographs/material maps" theo `GIT-DATA-PACKAGING.md` |
| (d) | `outputs/hcmc-poc/vendor`, `tiles/`, `test/`, toàn bộ `outputs/shared/` | — | — | **GIỮ** (thư viện vendored, lõi dùng chung, test) |
| (e) | `work/` tracked (22 file: `*.py`, `*.cjs`, `*.json`, `temporal-download.ipynb`) | 22 | 0,1 | **XÓA**. Sửa `README.md` dòng 26 (`work/finalize.py`). Giữ `work/temporal-manifest.json` (3,9 MB, manifest provenance) |
| Legacy | Nhánh `?legacy=1` chỉ nạp khi có tham số: `app.js`, `experience.js`, `architecture.js`, `twin-analysis-17`, `twin-surface-18`, `leadership-16`, `executive-story-19`, `hero-*`, `construction-change-23` | 83 | 18,1 | **GIỮ** hiện tại vì `index.html` và `qa-project-hygiene.cjs` còn tham chiếu. Xem Q3 |

## 5. Link và chuỗi cần sửa nếu xóa theo mục 4

- `README.md` (gốc): dòng 25, 26, 29, 43, 47. Viết lại theo mục 6.
- `outputs/hcmc-poc/README.md`: 26 cạnh tới file đề xuất xóa (dòng 9, 44, 48, 58, 61, 62, 74, 82, 90, 98, 109, 117, 121, 135, 144, 147, 151, 161, 186, 190 và các dòng liên quan). Viết lại theo mục 6.
- `outputs/hcmc-poc/index.html` dòng 12: dialog `#research` có 12 liên kết tới POC-07C…15, `BAO-CAO-POC.md`, `DEMO-RUNBOOK-POC-12.md`. Xóa các liên kết này, hoặc cả dialog nếu bỏ legacy (Q3).
- `outputs/hcmc-poc/research/facades-15/snapshots/palace-exact-search.json` tham chiếu `research/hcmc-visual-spectrum-26/samples/03.jpg`. Giữ `03.jpg` (nhỏ) hoặc chấp nhận link gãy trong snapshot.
- Không có cạnh nào từ app runtime, smart-traffic, QA đang dùng, `serve.py`, hay các tài liệu giữ (ngoài hai README và `index.html`) tới file đề xuất xóa. Đã kiểm bằng đồ thị.
- Chuỗi trong tài liệu giữ cần đổi nếu xóa `research/vibecode-17/18` (trừ 5 tài liệu giữ): `GIT-DATA-PACKAGING.md` dòng 3 ("research/runbooks through Batch 18").

## 6. Tài liệu giữ và tài liệu cần viết lại

**Giữ, không đổi:**
- `docs/superpowers/specs/2026-10-14-smart-traffic-bac-design.md`
- `docs/superpowers/plans/2026-10-14-m1-hang-xanh.md`
- `outputs/hcmc-poc/VISUAL-RUNTIME-31.md`
- `outputs/hcmc-poc/RELEASE-QA-31A.md`
- `GIT-DATA-PACKAGING.md`
- `outputs/shared/digital-twin-core/README.md`
- Năm tài liệu được giữ vì các tài liệu trên dẫn tới: `outputs/DEMO-17-HUONG-DAN.md`, `outputs/DEMO-18-HUONG-DAN.md`, `research/vibecode-17/COMPLETION-GIS.md`, `research/vibecode-17/VERIFY.md`, `research/vibecode-18/ARCHITECTURE-AND-SOURCES.md`.

**Viết lại 1: `README.md` (gốc).** Dàn ý:
1. Repo gồm hai hệ: app 3D City Lab TP.HCM (`outputs/hcmc-poc`) và Smart Traffic khu Bắc (`outputs/smart-traffic`). Lõi dùng chung ở `outputs/shared/digital-twin-core`.
2. Nêu rõ mô hình gần đúng, dữ liệu chưa kiểm định đo đạc, không dùng cho điều hướng UAV.
3. Chạy app: `python3 outputs/hcmc-poc/serve.py`, mở `/hcmc-poc/?app=smart`. Hoặc chạy `outputs/smart-traffic/run-smart.ps1|.sh`. Ghi cổng theo script.
4. Điều khiển: kiểm lại phím và chế độ (Preview/Lite, khu mô phỏng, ánh sáng) theo `webgpu-materials-24.js`.
5. Kiểm tra: QA hiện hành (`qa-*-31`, `qa-*-32`, `qa-project-hygiene.cjs`), test backend và web. Bỏ `package_single.py` và `work/finalize.py` khỏi hướng dẫn. Giữ `validate_demo_ready.py` (RELEASE-QA-31A dẫn tới).
6. Tài liệu nghiệm thu hiện hành: `VISUAL-RUNTIME-31.md`, `RELEASE-QA-31A.md`. Đặc tả và kế hoạch Smart Traffic trong `docs/superpowers/`.
7. Dữ liệu và giấy phép: trỏ tới `GIT-DATA-PACKAGING.md` và các `*-provenance.json`.
8. Gia Lộc: một đoạn ghi trạng thái, theo kết quả Q1 (còn trong repo hay đã tách).
9. Lịch sử PoC 02–26 đã gỡ khỏi cây làm việc: tra cứu bằng `git log`.

**Viết lại 2: `outputs/hcmc-poc/README.md`.** Dàn ý:
1. Bản hiện hành: `webgpu-materials-24.html` (mặc định `?v=31a`; khu Bắc `?app=smart&v=32a`). `index.html` chỉ là trang chuyển hướng.
2. Thành phần runtime theo module graph thật: `webgpu-materials-24.js`, `city-*-31.js`, `city-visual-runtime-30.js`, `flood-ui-25.js`, và nhóm `*-32.js` (giao thông, vi phạm, nhiệt, dự báo, trạm).
3. Dữ liệu đang nạp: `data/scene.*`, `road-graph-31`, `signature-registry-31`, `bridge-corrections-31`, `street-furniture-31`, `surface-18/` (COG và `tiles-18/`), `flood-source-registry-25`.
4. Tham số URL hiện hành: `view`, `light`, `mode=preview|lite`, `region=`, `app=smart`. Kiểm lại theo mã.
5. Điều chỉnh 31A: Bước H (khu mô phỏng) và Bước I (Preview/Lite), cập nhật theo mã hiện tại.
6. Nghiệm thu và QA: lệnh chạy `qa-*-31`, `qa-*-32`, `qa-project-hygiene.cjs`. Liên kết `VISUAL-RUNTIME-31.md` và `RELEASE-QA-31A.md`.
7. Nguồn dữ liệu và quyền: bảng ngắn (OSM, Overture, Google Open Buildings, EOX, Copernicus, GEDTM). Trỏ `GIT-DATA-PACKAGING.md`.
8. Giới hạn: phối cảnh gần đúng, chiều cao chưa kiểm định, không dùng để điều hướng.
9. Nhánh legacy `?legacy=1`: ghi rõ chỉ để đối chiếu, nếu chưa xử lý Q3.
10. Cấu trúc thư mục: `assets/`, `data/`, `vendor/`, `scripts/` (chỉ script đang dùng), `test/`.

## 7. Rủi ro và điều kiện trước khi xóa

- Phân tích tĩnh có thể bỏ sót đường dẫn ghép động. Sau khi xóa, chạy: `node outputs/hcmc-poc/scripts/qa-project-hygiene.cjs`; các `qa-*-31.cjs` và `qa-*-32.cjs`; test trong `outputs/hcmc-poc/test/`. Khởi động `serve.py`, mở `webgpu-materials-24.html?v=32a&app=smart`, kiểm DevTools không có 404 cho ảnh và dữ liệu.
- `git rm` không giảm `.git`. Giảm thật cần viết lại lịch sử (Q6), là thao tác phá hủy cần xác nhận riêng.
- Xung đột chính sách: `GIT-DATA-PACKAGING.md` ghi giữ "research/runbooks through Batch 18" và "retained photographs/material maps". Xóa `research/vibecode-17/18` cần sửa câu này (xem mục 5).
- Hai agent khác đang sửa ba file thuộc nhóm GIỮ (mục đầu). Nên commit hoặc stash các thay đổi đó trước khi `git rm`, tránh xung đột.
- Không kiểm được từ repo các kịch bản thủ công ngoài repo có trỏ tới `research/vibecode-31-*` hoặc ảnh cũ.

## 8. Thứ tự đề xuất

1. Viết lại hai README. Sửa `outputs/hcmc-poc/index.html` dòng 12. Commit riêng.
2. Trả lời Q1–Q6.
3. `git rm` nhóm đã chốt (687 file, và 59 file nếu Q4 đồng ý). Chạy kiểm tra mục 7. Commit một lần.
4. Nếu chọn Q3: sửa `index.html` dòng 1 và thẻ `<script>/<link>` legacy, sửa `scripts/qa-project-hygiene.cjs` dòng 58, rồi xóa 83 file legacy.

## 9. Quyết định cần bạn chọn

- **Q1. Tách Gia Lộc** (533 file, 59,3 MB) sang repo riêng. Trước đó phải đổi `outputs/shared/digital-twin-core/projects/gia-loc.json` (22 đường dẫn) và `tests/source-core.cjs`. Lựa chọn khác: giữ nguyên.
- **Q2. Bỏ 32 ảnh bằng chứng** baseline-30b và bridge-31c (70,6 MB). Đang giữ vì `baseline-30b-metrics.json` và `bridge-31c-metrics.json` liệt kê tên ảnh trong trường `file`. Không phải phụ thuộc chạy thật.
- **Q3. Bỏ nhánh legacy** `?legacy=1` (83 file, 18,1 MB). Cần sửa `index.html` dòng 1 (công tắc), dòng 12 (dialog) và thẻ script/link legacy, cùng `scripts/qa-project-hygiene.cjs` dòng 58. `assets/` vẫn giữ theo `GIT-DATA-PACKAGING.md`.
- **Q4. 59 file bằng chứng nguồn** (snapshot HTML/PDF/XML và `research/vibecode-18/evidence-source-owned` không phải JSON, 15,3 MB). `GIT-DATA-PACKAGING.md` yêu cầu giữ "source URLs/rights/epochs". Xác nhận trước khi xóa.
- **Q5. `outputs/hcmc-poc/data/surface-18/quarantine/official-forest-2024-provider.zip`** (14,4 MB, đang track). Xác nhận bản gốc còn trên máy trước khi bỏ khỏi git.
- **Q6. Viết lại lịch sử git** để giảm `.git`. Mặc định: không.

Danh sách file chính xác (tạo bởi script đọc-only) nằm trong thư mục scratchpad của phiên làm việc: `DEL2.txt` (687), `REVIEW.txt` (59), `DECA.txt` (32), `TACH.txt` (533), `legacy-only.txt` (83), `FIX-final4.tsv` (47 cạnh), `KEEP3.txt`.

# City Lab TP.HCM · `outputs/hcmc-poc`

Thành phố 3D khu trung tâm TP.HCM chạy bằng WebGPU (WebGL khi cần). Bản hiện hành là `webgpu-materials-24.html`. `index.html` chỉ là trang chuyển hướng sang bản này.

Đây là **mô hình gần đúng**: phối cảnh và chiều cao chưa khảo sát đo đạc, không dùng để điều hướng.

## Chạy

```sh
python3 outputs/hcmc-poc/serve.py      # từ thư mục gốc repo; PORT mặc định 8768
```

Mở `http://127.0.0.1:8768/hcmc-poc/`. Khu Bắc Smart Traffic dùng `?v=32a&app=smart` (cùng `api=` trỏ backend, xem README gốc).

## Tham số URL đọc trong mã

| Tham số | Giá trị / ý nghĩa | Nơi đọc |
|---|---|---|
| `v` | số phiên bản cache, không đổi hành vi | nhiều file |
| `app` | `smart` bật khu Bắc (31A cổ điển khi bỏ trống) | `webgpu-materials-24.js`, `index.html` |
| `api` | địa chỉ backend cho chế độ smart | `smart-app-32.js` |
| `view` | `materials`, `river`, `boulevard`, `corridor`, `overview` (mặc định), `bason`, `flood25` | `index.html` (danh sách hợp lệ) |
| `mode` | `preview` (đầy đủ) hoặc `lite` (máy yếu, bớt nhà, texture nhỏ) | `city-mode-31.js` |
| `quality` | mặc định `presentation`; mode có thể đặt `performance` | `webgpu-materials-24.js` |
| `light` | ánh sáng ngày/đêm | `webgpu-materials-24.js` |
| `density` | mật độ đô thị | `city-density-31.js` |
| `scenario` | `stress-test` mở sẵn kịch bản ngập | `flood-ui-25.js` |
| `backend` | `webgl` buộc dùng WebGL | `webgpu-materials-24.js` |

Liên kết chuyển hướng gửi kèm `region=bac`, nhưng mã hiện tại không đọc tham số này. Khu Bắc được bật bằng `app=smart`.

## Thành phần runtime

- Khung và vòng render: `webgpu-materials-24.js` (+ `.html`, `.css`).
- Thành phố 31A: `city-*-31.js` (mật độ, chế độ, đường, cầu, nội thất đường), `city-visual-runtime-30.js`, `flood-ui-25.js`.
- Khu Bắc và giao thông (`*-32.js`): `smart-app-32.js` (khởi động app smart), `city-lock-32.js` (khóa khu), `traffic-signals-32.js` và `traffic-controller-32.js` (đèn), `violation-*-32.js` và `wrong-way-32.js` (vi phạm), `camera-capture-32.js` (ảnh bằng chứng), `heat-*-32.js` (nhiệt), `forecast-*-32.js` (dự báo, có Worker), `station-client-32.js` và `station-queue-32.js` (trạm gửi số liệu), `scenarios-32.js`, `kpi-panel-32.js`.

## Dữ liệu đang nạp

- `data/scene.*` (cảnh và công trình), `data/road-graph-31.*`, `data/signature-registry-31.*` (công trình và cầu signature), `data/bridge-corrections-31.*`, `data/street-furniture-31.*`.
- `data/surface-18/` (COG cắt sẵn) và `data/tiles-18/` (catalog).
- `data/flood-source-registry-25.json`, `data/flood-scenario-catalog-25.json`.
- `assets/` (ảnh, bản đồ vật liệu, giữ theo `GIT-DATA-PACKAGING.md`), `vendor/` (thư viện bên thứ ba có giấy phép kèm theo), `tiles/`.

## Chế độ Preview và Lite (31A, bước I)

Thứ tự ưu tiên: `?mode=` trên URL, rồi giá trị đã lưu trong localStorage, cuối cùng là `preview`. Giao diện có điều khiển đổi chế độ (`city-mode-31.js`). Lite giảm nhà không cần thiết (giữ signature), texture còn 50 % và UI gọn hơn.

## Kiểm tra

```sh
node --test "outputs/hcmc-poc/test/*.test.mjs"
node outputs/hcmc-poc/scripts/qa-project-hygiene.cjs
node outputs/hcmc-poc/scripts/validate_signature_registry_31.cjs
PORT=8879 node outputs/hcmc-poc/scripts/qa-north-32.cjs          # cần serve.py đang chạy
PORT=8879 node outputs/hcmc-poc/scripts/qa-mode-31.cjs
```

Các QA khác: `qa-traffic-31.cjs`, `qa-region-31.cjs`, `qa-density-31.cjs`, `qa-road-traffic-31.cjs`, `qa-street-furniture-31.cjs`, `qa-capture-32.cjs`, `qa-webgpu-materials-24.cjs`, `qa-visual-runtime-30b.cjs`, `qa-flood-25a.cjs`. Bốn script cũ `qa-app-integrity-30b.cjs`, `qa-construction-change-23.cjs`, `validate_demo_ready.py`, `validate_ba_son_bridge.py` còn đọc nhánh `?legacy=1`/dữ liệu legacy đã gỡ trong CLEANUP, nên sẽ báo lỗi cho đến khi được cập nhật.

Nghiệm thu hiện hành: [VISUAL-RUNTIME-31.md](VISUAL-RUNTIME-31.md) và [RELEASE-QA-31A.md](RELEASE-QA-31A.md).

## Nguồn dữ liệu, quyền và giới hạn

Nguồn: OpenStreetMap, Overture, EOX và Copernicus, Google Open Buildings, Poly Haven (vật liệu). Biên nhận, URL nguồn, quyền và phiên bản nằm trong `*-provenance.json` và `GIT-DATA-PACKAGING.md`.

Giới hạn: phối cảnh gần đúng, chiều cao chưa được kiểm định, không dùng để điều hướng hay làm căn cứ kỹ thuật.

## Cấu trúc thư mục

- `assets/`, `data/`, `vendor/`, `tiles/`: dữ liệu và thư viện đang nạp.
- `scripts/`: script dựng và kiểm tra còn dùng (đăng ký chữ ký, QA hiện hành).
- `test/`: test `node --test` cho logic sim, đèn, vi phạm, dữ liệu.
- `research/`: ảnh và số liệu còn được tài liệu nghiệm thu dẫn tới (`visual-14/`, `facades-15/`, `issues-31/`).

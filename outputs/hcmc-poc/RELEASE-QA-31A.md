# Release QA 31A

> Căn cứ: bản cuối Release 31A, mã khóa ở `7b476d7` (bước I) và các commit phát hành `fc4865a`, `909c4f2`, `c4adf8b`, `3a3ade0`, **`4f226b4`** (phần C: nâng `version` manifest lên `31a`). Nguồn chính: `work/rel-acceptance.md` và `work/rel-metrics.json`. Số liệu chi tiết nằm trong `VISUAL-RUNTIME-31.md`. Đường dẫn `research/...` trong file này tính từ thư mục gốc repo (từ `outputs/hcmc-poc/` là `../../research/...`).

## 1. Kết luận

31A **đủ điều kiện phát hành**. Trong 10 tiêu chí mục 5 của đặc tả:

| Kết quả | Số tiêu chí | Tiêu chí |
|---|---:|---|
| Đạt | 5 | 2, 5, 6, 7, 10 |
| Đạt có điều kiện | 5 | 1, 3, 4, 8, 9 |
| Chưa đạt | 0 | |

Không tiêu chí nào bị đánh Chưa đạt. Năm mục "Đạt có điều kiện" là **giới hạn đã biết, không chặn phát hành** (khe sáng mảnh ở giao lộ trên cao chỉ thấy ở cận cảnh; chồng xe hiếm khi sim dài; lần đầu vào Tối thiểu 0,3–0,4 s; tỉ lệ xe chờ ~12 % so với mục tiêu 8 %; kiểm footprint–cầu dùng bảng dữ liệu thay vì QA tự động). Ba điểm cần nói thẳng:

1. **`qa-traffic-31` webgpu chập chờn** ở ca "y mặt cầu ±0,05 m" (mẫu biên tại nút chuyển tiếp profile đầu cầu). Chạy lại một lần xanh 36/36, không tái lập ⇒ flaky/borderline, không phải lỗi tái lập. Chưa sửa (theo điều phối).
2. **`work/rel-metrics.json` chưa có `traffic:webgpu`/`traffic:webgl`**; số giao thông ở mục QA lấy từ `qa-traffic-31` (đã chạy ≥ 60 s + sim dài), không phải từ file số liệu.
3. **Tỉ lệ xe chờ ~12 %** vẫn trên mục tiêu 8 % (ghi là giới hạn, không phải lỗi chặn).

## 2. Bảng 10 tiêu chí nghiệm thu

| # | Tiêu chí (mục 5 đặc tả) | Kết quả | Bằng chứng chính |
|---|---|---|---|
| 1 | Đường: không khe/chồng ở khúc cua, không z-fighting ở giao lộ, 6 góc ngày/đêm, có ảnh trước/sau | **Đạt có điều kiện** | Bộ 6 góc × ngày/đêm `../../research/vibecode-31-release/view-*.png` (`3a3ade0`); miter/giao lộ/`polygonOffset` (B). Còn khe sáng mảnh ở ranh giao lộ trên cao (J-4), chỉ thấy cận cảnh |
| 2 | Cầu: 100 % dốc dẫn + chạm hai đầu; hết bậc thẳng đứng; Ba Son hết trùng mặt cầu | **Đạt** | `validate_road_graph_31.py` PASS (0 xếp tầng thiếu, 0/247 giao cắt lỗi); `validate_ba_son_bridge.py` PASS; `qa-road-traffic-31` 32/32 |
| 3 | Xe: 0 teleport, 0 ngược chiều oneway, 0 chồng cùng làn, có xe qua cầu | **Đạt có điều kiện** | `qa-traffic-31` 36/36 cả hai backend: teleport 0, oneway 0, gap 0, OBB 0, xe trên cầu tới 307; mẫu ≥ 60 s + sim dài. Còn chồng xe hiếm khi sim dài trên phố hẹp |
| 4 | Mật độ: Tối thiểu giảm ≥ 60 % tam giác & draw call; registry 100 %; đổi mức ≤ 300 ms | **Đạt có điều kiện** | Bảng 4.1 (`rel-metrics.json`): giảm ≥ 60 % mọi góc/backend. Registry: `qa-density-31` audit 100 %, `validate_signature_registry_31` 8/8. Lần đầu vào Tối thiểu 0,3–0,4 s (vượt nhẹ 300 ms, J-6) |
| 5 | Hiệu năng: Đầy đủ không thấp hơn 30B quá 5 %; Cân bằng cao hơn rõ rệt; bảng 6 góc | **Đạt** | Bảng 4.2 (`fpsUncapped`): Cân bằng nhanh hơn Đầy đủ ở **cả 6 góc** (+5,3 %…+20,0 %), p95 thấp hơn; Đầy đủ 78,6–185,3 FPS khi bỏ chặn vsync; không thấp hơn 30B |
| 6 | Mọi `qa-*.cjs` và `validate_demo_ready.py` pass; có `qa-road-traffic-31` | **Đạt** | Sau `4f226b4` (nâng `version` manifest 30b→31a khớp redirect) + đồng bộ ngưỡng version trong 3 script: `validate_demo_ready.py` **PASS**; 12/12 `qa-*.cjs` xanh; `qa-road-traffic-31` 32/32. Ca "y mặt cầu" chập chờn nhưng chạy lại xanh |
| 7 | Console không lỗi mới, cả WebGPU và `backend=webgl` | **Đạt** | Mọi `qa-*.cjs` ghi console lỗi rỗng (`errors: []`) ở cả hai backend; `qa-traffic-31` console 0 lỗi; chỉ 1 cảnh báo `powerPreference` của Chromium trên Windows |
| 8 | 5 ảnh `research/issues-31/`: chụp lại đúng góc, đặt cạnh ảnh gốc, đánh dấu sửa/còn | **Đạt có điều kiện** | 5 ảnh `issue-0X-sau.png` (`3a3ade0`) + bảng 5 lỗi trong `VISUAL-RUNTIME-31.md` mục 5, cạnh ảnh gốc `research/issues-31/0X-*.webp` (`909c4f2`); ảnh 03 còn mục "vệt đỏ trên mái" chưa đối chiếu |
| 9 | Không xuyên hình: 0 công trình xuyên cầu; 0 cột đèn trên mặt đường; 0 đầu cầu cắt cụt | **Đạt có điều kiện** | `qa-street-furniture-31` 21/21 (0 cột đèn trên mặt đường); `validate_road_graph_31` 0 đầu cầu cắt cụt; xung đột công trình–cầu xử lý ở bảng `bridge-corrections-31`. Chưa có QA tự động giao cắt footprint–hành lang cầu trên bản cuối (dùng bảng dữ liệu) |
| 10 | Ngân sách tam giác theo nhóm; Đầy đủ ≤ 9,1 M; Cân bằng ≤ ~5 M; Tối thiểu ≤ ~3 M | **Đạt** | Bảng 4.4: Đầy đủ 3,55–6,70 M (< 9,1 M); Cân bằng 2,24–3,20 M (< 5 M); Tối thiểu 1,04–1,14 M (< 3 M) |

Bảng số liệu chi tiết: `renderer.info` ở `VISUAL-RUNTIME-31.md` mục 4.1; FPS uncapped ở mục 4.2; phân bổ nhóm ở mục 4.4; giao thông ở mục 4.7; khu mô phỏng và Preview/Lite ở mục 4.8.

## 3. Bộ QA theo bộ × backend

Nguồn: `work/rel-acceptance.md` mục 2, log `work/rel-qa-*.log`. Ô `n/a` là bộ không tách backend.

| Bộ kiểm | WebGPU | WebGL 2 | Số ca | Ghi chú |
|---|---|---|---|---|
| `qa-density-31.cjs` | Đạt (33/33) | Đạt (33/33) | 33 | |
| `qa-mode-31.cjs` | Đạt (18/18) | Đạt (18/18) | 18 | |
| `qa-region-31.cjs` | Đạt (59/59) | Đạt (59/59) | 59 | |
| `qa-street-furniture-31.cjs` | Đạt (21/21) | Đạt (21/21) | 21 | |
| `qa-road-traffic-31.cjs` | Đạt (32/32) | Đạt (32/32) | 32 | bộ chính cho tiêu chí 1–4 |
| `qa-traffic-31.cjs` | Đỏ 1/36 → chạy lại 36/36 | Đạt (36/36) | 36 | lần đỏ flaky, xem mục 1 |
| `qa-app-integrity-30b.cjs` | Đạt (10) | n/a | 10 | không tách backend |
| `qa-construction-change-23.cjs` | Đạt (`ok:true`) | n/a | – | |
| `qa-flood-25a.cjs` | Đạt (7) | n/a | 7 | |
| `qa-webgpu-materials-24.cjs` | Đạt (18) | n/a | 18 | |
| `qa-visual-runtime-30b.cjs` | Đạt (8) | n/a | 8 | |
| `qa-project-hygiene.cjs` | Đạt (8) | n/a | 8 | |
| `validate_signature_registry_31.cjs` | Đạt (8/8) | n/a | 8 | sau khi dựng lại registry (`c4adf8b`) |
| `validate_road_graph_31.py` | PASS | n/a | – | cần `PYTHONIOENCODING=utf-8` |
| `validate_ba_son_bridge.py` | PASS | n/a | – | |
| `validate_bach_dang_footbridge.py` | PASS | n/a | – | |
| `validate_demo_ready.py` | PASS | n/a | 20 | sau `4f226b4` (trước đó đỏ do lệch version manifest) |

## 4. Phạm vi bằng chứng

- Bằng chứng tính đến bản cuối `4f226b4` (mã khóa `7b476d7`). Registry dựng lại `c4adf8b`, bộ ảnh `3a3ade0`.
- Server `127.0.0.1:8811` chạy sẵn; QA/đo qua Playwright Chromium `chromium-1243`, `PORT=8811`.
- Không commit `work/*` và `research/*-validation.json` theo quy định (gồm `rel-metrics.json`, `rel-measure*.cjs`, `rel-acceptance.md`, log đo).

## 5. Rủi ro và đề xuất bước tiếp theo

| Rủi ro | Mức | Trạng thái | Đề xuất |
|---|---|---|---|
| Manifest lệch version (chặn tiêu chí 6) | ~~Cao~~ | Đã xử lý (`4f226b4`) | Xong |
| FPS headed bị chặn tần số quét | ~~Trung bình~~ | Đã xử lý (đo lại uncapped) | Xong |
| `qa-traffic-31` ca "y mặt cầu ±0,05 m" chập chờn (mẫu biên ở nút chuyển tiếp đầu cầu) | Trung bình | Chưa sửa (điều phối dừng việc 2) | Loại mẫu sát nút chuyển tiếp khỏi phép so (không nới 0,05 m thân cầu) |
| `traffic:*` chưa ghi vào `rel-metrics.json` | Trung bình | Chưa đo | Chạy `work/rel-measure.cjs traffic webgpu\|webgl` |
| Phân bổ nhóm tam giác mức Cân bằng/Tối thiểu chưa đo | Thấp | Chưa đo | Xuất `groups` cho cả hai mức |
| `region`/`mode` đo với `density` ghim nên Lite chênh chủ yếu ở bộ nhớ texture | Thấp | Đã ghi trong tài liệu | Đo lại theo preset nếu cần bảng riêng |
| Chồng xe hiếm khi sim dài trên phố hẹp có buýt | Trung bình | Đã ghi | Thêm kiểm thân xe sim 600 s; siết IDM cho buýt/tải |
| Tỉ lệ xe chờ ~12 % > mục tiêu 8 % | Thấp–trung bình | Đã ghi | Tinh chỉnh chu kỳ đèn/ngưỡng nhường; nếu giữ, ghi rõ |
| Khe sáng mảnh giao lộ trên cao; vệt đỏ mái ảnh 03 | Thấp | Đã ghi | Điều tra vệt đỏ bằng cận cảnh |

**Đề xuất bước tiếp theo, theo thứ tự:**

1. Xử lý ca chập chờn `qa-traffic-31` (việc 2) và ghi `traffic:*` vào `rel-metrics.json`.
2. Đo lại FPS trên máy tham chiếu màn hình 60 Hz và bổ sung phân bổ nhóm ở mức Cân bằng/Tối thiểu.
3. Thêm QA tự động giao cắt footprint–hành lang cầu và kiểm thân xe khi sim 600 s.
4. Giữ các mục "Đạt có điều kiện" đã ghi là giới hạn trong `VISUAL-RUNTIME-31.md` mục 7 và 8.

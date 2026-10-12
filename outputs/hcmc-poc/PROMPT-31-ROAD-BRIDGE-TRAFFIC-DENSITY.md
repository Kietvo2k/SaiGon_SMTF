# Prompt · Runtime 31 — Mạng đường, cầu, giao thông có logic và chế độ mật độ

> Dán toàn bộ nội dung dưới đây cho agent thực thi. Làm việc bằng tiếng Việt có dấu, file UTF-8.

---

## 1. Vai trò và bối cảnh

Bạn là kỹ sư đồ họa 3D (Three.js r186 WebGPU/TSL) kiêm kỹ sư dữ liệu GIS, tiếp quản dự án **Saigon Open City Lab**: một PoC thành phố 3D cho khu trung tâm TP.HCM.

- Repo: `F:\File\FileLapTrinhF\SaiGon_SMTF`, ứng dụng ở `outputs/hcmc-poc/`.
- Chạy local: `python outputs/hcmc-poc/serve.py`, sau đó mở `http://127.0.0.1:8768/hcmc-poc/`. Trang `index.html` tự chuyển sang `webgpu-materials-24.html?v=30b&view=overview`.
- Ép WebGL 2: thêm `&backend=webgl`. Chọn hồ sơ chất lượng: `&quality=performance|balanced|presentation`.
- Runtime hiện tại là **30B**. Đợt này nâng lên **31A**: đổi các hậu tố `?v=30b` liên quan và `CORRECTIONS.version`.
- Dữ liệu cảnh (`data/scene.js` → `window.CITY_DATA`) gồm 70.726 công trình, 12.043 đoạn đường (trong đó 218 đoạn `bridge`), 241 vùng xanh và mặt nước. Dữ liệu được dựng bởi `scripts/prepare_scene.py` từ `data/osm-raw.json` (Overpass, `out body geom`).

**Đọc trước khi sửa:** `webgpu-materials-24.js` (file chính), `city-visual-runtime-30.js` (hồ sơ chất lượng, adaptive quality), `city-detail-runtime-28.js`, `city-hero-corridor-30.js`, `city-identity-facades-30.js`, `scripts/prepare_scene.py`, `VISUAL-RUNTIME-30B.md`, `MOTION-QA-26B.md` và các `scripts/qa-*.cjs`.

## 2. Hiện trạng đã khảo sát (bằng chứng, cần tự xác minh lại)

### 2.1 Mặt đường (`webgpu-materials-24.js`, khoảng dòng 388–419)
- `ribbon()` dựng **từng đoạn thẳng một thành một quad riêng**, không có miter hay bo góc ở đỉnh polyline. Kết quả là khe hở ở mặt ngoài khúc cua và chồng mép ở mặt trong.
- Mọi đường cùng loại nằm ở **cùng một độ cao** (`y=1.0`, asphalt `+0.09`, marking `+0.18`). Ở giao lộ, các ribbon chồng lên nhau gây z-fighting và vạch kẻ chạy xuyên qua giao lộ.
- Không có khái niệm nút giao: dữ liệu `D.roads` chỉ có `id,name,type,bridge,tunnel,lanes,c` và không có node ID để biết hai way nối nhau ở đâu.

### 2.2 Cầu
- Đường có `bridge=true` được nâng thẳng lên `y=13` (`const y=road.bridge?13:1.0`), **không có dốc dẫn**. Đầu cầu là một bậc thẳng đứng 12 m so với đường dưới đất và mặt cầu lơ lửng, không có trụ, dầm hay lan can.
- Cầu nhỏ qua kênh (Cầu Bông, Thị Nghè, Văn Thánh, Đen, Sơn…) cũng bị nâng 13 m giống cầu lớn.
- Chỉ **Cầu Ba Son** có kết cấu riêng (khoảng dòng 477–530), nhưng hộp mặt cầu ở `y≈11.25` vẫn chồng với ribbon OSM ở `y=13` của cùng cây cầu. Cần kiểm tra chồng lặp.
- Các cầu dạng signature khác (Thủ Thiêm, Sài Gòn, Khánh Hội, Nguyễn Văn Cừ, Chữ Y, Mống…) hiện chỉ là ribbon lơ lửng.

### 2.3 Xe (khoảng dòng 600–731)
- Mỗi xe gắn với **một đoạn thẳng duy nhất** và chạy `u=(phase+t*speed)%1`. Đi hết đoạn là **dịch chuyển tức thời** về đầu đoạn, không đi tiếp sang đoạn kế.
- Hướng (`side`) được chọn ngẫu nhiên cho từng xe, **bỏ qua `oneway`**. Xe ngược chiều xuất hiện trên đường một chiều.
- Tốc độ ngẫu nhiên cho từng xe trên cùng một làn, **không có bám xe hay giãn cách**, nên xe xuyên qua nhau.
- Không có xe trên cầu (`road.bridge` bị loại), không dừng ở giao lộ, không phân làn theo `lanes`.
- Các đoạn được chọn theo `score` có thành phần hash ngẫu nhiên. Mật độ phân bố lốm đốm và không thể hiện trục chính.
- Cập nhật toàn bộ 3.200 instance × 3 mesh trên CPU mỗi 1–3 frame, `frustumCulled=false`.

### 2.4 Mật độ và hiệu năng
- Toàn bộ 70.726 công trình được gộp vào **một mesh** (`city`, khoảng dòng 344), nên hiện không thể giảm số nhà khi đang chạy.
- Cây được rải ngẫu nhiên đều trong vùng xanh (tối đa 650 cây/vùng), gồm 1 thân + 3 tán + 1 tán xa mỗi cây.
- Đã có 3 hồ sơ `performance | balanced | presentation` trong `city-visual-runtime-30.js`, nhưng chúng **chỉ điều chỉnh hậu kỳ và bóng đổ**, không điều chỉnh lượng hình học. Giao diện chưa có điều khiển mật độ.

### 2.5 Dữ liệu nguồn hỗ trợ
`data/osm-raw.json` **có sẵn** `nodes` (node ID) của từng way, cùng các tag `oneway`, `layer`, `junction`, `maxspeed`. `prepare_scene.py` (khoảng dòng 135–139) đang bỏ hết những trường này.

### 2.6 Bằng chứng hình ảnh thực tế (ảnh trong `research/issues-31/`)
Mở từng ảnh và xác định đúng vị trí trên bản đồ (dùng nhãn trong ảnh, tên cầu, tên đường). Mỗi lỗi dưới đây phải có ảnh **trước/sau cùng góc nhìn** trong báo cáo.

| Ảnh | Lỗi quan sát | Nguyên nhân khả nghi (cần xác minh) |
|---|---|---|
| `01-vong-xoay-cau-vuot.webp` (vòng xoay + cầu vượt gần nhãn "Đồng Khởi") | Cầu vượt là dải phẳng lơ lửng, hai đầu cắt cụt giữa không trung, không có dốc và trụ. **Cột đèn mọc giữa lòng đường** và giữa vòng xoay. Đảo giao thông có mũi nhọn răng cưa. Xe nhỏ màu tối trông giống cọc. | `y=13` cố định cho cầu. Đèn được đặt cách tim **từng way** `width/2+1.8` (`city-detail-runtime-28.js`, khoảng dòng 126–150) mà không kiểm tra va chạm với mặt đường khác, nên ở đường đôi, nhánh rẽ hay vòng xoay, đèn rơi vào làn bên cạnh. |
| `02-giao-lo-nhin-tren.webp` (giao lộ nhìn từ trên, HUD: 118 FPS · 191 mesh · **9,1M tam giác**) | Các **gai tam giác** nhô ra ở mép đường tại giao lộ và khúc cua. Dải bó vỉa (edge) màu sáng cắt ngang lòng đường của đường khác. Vòng xoay bị cắt khúc. Hai chiều của đường đôi rời nhau, để lộ đất trống ở giữa. Cột đèn nằm nghiêng hoặc nằm trên mặt đường. | Ribbon không miter. Edge ribbon vẽ đè lên asphalt của way khác. Không có mặt giao lộ. 9,1M tam giác là quá cao cho cảnh này: cần đo phân bổ tam giác theo nhóm. |
| `03-cau-lo-lung-xuyen-nha.webp` (gần "Quảng trường Lam Sơn") | Bản mặt cầu hoặc cầu vượt phẳng lơ lửng giữa trời, **khối nhà xuyên qua mặt cầu**, mặt cầu kết thúc đột ngột. Có vệt đỏ lạ trên mặt nhà. | Đường `bridge` (hoặc `layer>0`, có thể là lối nối hoặc cầu vượt trong khu nhà) bị nâng 13 m cho dù thực tế có thể là cầu thấp hay hành lang nối. Footprint công trình nằm dưới hoặc trùng tuyến. Cần kiểm tra lại tag (`bridge`, `layer`, `highway=footway/service`, `covered`, `indoor`) và quyết định: hạ cao độ, bỏ qua, hoặc vẽ đúng loại. |
| `04-vach-qua-duong-den.webp` (đại lộ có dải phân cách) | **Vạch qua đường màu be có mép tua rua, răng cưa** nằm đè lên đường. Cột đèn đứng trên vạch qua đường và trên dải phân cách không đúng nhịp. Xe buýt hoặc xe tải chiếm cả làn nhưng không thẳng hàng với làn. | Footway/crossing được vẽ như ribbon pedestrian cùng độ cao gây z-fighting và aliasing. Cần vẽ crossing thành vạch zebra phẳng có `polygonOffset`, hoặc bỏ footway trùng lòng đường. |
| `05-dau-cau-ba-son.webp` (đầu cầu Ba Son) | Mặt cầu kết thúc bằng **một bức tường hộp xám** treo trên đường bên dưới. Đường mặt đất chạy luồn dưới, không nối lên cầu. Có công trình nhỏ nằm dưới đầu cầu. | Hộp mặt cầu Ba Son (`BoxGeometry(24,3.2,…)`, y≈11,25) không có mố hay dốc dẫn. Ribbon OSM ở y=13 và đường tiếp cận ở y=1 không được nối. |

**Lỗi chung thấy được:** nền đất màu be quá sáng làm lộ rõ mọi khe hở. Xe là các hộp đơn giản, khó đọc ở góc gần (có thể giữ dạng hộp nhưng cần tỉ lệ và màu đọc được là xe máy, ô tô, xe buýt).

## 3. Phạm vi công việc

### A. Backend — làm giàu dữ liệu mạng đường (`scripts/prepare_scene.py` hoặc script mới `scripts/build_road_graph_31.py`)
1. Giữ lại node ID cho từng đỉnh của đường sau khi cắt bbox. Đỉnh sinh ra do cắt bbox được đánh dấu là nút biên.
2. Xuất thêm `oneway` (chuẩn hóa `yes|-1|no`, mặc định `yes` cho `junction=roundabout`), `layer`, `maxspeed`, `junction`.
3. Dựng **đồ thị đường**: nút là node chung giữa các way (bậc ≥ 3 là giao lộ, bậc 2 là điểm nối). Cạnh là đoạn đường giữa hai nút.
4. Cho mỗi đường thuộc cầu, tính **profile cao độ**: điểm đầu và cuối chạm đất (hoặc nối với cầu hoặc cầu vượt kế tiếp), độ cao đỉnh phụ thuộc loại (cầu kênh khoảng 3–5 m, cầu vượt khoảng 6–8 m, cầu sông lớn theo khoảng tĩnh không, có thể khai báo trong một bảng cấu hình), dốc dẫn có độ dốc hợp lý (≤ 6–8 %) và chuyển tiếp mượt. `layer` dùng để phân xếp tầng.
5. Xuất ra file dữ liệu mới, ví dụ `data/road-graph-31.json` + `.js` (`window.ROAD_GRAPH_31`). **Không phá** định dạng `scene.js` cũ vì các module khác đang dùng `D.roads`.
6. Viết `scripts/validate_road_graph_31.py` kiểm tra: số nút và cạnh, không có cạnh mồ côi ngoài nút biên, mọi cầu có profile độ cao bắt đầu và kết thúc khớp với đường kế bên (sai lệch ≤ 0,05 m), tỉ lệ đường có `oneway`.

### B. Mặt đường liền mạch
1. Viết lại `ribbon()` hoặc module mới `city-road-network-31.js` dựng polyline **có miter** (giới hạn miter, góc gắt thì chuyển sang bevel).
2. Dựng **mặt giao lộ** (polygon hợp nhất các đầu đường tại nút bậc ≥ 3) để loại chồng ribbon. Vạch kẻ phải **dừng trước giao lộ**.
3. Tách thứ tự vẽ bằng `polygonOffset` hoặc offset độ cao có kiểm soát theo `layer` và thứ bậc đường để hết z-fighting. Ưu tiên `polygonOffset`/`renderOrder` hơn là nâng y tùy tiện.
4. Mặt đường dùng profile cao độ từ mục A, không còn hằng số `y=13`.

### C. Cầu
1. Đường cầu chạy theo profile ở mục A: dốc dẫn mượt, không còn bậc thẳng đứng.
2. Thêm kết cấu tối thiểu theo thủ tục cho cầu chưa có mô hình riêng: dầm hoặc bản mặt có độ dày, trụ theo khoảng cách hợp lý (chỉ đặt trụ trên mặt nước/kênh khi cần), lan can hai bên. Dùng `InstancedMesh` cho trụ và lan can.
3. Cầu Ba Son: giữ nguyên kết cấu dây văng hiện có (là signature) và **bỏ ribbon OSM trùng** hoặc khớp ribbon đúng vào hộp mặt cầu. Đầu cầu phải nối liền với đường hai bờ.
4. Không đổi hình dạng các cầu đã có mô hình chi tiết (Ba Son, cầu đi bộ Bạch Đằng `bach-dang-footbridge`). Chỉ sửa chỗ nối.

### D. Giao thông có logic
1. Xe chạy **trên đồ thị** ở mục A: đi hết cạnh thì chọn cạnh kế tiếp tại nút (ưu tiên đi thẳng hoặc giữ đường cùng tên, có xác suất rẽ). Không còn dịch chuyển tức thời giữa đường. Xe ra khỏi bbox thì tái sinh ở nút biên khác.
2. Tôn trọng `oneway`. Đường hai chiều thì đi bên **phải** (Việt Nam). Số làn lấy từ `lanes` hoặc suy theo loại đường.
3. Mô hình bám xe đơn giản (IDM rút gọn hoặc khoảng cách an toàn tối thiểu theo làn). **Không xe nào xuyên qua nhau**, xe nhanh phải giảm tốc sau xe chậm. Xe máy được phép chen làn trong giới hạn.
4. Giao lộ: nhường hoặc dừng đơn giản (ưu tiên đường cấp cao, hoặc chu kỳ đèn giả lập ở giao lộ trục chính). Mục tiêu là trông có trật tự, không cần mô phỏng chính xác.
5. Xe được chạy trên cầu, theo đúng cao độ và độ nghiêng của dốc.
6. Mật độ theo thứ bậc đường và giờ trong cảnh (ngày, giờ vàng, đêm), **phân bố xác định** (seed cố định) để demo lặp lại giống nhau.
7. Hiệu năng: chỉ cập nhật xe trong vùng nhìn hoặc bán kính quanh camera. Bật `frustumCulled` theo cụm hoặc tự cull. Giữ nguyên hoặc giảm chi phí CPU so với 30B (đo bằng `performance.now()` trong vòng cập nhật).
8. Ghi trạng thái vào `materialStatus.motion` và `document.body.dataset` như hiện có. Bổ sung số liệu: xe đang hoạt động, số lần chuyển cạnh, số vi phạm khoảng cách (mục tiêu = 0).

### E. Tính năng "Mật độ chi tiết" (UI)
1. Thêm điều khiển mật độ vào bảng điều khiển cảnh (`#controlBody` trong `webgpu-materials-24.html`), dạng 3–4 mức: **Đầy đủ / Cân bằng / Nhẹ / Tối thiểu**. Hỗ trợ tham số URL `&density=` và lưu `localStorage`. Nhãn tiếng Việt, đủ `aria-*`, dùng được bằng bàn phím, đúng phong cách các nút `data-light`/`data-view` hiện có.
2. Mỗi mức giảm theo tỉ lệ: số công trình nền (bỏ nhà nhỏ, thấp, xa trục chính trước theo điểm ưu tiên xác định), số cây (thưa đều, không bỏ trọn một khu), số xe/tàu, chi tiết phụ (`city-detail-runtime-28`: đèn, tum mái, lan can…).
3. Công trình đang là một mesh gộp. Hãy chia thành **chunk theo lưới** (hoặc draw range theo hạng ưu tiên) để ẩn/hiện mà không phải dựng lại toàn bộ. Đổi mức không được đứng hình quá khoảng 300 ms. Nếu phải dựng lại thì làm theo từng phần (`yieldMain`) và hiển thị trạng thái.
4. Có thể liên kết với adaptive quality (`createAdaptiveQuality`): FPS thấp kéo dài thì **đề xuất** hạ mức, không tự hạ khi người dùng đã chọn thủ công.
5. Hiển thị số liệu hiện tại (số nhà, cây, xe đang hiển thị) trong bảng runtime/QA nếu đã có chỗ.

### E2. Tiện ích đường phố và vạch qua đường
1. Đặt cột đèn dựa trên **mép mặt đường đã hợp nhất** (sau mục B), không dựa trên tim từng way. Loại mọi vị trí rơi vào bất kỳ mặt đường hay giao lộ nào. Đường đôi có dải phân cách thì được đặt đèn trên dải phân cách nếu đủ rộng. Giữ khoảng cách tối thiểu tới giao lộ và vạch qua đường.
2. Không đặt đèn hay chi tiết đường phố trong vòng xoay, đảo giao thông nhỏ hơn ngưỡng, hay trên cầu (trên cầu chỉ có đèn gắn lan can nếu cần).
3. Vạch qua đường: vẽ thành vạch zebra trên mặt asphalt (decal hoặc geometry mỏng có `polygonOffset`), không còn mép răng cưa. Footway trùng lòng đường không được vẽ thành dải be đè lên.
4. Tự kiểm tra bằng script: 0 cột đèn nằm trong polygon mặt đường.

### F. Quy tắc bất biến: KHÔNG BAO GIỜ giảm chi tiết signature
Tạo **một registry duy nhất**, ví dụ `data/signature-registry-31.js`, liệt kê tường minh các đối tượng được miễn giảm. Mọi bộ lọc mật độ phải đi qua registry này. Tối thiểu gồm:
- 3 hero envelope `heroEnvelopeIds` (801710792, 2000032897, 39598465).
- Cầu Ba Son (toàn bộ kết cấu), cầu đi bộ Bạch Đằng, các cầu lớn qua sông Sài Gòn và rạch Bến Nghé.
- Grand Marina và Marina Central (`WEBGPU_CORRECTIONS_24`).
- Hero corridor Lam Sơn – Đồng Khởi (`city-hero-corridor-30.js`), identity facades 30, photo facades.
- Các công trình gắn nhãn trong `places` (Bitexco, Nhà hát Thành phố, Bến Bạch Đằng, Nguyễn Huệ…) cùng footprint tương ứng.
- Cây và đèn trong phạm vi hero corridor và phố đi bộ Nguyễn Huệ.

Nếu có đối tượng signature khác thì bổ sung và ghi lý do vào registry. Viết test xác nhận: **ở mọi mức mật độ, 100 % đối tượng trong registry vẫn hiển thị**.

## 4. Ràng buộc
- Không thêm thư viện từ CDN. Thư viện mới (nếu thật cần) phải vendor vào `vendor/` và có giấy phép tương thích.
- Không đổi dữ liệu nguồn gốc, provenance hay attribution. Không xóa file dữ liệu cũ.
- Không phá Flood Lab (`flood-ui-25.js`, flood proxy ribbon), nhãn, các góc camera `data-view` hay chế độ ánh sáng.
- Đường WebGL 2 fallback vẫn phải chạy.
- Giữ phong cách code hiện có (ES module, tên tiếng Anh, comment ngắn). Comment mới bằng tiếng Việt có dấu hoặc theo ngôn ngữ của file.
- Mọi ngẫu nhiên phải có seed xác định.
- Nhãn "minh họa" (illustrative) cho giao thông và cầu thủ tục phải giữ nguyên trong status và UI. Đây không phải mô phỏng giao thông thực.

## 5. Tiêu chí nghiệm thu (đo được)
1. **Đường:** không còn khe hở hay chồng ở khúc cua; không còn z-fighting ở giao lộ trong 6 góc `data-view` ở ánh sáng ngày và đêm (có ảnh chụp trước/sau).
2. **Cầu:** 100 % đường cầu có dốc dẫn và chạm đường hai đầu (validator ở mục A pass); không còn bậc thẳng đứng; Ba Son không còn mặt cầu trùng.
3. **Xe:** không có teleport giữa đường; 0 xe ngược chiều trên đường một chiều; 0 cặp xe chồng nhau cùng làn (kiểm bằng script lấy mẫu N giây); xe có đi qua cầu.
4. **Mật độ:** mức "Tối thiểu" giảm ≥ 60 % số tam giác và draw call so với "Đầy đủ" (ghi số liệu `renderer.info`). Registry signature hiển thị 100 % ở mọi mức. Đổi mức ≤ 300 ms hoặc có tiến trình không đứng hình.
5. **Hiệu năng:** ở `quality=presentation` + mật độ "Đầy đủ", FPS không thấp hơn 30B quá 5 %. Ở "Cân bằng", FPS cao hơn rõ rệt. Ghi bảng số liệu ở cả 6 góc nhìn.
6. **QA:** mọi `scripts/qa-*.cjs` và `scripts/validate_demo_ready.py` vẫn pass. Thêm `scripts/qa-road-traffic-31.cjs` cho các tiêu chí 1–4.
7. Console không có lỗi mới, cả ở WebGPU lẫn `backend=webgl`.
8. **5 ảnh trong `research/issues-31/`:** chụp lại đúng góc đó sau khi sửa và đặt cạnh ảnh gốc trong `VISUAL-RUNTIME-31.md`. Từng lỗi trong bảng 2.6 được đánh dấu đã sửa hoặc còn tồn, kèm lý do.
9. **Không xuyên hình:** 0 công trình xuyên qua mặt cầu hay cầu vượt (kiểm bằng giao cắt footprint với hành lang cầu cộng chiều cao); 0 cột đèn trong mặt đường; 0 đầu cầu cắt cụt (mọi đầu cầu nối được với một cạnh đồ thị ở cùng cao độ).
10. **Ngân sách tam giác:** báo cáo phân bổ tam giác theo nhóm (công trình, đường, cây, chi tiết, xe). Ở mức "Đầy đủ" không vượt quá baseline 9,1M. Ở "Cân bằng" ≤ khoảng 5M, ở "Tối thiểu" ≤ khoảng 3M (con số có thể điều chỉnh nếu có lý do, nhưng phải ghi rõ).

## 6. Quy trình làm việc
1. Khảo sát và tự xác minh mục 2, chụp ảnh baseline 30B (6 góc × ngày/đêm) và số liệu FPS/`renderer.info`.
2. Viết kế hoạch ngắn, chia thành các bước độc lập theo thứ tự **A → B → C → E2 → D → E/F** (sửa hình học đường, cầu và đèn trước, rồi mới đến xe và mật độ). Mỗi bước là một commit riêng, có thông điệp tiếng Việt.
3. Mỗi bước: code → tự review diff → chạy validator/QA → chạy app thật, chụp ảnh so sánh → sửa → kiểm tra lại.
4. Không đánh dấu hoàn thành khi chưa có bằng chứng (ảnh, số liệu, output test).

## 7. Đầu ra
- Code và dữ liệu như trên. Version 31A trong các URL `?v=` liên quan.
- `VISUAL-RUNTIME-31.md`: thay đổi, số liệu trước/sau, ảnh so sánh, giới hạn còn lại.
- `RELEASE-QA-31A.md`: kết quả từng tiêu chí nghiệm thu (pass/fail + bằng chứng).
- Cập nhật README nếu thêm tham số URL hoặc điều khiển mới.
- Báo cáo cuối: điểm chưa đạt, rủi ro và đề xuất bước tiếp theo.

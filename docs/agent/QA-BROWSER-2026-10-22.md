# Kiểm thử thực tế qua Browser — 22/10/2026

## Phạm vi và bản được kiểm

Kiểm tra báo cáo của agent trước và thao tác thật trên web 3D, web cán bộ/chỉ huy/quản trị, cổng người dân. Mọi thao tác giao diện thực hiện bằng plugin Browser qua `cua_repl`, trên Browser tích hợp và Chrome. Không dùng kết quả unit test thay cho việc chạy giao diện.

- Checkout hiện tại: `F:/File/FileLapTrinhF/SaiGon_SMTF`, nhánh `main`, HEAD `547679e`.
- Có sẵn 5 tệp đang sửa: `smart-app-32.js`, `station-client-32.js`, test của station client, backend `routers/station.py`, seed `cameras.json`. Đây là trạng thái đầu phiên, không phải thay đổi của đợt kiểm thử này.
- Commit báo cáo `6d9ccd3` thuộc worktree `C:/Users/Admin/orca/workspaces/SaiGon_SMTF/porbeagle`, nhánh `Kietvo2k/explore-and-suggest-improvements`. Đã đọc báo cáo và kế hoạch bằng `git show`; không merge/cherry-pick hoặc chuyển nhánh.
- Các kết luận dưới đây áp dụng cho **HEAD cộng thay đổi chưa commit hiện tại**, không mặc nhiên áp dụng cho worktree của agent trước.
- Môi trường QA dùng DB riêng tại `work/browser-qa-2026-10-22/var/smart-traffic.db`; tắt tác vụ dọn nền trong môi trường QA. Không dùng DB vận hành sẵn có.
- Static 3D: `127.0.0.1:8821`; API: `127.0.0.1:8900`; Vite: `127.0.0.1:5173`. Dùng Python trong `.venv` và `node_modules` đã có; không cài thêm thư viện.

## Kết quả thao tác

| Mã | Thử nghiệm thật | Kết quả |
|---|---|---|
| B01 | Đăng nhập `officer1` | Vào được web cán bộ; nhãn vai trò đúng |
| B02 | Cán bộ mở Điều khiển | Hiện chế độ chỉ xem, không có các lệnh dành cho chỉ huy |
| B03 | Dùng `citizen1` đăng nhập web cán bộ | Bị từ chối với thông báo không có quyền |
| B04 | Chỉ huy đổi đèn từ Cố định sang Thông minh | Web báo chờ trạm, sau đó công tắc trên 3D và trạng thái web đều chuyển đúng |
| B05 | VMS-01: chọn thủ công, lưu `QA: KIỂM THỬ VMS` | Trạm báo đúng nội dung và chế độ thủ công; đã gửi lệnh trả về tự động sau khi thử |
| B06 | Chọn camera 001 và 010 | Có ảnh thật; camera 010 có `naturalWidth=1280`, `naturalHeight=720`, `complete=true`. Dropdown có 10 camera |
| B07 | Nút toàn màn hình camera | Accessibility chuyển sang chỉ còn ảnh và khung camera. Escape trong Browser tích hợp không thoát được trong phiên thử; reload trang thoát được. Không kết luận lỗi Escape trên Chrome |
| B08 | Bắt WebSocket từ Browser qua DevTools | Nhận `stream.updated`, phần `data` chỉ có `camera_id`, `seq`; các mẫu khoảng 124 ký tự, không chứa JPEG base64 |
| B09 | Bật bản đồ nhiệt trên 3D và mở bản đồ nhiệt cán bộ | Có dữ liệu đoạn đường, KPI và cảnh báo truyền sang web; đã thấy 468 đoạn có mức nhiệt |
| B10 | Chạy/dừng Ngập Nguyễn Hữu Cảnh trên 3D | Trạng thái chuyển sang đang chạy rồi về chưa chạy kịch bản nào |
| B11 | Tua `+1 phút` trên Chrome | Có trạng thái đang tua, sau đó thông báo hoàn tất và các nút được bật lại |
| B12 | Tua `+10 phút` trên Browser tích hợp | Chưa hoàn tất khi kết thúc thử tab đó; đã lưu snapshot đang tua. Không đánh dấu đạt |
| B13 | Đăng nhập công dân seed | Thấy biển số đã gắn `51K-888.88`, danh sách cá nhân, thông báo |
| B14 | Tra cứu công khai | Ban đầu không có kết quả; sau vòng đời hồ sơ nhận đúng 1 kết quả đã nộp. Biển `ABC` trả không có kết quả |
| B15 | Cán bộ xác nhận hồ sơ QA | Hệ thống tự thông báo cho tài khoản có biển số tương ứng |
| B16 | Công dân gửi khiếu nại | Chuyển sang đang khiếu nại, ẩn nút nộp; cán bộ nhận được đơn |
| B17 | Cán bộ giữ vi phạm, công dân ghi nhận đã nộp | Hồ sơ trở về đã thông báo, sau đó thành đã nộp; audit ghi đủ chuỗi chuyển trạng thái |
| B18 | Quản trị xem cán bộ và lọc nhật ký | Thấy 2 tài khoản cán bộ/chỉ huy seed, lọc đúng audit theo mã vi phạm. Không đổi quyền, khóa hoặc tạo tài khoản |
| B19 | Gửi mức phạt giả 1 đồng từ trạm | **Không đạt:** backend nhận và web hiển thị 1 đ – 1 đ |
| B20 | Tự chuyển Preview sang Lite | **Không đạt:** mất `app=smart`, mất HUD giao thông, trở về City Lab; tái hiện trên hai Browser |
| B21 | Chỉ huy chạy Xe ưu tiên | **Không đạt:** web báo thành công, 3D vẫn chưa chạy kịch bản nào; trạm không hỗ trợ `priority-run` |
| B22 | Theo dõi console cổng người dân khi có nhiều cảnh báo | **Không đạt:** nhiều lỗi React do trùng key |
| B23 | Mở bảng Vật liệu đô thị khi Smart HUD đang hiện | **Không đạt:** hai bảng chồng lên nhau, các tùy chọn Preview/Lite phía dưới bị che |

Các thao tác xác nhận/khiếu nại/ghi nhận đã nộp chỉ áp dụng cho hồ sơ giả trong DB QA; nút đã nộp chỉ đổi trạng thái, không có giao dịch tiền thật. Dữ liệu hai hồ sơ được chuẩn bị bằng API trạm; toàn bộ các bước nghiệp vụ tiếp theo được thực hiện qua Browser.

## Lỗi ưu tiên sửa

### QA-01 · P1 — Backend tin số tiền do trạm gửi

Hồ sơ `VP-20261022-000045`, mã `RED-LIGHT`, ô tô: gửi `vnd_min=1`, `vnd_max=1`, `verified=true`. API trả thành công, web cán bộ hiện `1 đ – 1 đ`; đọc SQLite sau đó vẫn thấy đúng số tiền giả.

Nguyên nhân đối chiếu mã: `outputs/smart-traffic/backend/app/routers/station.py:118` ghi thẳng `data['penalty']`. Cần tính/kiểm lại mức phạt tại backend theo bảng quy tắc có phiên bản; không dùng cờ `verified` do trạm tự khai làm bảo đảm.

Bằng chứng: [ảnh](../../work/browser-qa-2026-10-22/chrome-penalty-1dong.png), [DOM](../../work/browser-qa-2026-10-22/officer-penalty-1dong.txt), [fixture](../../work/browser-qa-2026-10-22/fixtures.json). Đây là kiểm tra ranh giới tin cậy phần mềm, không phải xác minh tính đúng của bảng tiền phạt pháp lý.

### QA-02 · P1 — Tiết kiệm tài nguyên làm thoát khỏi Smart Traffic

Vào trang với `app=smart&mode=preview&quality=performance`. Sau khởi tạo và tự chuyển Lite, URL thành `v=31a&view=overview&quality=performance&region=bac&mode=lite&light=day`, không còn `app=smart`. `#smartHud32` không tồn tại, menu chuyển thành Khu trung tâm. Đã thấy cả trên Browser tích hợp và Chrome.

Nguyên nhân: `webgpu-materials-24.js:1031` xử lý đổi mode bằng một `URLSearchParams()` mới; đoạn 1038–1044 chỉ giữ một số tham số và không giữ `app`. `applyResourceSaver32` gọi `modeController.choose('lite')`, nên lỗi xảy ra cả khi hệ thống tự tiết kiệm. Cần giữ ngữ cảnh ứng dụng khi thay đổi cấu hình đồ họa.

Bằng chứng: [URL trước/sau](../../work/browser-qa-2026-10-22/mode-loss.json), [DOM sau lỗi](../../work/browser-qa-2026-10-22/chrome-after-autosave.txt), [ảnh](../../work/browser-qa-2026-10-22/chrome-after-autosave.png). Ảnh menu City Lab người dùng gửi khớp với trạng thái lỗi này.

### QA-03 · P1 — Báo chạy Xe ưu tiên thành công dù trạm chưa hỗ trợ

Chỉ huy chọn Xe ưu tiên, xác nhận trong hộp thoại. Web hiện `Đã chạy kịch bản: Xe ưu tiên chạy qua` và tên kịch bản đang chạy. Cùng thời điểm, 3D vẫn hiện `Chưa chạy kịch bản nào`.

Backend `schemas.py:178` nhận `priority-run`; `ControlsTab.tsx` báo thành công ngay sau khi API nhận lệnh. Trong khi đó `scenarios-32.js:12` chỉ hỗ trợ `none`, `peak-hang-xanh`, `lane-block`, `flood-nhc`; `start()` từ chối khóa lạ. Cần phân biệt lệnh đã gửi với lệnh trạm đã áp dụng, đồng thời ẩn/khóa tính năng chưa hỗ trợ cho đến khi triển khai xe khẩn cấp thật.

Bằng chứng: [web báo thành công](../../work/browser-qa-2026-10-22/officer-priority-success.txt), [3D không chạy](../../work/browser-qa-2026-10-22/chrome-priority-rejected.txt). Đã gửi lệnh dừng sau khi kiểm tra.

### QA-04 · P2 — Danh sách cảnh báo công dân trùng key React

Khi dữ liệu cảnh báo tăng, console liên tục báo `Encountered two children with the same key`, ví dụ `Điện Biên Phủ-30-75`, `Phan Đăng Lưu-30-74`. Một tên đường xuất hiện ở nhiều đoạn nhưng key tại `TrafficAlertsPanel.tsx:47` chỉ ghép tên đường, thời hạn và xác suất. Các tổ hợp này không duy nhất.

Cần định danh theo đoạn/cảnh báo ổn định hoặc gom cảnh báo theo đường trước khi vẽ; kiểm lại qua dữ liệu thật có nhiều đoạn. Hiện đã xác nhận lỗi console, chưa chứng minh bản ghi cụ thể nào bị mất do React.

Bằng chứng: [console](../../work/browser-qa-2026-10-22/citizen-console.json).

### QA-05 · P2 — Bảng điều khiển City Lab chồng lên Smart HUD

Mở Vật liệu đô thị trong Smart Traffic: bảng đồ họa và HUD giao thông đều chiếm phía phải. HUD che nút Preview/Lite và các tùy chọn bên dưới; thử click không thay đổi mode. Bảng dài còn vượt mép dưới màn hình.

Bằng chứng: [ảnh chồng bảng](../../work/browser-qa-2026-10-22/chrome-panels-overlap.png). Hướng sửa là một bố cục riêng cho Smart Traffic, giữ tùy chọn đồ họa cần thiết trong mục cài đặt gọn; không tiếp tục đặt hai bảng độc lập lên cùng tọa độ.

## Đối chiếu với báo cáo trước

- PERF-3 có hiệu lực trên cây hiện tại dưới dạng thay đổi chưa commit: WebSocket thực sự phát metadata thay vì base64. Không gọi đây là commit mới của phiên kiểm thử.
- Hiện `node_modules` đã có ở checkout này. Nhận định chưa cài trong báo cáo trước thuộc môi trường/worktree khác.
- Hiện mã có banner tự tiết kiệm tài nguyên và đã thấy nó trên UI. Nhận định hoàn toàn không có thông báo không còn đúng với cây hiện tại. Banner có lúc báo đã bật trong khi checkbox đang tắt; cần kiểm lại đồng bộ trạng thái sau khi sửa QA-02.
- Cán bộ chỉ thấy mã camera trong dropdown mặc dù seed và API có `label`: `ViolationsTab.tsx` biến các lựa chọn thành danh sách `value`, làm mất nhãn. Không chỉ là thiếu nhóm camera.
- Runtime báo 4 VMS và đã thử gửi nội dung tới VMS-01. Không dùng câu “0 VMS” của báo cáo cũ làm kết luận cho runtime hiện tại; số bảng 3D đúng vị trí cần khảo sát riêng.
- Chưa có lưới nhiều camera; chưa hiện căn cứ pháp lý/điểm trừ từ `penalty.source` trong hồ sơ được thử. Các nhận xét này vẫn phù hợp.
- Query sinh mã bằng `COUNT ... LIKE` và vòng gửi WebSocket tuần tự còn trong mã. Chưa chạy bài tải hoặc client mạng chậm để đo tác động.

## Bằng chứng dữ liệu SQLite

Đọc DB QA ở chế độ chỉ đọc sau các thao tác Browser:

| Hồ sơ | Trạng thái lưu | Nội dung xác nhận |
|---|---|---|
| `VP-20261022-000044` | `paid` | Vòng đời qua web đã lưu bền vào SQLite |
| `VP-20261022-000045` | `new` | `penalty_json` còn `vnd_min=1`, `vnd_max=1` |

Audit của hồ sơ 44 có đủ `new → confirmed → notified → disputed → notified → paid`, đúng các vai trò cán bộ/hệ thống/công dân. Xem [audit](../../work/browser-qa-2026-10-22/audit-lifecycle.txt), [ảnh audit](../../work/browser-qa-2026-10-22/audit-lifecycle.png) và [kết quả đọc SQLite](../../work/browser-qa-2026-10-22/sqlite-verification.json).

Backend đã dùng SQLite qua `app/db.py`; cấu hình mặc định là `outputs/smart-traffic/var/smart-traffic.db`. Ảnh và video hiện lưu bằng tệp trên đĩa; đây là phần cần làm rõ nếu yêu cầu SQLite bao gồm cả nội dung nhị phân.

## Giới hạn và môi trường

- Đầu phiên RAM trống khoảng 0,56 GB, một số thời điểm sau đó tăng lên hơn 3 GB. Không đóng ứng dụng cá nhân của người dùng.
- HUD Smart Traffic đã hiển thị khoảng 1–4 FPS; sau khi lỗi QA-02 đưa về City Lab, có mẫu HUD 115 FPS. Đây là quan sát tức thời, **không phải phép đo A/B hoặc nghiệm thu T6**.
- DOM của Chrome báo backend `webgpu`, `visibilityState=visible`. Chưa xác nhận adapter phần cứng; Browser chặn `chrome://gpu` theo chính sách URL. Không tìm cách vượt chặn.
- Browser tích hợp nhiều lần không chụp được ảnh; đã chuyển bài chụp ảnh sang Chrome. Ảnh Chrome trong thư mục bằng chứng là ảnh trang thật.
- Chưa đo soak dài hạn, mạng chậm, FPS theo các cửa sổ thời gian chuẩn, viewport di động, hoặc hiệu ứng tab ẩn có kiểm soát. Không tuyên bố nghiệm thu toàn bộ hệ thống.
- Chưa khảo sát đầy đủ từng cụm đèn/cột đèn/stop line. Nhận xét của người dùng về nhiều đèn tại nút giao được chuyển sang backlog với trạng thái cần kiểm chứng.
- Đợt này tạo tài liệu và dữ liệu QA; không sửa mã ứng dụng, không commit thay đổi có sẵn.
- Các dịch vụ QA còn chạy để xem lại ở ba cổng nêu trên; [manifest tiến trình khởi tạo](../../work/browser-qa-2026-10-22/processes.json). Tab 3D đã đóng sau khi lưu bằng chứng để giảm tải máy.

Định hướng sản phẩm và các nhận xét bổ sung của người dùng nằm trong [backlog UX/nghiệp vụ](BACKLOG-2026-10-22-ux-nghiep-vu.md).

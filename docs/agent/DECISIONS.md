# Quyết định đã chốt — Smart Traffic khu Bắc (SaiGon SMTF)

Nguồn: phỏng vấn người dùng 13–14/10/2026. Đây là ĐẦU VÀO BẮT BUỘC cho mọi agent. Không tự đổi quyết định; thấy mâu thuẫn thì ghi vào báo cáo.

## 1. Mục tiêu và bối cảnh
- Đồ án / cuộc thi. Demo giải pháp giao thông thông minh trên digital twin 3D Sài Gòn đã có (nhánh 31A, Three.js r186 WebGPU + WebGL2 fallback, app tĩnh `outputs/hcmc-poc/`).
- Chỉ làm khu `bac` (Phía bắc · Thị Nghè · Bình Thạnh · Landmark 81, định nghĩa ở `outputs/hcmc-poc/city-region-31.js`). Các khu khác KHÓA tạm.
- Không hạn chót; làm kỹ, có nghiệm thu từng mốc. Máy demo chưa biết → mọi thứ phải co giãn theo FPS.

## 2. Cảnh 3D (trạm mô phỏng)
- Vào app: `index.html` chuyển hướng thêm `&app=smart` (và `?v=32a`). Mở thẳng `webgpu-materials-24.html` KHÔNG có `app` = 31A cổ điển y nguyên (giữ QA 31 chạy được).
- `app=smart`: region cố định `bac`; bộ chọn khu hiện 3 khu còn lại bị khóa (biểu tượng khóa, không chọn được); ẩn các panel cổ điển không dùng (giữ Flood Lab vì kịch bản ngập).
- Khu ngoài bắc: NỀN XÁM TỐI GIẢN — chỉ đất + nước + đường chính mờ xám, không nhà/cây/xe, có viền ranh. Phải cắt mesh đất/nước/đường theo khu (31A đang gộp toàn cảnh).
- Nhà trong khu bắc: khối hộp đơn giản màu trung tính không texture; bỏ nhà nhỏ trong hẻm, giữ nhà dọc trục chính. Signature registry trong khu giữ 100 % chi tiết (Landmark 81, Vinhomes Central Park, cầu Sài Gòn/Thị Nghè/Văn Thánh, Saigon Pearl, cao ốc Nguyễn Hữu Cảnh, và mọi mục registry trong khu).
- Xe: giữ trục chính đủ đông để ùn; đường nhỏ bỏ bớt nhưng vẫn còn một phần (ít xe). Bộ phá kẹt `BREAKER_S=50 s` của sim 31A phải tắt/nới trong app smart (nó xóa kẹt thật).
- Đèn giao thông 3D (cột, đèn 3 màu, đếm ngược), biển báo, cột camera (có FOV), bảng VMS điện tử — ở NHIỀU nút trọng điểm (Hàng Xanh, ĐBP–XVNT, Đinh Bộ Lĩnh, Nguyễn Hữu Cảnh, đầu cầu Sài Gòn, Phan Đăng Lưu–Lê Quang Định, ĐBP–Nguyễn Bỉnh Khiêm, …); nút nhỏ còn lại đèn cố định đơn giản.

## 3. Lõi điều phối
- Đèn thích ứng: max-pressure theo hàng chờ (xanh tối thiểu/tối đa, vàng 3 s, đỏ chung 2 s) + công tắc A/B "Đèn cố định ↔ Thông minh" + KPI sống (thời gian chờ TB, hàng chờ max, lưu lượng). Hook hiện tại: hàm `green(node, st)` trong `city-traffic-sim-31.js` (2 nhóm pha, chu kỳ cố định 44 s) → thay bằng giao diện bộ điều khiển cắm được. Sim là JS thuần chạy được trong Node → kiểm thử tất định.
- Bản đồ nhiệt: tạo từ chính sim (tốc độ/hàng chờ/mật độ theo đoạn), lớp ribbon riêng phủ lên đường khu bắc; có lịch sử theo giờ.
- Dự báo kẹt: lịch sử theo giờ + xu hướng 5 phút gần nhất + chạy bản sao sim tua nhanh trong Web Worker (10–30 phút tới) → xác suất kẹt từng đoạn + độ tin cậy → cảnh báo.
- Điều hướng: xe THẬT SỰ rẽ tránh đoạn bị cảnh báo (giảm xác suất rẽ vào, một phần xe tuân thủ) + bảng VMS 3D hiện thông báo. Sim 31A không có điểm đến (chọn hướng ngẫu nhiên có trọng số tại nút).
- Đồng hồ trong ngày, tua nhiều nấc: giây, phút, giờ, ngày. Giây/phút = sim chạy nhanh thật; giờ/ngày = nhảy mốc + dựng lại phân bố xe theo nhu cầu giờ đó; lịch sử nhiều ngày dựng offline (chạy sim headless) rồi nạp DB.
- Kịch bản bấm-là-chạy: giờ cao điểm; sự cố chặn làn; ngập Nguyễn Hữu Cảnh (dùng Flood Lab 25A sẵn có); xe ưu tiên chạy qua.
- Xe ưu tiên (cứu thương, cứu hỏa, cảnh sát): làn sóng xanh trên tuyến; xe khác tạt lề/vượt đỏ để nhường → vi phạm lúc đó tự gắn cờ "nghi nhường xe ưu tiên" để công an duyệt gỡ; người dân cũng khiếu nại được.

## 4. Camera AI (model KHÔNG train — mô hình nhận diện là mô phỏng có quy luật)
- "Perception": xe nằm trong FOV camera (từ trạng thái sim) → khung nhận diện + loại xe + màu + biển số OCR, có nhiễu và độ tin cậy; tin cậy thấp → hàng "cần xác minh".
- Lỗi cần phát hiện (xe trong sim thật sự phạm lỗi với tỉ lệ nhỏ): vượt đèn đỏ / dừng quá vạch; sai làn / lấn làn / đè vạch liền; ngược chiều; quá tốc độ; dừng đỗ sai; không đội mũ bảo hiểm; không nhường xe ưu tiên; chở quá số người; quay đầu / rẽ sai nơi cấm; dùng điện thoại / không thắt dây an toàn.
- Bằng chứng: ảnh chụp từ góc camera (render-to-texture) trước/sau vạch + ảnh cắt biển số; dữ liệu: biển, loại xe, màu, thời gian, camera, nút, trạng thái đèn, tốc độ, độ tin cậy.
- Biển số: định dạng VN (ô tô `51K-123.45`, xe máy `59-X1 234.56`), bộ cố định sinh tất định từ seed (kèm chủ xe giả, loại, màu); có vài biển "kịch bản" chắc chắn có lỗi để tra khi thuyết trình (ghi trong tài liệu seed, KHÔNG trên UI).
- Stream: (a) render góc camera trong cảnh 3D, (b) video thật: thả `media/cameras/<MÃ-CAM>.mp4` đúng mã camera là tự gắn; (c) khe cắm model ONNX pretrained tùy chọn `models/vehicle-detector.onnx` để phân tích video thật; không có file → dùng perception mô phỏng (theo file nhãn `<MÃ-CAM>.labels.json` nếu có, không thì sinh có quy luật).

## 5. Backend + web
- Backend: FastAPI + SQLite, ĐƠN GIẢN (không quá phức tạp). JWT, vai trò: `citizen`, `officer`, `commander`, `admin`. WebSocket cho sự kiện sống. venv riêng của backend; không cài global.
- Nguồn sự thật = TAB 3D (trạm mô phỏng): đẩy số đo, sự kiện vi phạm, ảnh bằng chứng, khung stream camera 3D (2–5 fps) lên backend; nhận lệnh (ghi đè pha, A/B, kịch bản, nội dung VMS) qua WS. Mất kết nối → hàng đợi IndexedDB, gửi lại.
- Web: React + Vite (một project, hai entry): **web công an** và **web người dân**; backend phục vụ bản build.
  - Công an: điều hành (bản đồ nhiệt sống, dự báo, cảnh báo, lưới stream 3D + video), duyệt vi phạm (xác nhận / gỡ / cần xác minh, cờ xe ưu tiên, nhật ký), xử lý khiếu nại, điều khiển thủ công (ghi đè pha, A/B, kịch bản, soạn VMS), thống kê, phân quyền.
  - Người dân: tra cứu theo biển số + loại xe → lỗi, thời gian, địa điểm, ảnh/clip, mức phạt, trạng thái; khiếu nại trực tuyến + theo dõi; nộp phạt = chỉ đổi trạng thái (KHÔNG thanh toán thật, KHÔNG form thẻ); tài khoản gắn biển số + thông báo lỗi mới; xem cảnh báo kẹt công khai.
- Mức phạt: theo Nghị định 168/2024/NĐ-CP (hiệu lực 01/01/2025) — phải có nguồn trích dẫn; chưa xác minh được thì ghi "cần xác minh" trong tài liệu kỹ thuật.

## 6. Ràng buộc trình bày (bắt buộc)
- UI của app smart và hai web KHÔNG được ghi "giả lập", "mô phỏng", "minh họa", "illustrative", "simulated", "demo", "fake" ở bất cứ đâu. Chỉ tài liệu kỹ thuật/mã/README ghi rõ bản chất mô phỏng. QA phải quét chuỗi UI.
- KHÔNG dùng logo, tên, tên miền của CSGT, Bộ Công an, Cổng dịch vụ công hay cổng phạt nguội thật. Dùng tên trung tính, ví dụ "SaiGon SMTF · Trung tâm điều hành giao thông khu Bắc" và "Tra cứu vi phạm giao thông".
- Tiếng Việt có dấu, UTF-8.

## 7. Kỹ thuật chung
- Worktree `C:/Users/Admin/orca/workspaces/SaiGon_SMTF/smart-bac`, nhánh `Kietvo2k/smart-traffic-bac`. Không đụng `main`. Không `git add -A`, không `git stash`/`reset --hard`; chỉ add đúng file của mình. Không commit `work/oc-*`, `work/tmp*`, `var/`, `node_modules/`, `.venv/`, media/model lớn.
- Cổng: static 3D `serve.py` PORT=8821 (agent tự dùng cổng riêng khác nếu chạy song song); backend 8900; Vite dev 5173.
- Module 3D mới đặt tên `*-32.js` trong `outputs/hcmc-poc/`, khóa cache `?v=32a`. Backend/web ở `outputs/smart-traffic/{backend,web,media,models,var}`.
- Server/tiến trình nền: luôn `nohup … > file 2>&1 < /dev/null &` (không để bash tool chờ vô hạn); tắt server/Chromium của mình khi xong.
- Kiểm thử: `node --test` cho logic sim/điều khiển/luật vi phạm (tất định, seed); `pytest` cho backend; Playwright/Chromium kiểu `scripts/qa-*-31.cjs` cho e2e.

## 8. Lộ trình mốc
- M1 Lát mỏng Hàng Xanh xuyên suốt: app=smart cơ bản (region bac khóa), đèn 3D + 1–2 camera ở cụm Hàng Xanh (≈ x 0, z −2485 hệ cảnh; cụm nút ĐBP × XVNT, có cầu vượt Hàng Xanh), bộ điều khiển cắm được (cố định + max-pressure) + A/B + KPI, lỗi vượt đèn đỏ, perception + biển số, ảnh bằng chứng, backend tối thiểu (auth, vi phạm, bằng chứng, tra cứu, WS), web công an tối thiểu (đăng nhập, danh sách sống, duyệt/gỡ, 1 ô stream 3D, KPI), web người dân tối thiểu (tra cứu + bằng chứng), đo KPI A/B headless trong Node, script chạy cả hệ (`run-smart`).
- M2 Khu bắc gọn: nền xám khu khác, khối đơn giản, thưa đường nhỏ, tắt bộ phá kẹt, quét bỏ chữ cấm trên UI.
- M3 Mạng nút + camera + VMS toàn khu bắc.
- M4 Bản đồ nhiệt + dự báo + điều hướng + đồng hồ tua.
- M5 Đủ loại lỗi + xe ưu tiên + 4 kịch bản.
- M6 Web đầy đủ: khiếu nại, nộp phạt, tài khoản/thông báo, thống kê, phân quyền, điều khiển thủ công, VMS, video upload + khe ONNX, lưới stream co giãn.
- M7 Nghiệm thu tổng + tài liệu.
Sau M1: dòng 3D (M2→M3→M4→M5) và dòng web (M6) chạy song song, tối đa 2 agent.

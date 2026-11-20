# Kế hoạch demo-v2 — từ bản nộp tối giản sang demo sống (20/11/2026)

Nguồn: chẩn đoán có bằng chứng tối 20/11 — gọi API trên URL production, đọc ảnh live chụp từng màn,
soi mã nguồn artifact `fea7fb0`. Người dùng chốt hướng: **đi theo luồng trình diễn** trong
[docs/mockups/mockup-demo-flow.html](../mockups/mockup-demo-flow.html), bỏ Antigravity (giữ lại 5 commit nhóm A của nó).

Đích: `https://saigon-smtf-submit.vercel.app` chạy đúng luồng "Chín mươi giây trước giám khảo" —
3D là trạm điều khiển sống, web cán bộ nhận dữ liệu trực tiếp, người dân tra ra hồ sơ có bằng chứng.

## 1. Hiện trạng (SHA `fea7fb0`, production đã chạy)

- API sống: session/officer/lookup/camera/media đều HTTP 200; seed 10 nút / 15 camera / 1 hồ sơ;
  ảnh mẫu chỉ 6/15 camera (CAM-BAC-001…005 + CAM-HX-001).
- Cổng bàn giao: NAV đạt, DATA đạt, CAM đạt (theo phương án ảnh mẫu), **SIGNAL ĐỎ**
  (pha vàng 3 s chưa chứng minh được tại Bac-02), HUD 768 chưa kết luận.
- Route 3D `/hcmc-poc/` boot `outputs/hcmc-poc/public-submit/entry.mjs` — **2,4 KB, viewer lite**:
  không nạp `smart-app-32.js` → không có bản đồ nhiệt, dự báo, VMS, kịch bản, đèn A/B, KPI.
  Nhà hiển thị là **decal trắng phẳng đè lên mặt đường**; xe là chấm 2–3 px không theo làn; toast "29 FPS".
- Web cán bộ: camera mặc định (Bac-01) **không có ảnh** → khung trống; ~60 % trang trống;
  đúng 1 hồ sơ, trạng thái `confirmed` tiếng Anh không màu.
- Web người dân: chỉ 1 ô nhập + 1 dòng lỗi; không bằng chứng, không dòng thời gian, không khiếu nại.
- Landing: **lỗi dấu tiếng Việt thật** ("Tín hiệu đồng nhịp" vỡ thành "đồ ng nhịp"), eyebrow
  "MÔ PHỎNG GIAO THÔNG" **vi phạm §6 DECISIONS**; hero nhúng ảnh của bản app khác với bản đang chạy.
- "YOLOv8" là claim **SAI** với sản phẩm: khung nhận diện sinh từ trạng thái sim (DECISIONS §4).
  Cấm đưa lên UI.

## 2. Quy tắc trung thực (bắt buộc mọi lát, mọi subagent)

1. Không ghi "YOLOv8 / YOLOX / model AI thật" trên UI. Ghi "khung nhận diện tự động".
2. Không chữ "mô phỏng / giả lập / minh họa / demo / fake / simulated" trên UI (§6).
   Bản chất dữ liệu chỉ ghi trong tài liệu kỹ thuật.
3. Tiếng Việt có dấu, UTF-8. Heading tiếng Việt: **cấm `text-transform: uppercase` + `letter-spacing`**
   (đây là nguyên nhân lỗi "đồ ng nhịp"); dùng font Be Vietnam Pro.
4. Dữ liệu mẫu phải có nhãn ("Dữ liệu mẫu", "Ảnh mẫu"); nguồn sống hiển thị "Trực tiếp".
5. `penalty.source` và điểm trừ GPLX đã có sẵn trong dữ liệu — hiển thị đúng, không bịa căn cứ.

## 3. Công việc theo lớp, theo trọng số giảm dần

### P0 — Chặn nhanh (làm đầu tiên, ≤ 1 phiên)

| # | Việc | Cách |
|---|---|---|
| P0-1 | Sửa lỗi dấu landing | bỏ uppercase/letter-spacing trên heading tiếng Việt, Be Vietnam Pro |
| P0-2 | Bỏ chữ cấm §6 (eyebrow "MÔ PHỎNG…") | đổi thành "ĐIỀU KHIỂN THÍCH ỨNG · KHU BẮC" |
| P0-3 | Camera mặc định luôn có ảnh | đổi camera mở đầu sang CAM-BAC-002 (đã có ảnh) hoặc seed ảnh cho CAM-BAC-001 |
| P0-4 | Seed thêm 5–8 hồ sơ mẫu đa dạng | migration/seed idempotent (đã có sẵn) + `scripts/vercel/seed-samples.mjs` |
| P0-5 | Trạng thái tiếng Việt có màu | "confirmed" → "Đã xác nhận" + badge; map đủ 7 trạng thái |

### P1 — Trạm 3D sống (việc nặng nhất, giá trị lớn nhất)

| # | Việc | Module có sẵn trong repo |
|---|---|---|
| P1-1 | Nạp app smart vào `/hcmc-poc/` + **bản đồ nhiệt** | `smart-app-32.js`, `heat-*-32.js` |
| P1-2 | Đèn A/B + KPI sống | `signal-plan-32.js`, `traffic-controller-32.js`, `kpi-panel-32.js` |
| P1-3 | Overlay khung nhận diện + **đẩy frame sống** `POST /api/demo/frame` (1 frame/3 s, 2 slot/phiên, 256 KiB) | `camera-capture-32.js`, `violation-perception-32.js` |
| P1-4 | Kịch bản + VMS + đồng hồ tua | `scenarios-32.js`, VMS, clock |
| P1-5 | Hình học: nhà lùi khỏi corridor đường (hết decal đè nhựa), xe mesh lite đúng làn | city-lock/geometry modules |
| P1-6 | SIGNAL: chứng minh vàng 3 s + đỏ chung 2 s (cổng đang đỏ) | `traffic-controller-32` + trace sampler |

### P2 — Web làm được việc

- **Cán bộ:** lưới camera + lọc theo nút (reuse 5 commit nhóm A từ nhánh `codex/ui-polish-v0`),
  bảng vi phạm đủ cột (biển, loại, hướng, giờ, trạng thái tiếng Việt, nút duyệt/gỡ/needs_review kèm ảnh bằng chứng),
  KPI ghi rõ nguồn Trực tiếp / Dữ liệu mẫu.
- **Người dân:** kết quả tra cứu dạng hồ sơ — ảnh bằng chứng, dòng thời gian trạng thái,
  mức phạt kèm căn cứ (`penalty.source`), khiếu nại một bước có theo dõi.
- Không break hợp đồng `/api/demo/**` — chỉ mở rộng ngược tương thích.

### P3 — Landing kể chuyện theo mockup

- Cấu trúc đúng `docs/mockups/mockup-demo-flow.html`: eyebrow pill + headline 2 màu +
  5 mục đánh số + ảnh lớn + caption nối câu.
- Ảnh minh họa **chụp từ chính build mới** (Playwright screenshot), không dùng ảnh bản khác.
- Nội dung 5 mục theo mockup, chữ trung thực theo mục 2.

## 4. Nghiệm thu và vận hành

- Mỗi lát: `node --test` (sim/luật), pytest backend (**venv Python 3.11** — Python 3.14 hệ thống làm hỏng pytest),
  vitest + build 2 entry web, browser QA bằng Playwright (mẫu: `work/smtf-agent/submit-live.cjs`).
  **Không** dùng computer-use `get_app_state` để soi UI (đã từng trả khung trống).
- Cổng tổng trên artifact: NAV / DATA / CAM / 3D / SIGNAL — SIGNAL phải có trace pha vàng.
- Perf không tệ hơn bản nộp: median FPS ≥ 100 (đo được 120), cảnh sẵn sàng ≤ 45 s.
- Deploy chỉ khi cổng xanh: `vercel build --prod` → `vercel deploy --prebuilt --prod`
  (project `saigon-smtf-submit`, env đã có trên Vercel; không in secret).
  Sau deploy chạy lại cổng trên URL production + chụp ảnh từng màn.
- Mỗi lát đỏ tối đa 2 lượt sửa; hết lượt → ghi blocker có chứng cứ + chuyển lát độc lập.
- Ghi bàn giao `work/smtf-agent/DEMO-V2-REPORT.md` (từng mục ĐẠT/ĐỎ + bằng chứng + SHA + URL) rồi commit.

## 5. Rào chắn — không đụng

- Worktree `F:\File\FileLapTrinhF\SaiGon_SMTF-wt\ui-polish-v0` (Antigravity còn tiến trình;
  chỉ dùng nhánh `codex/ui-polish-v0`, không mở worktree đó).
- Checkout chính `F:\File\FileLapTrinhF\SaiGon_SMTF` và các worktree cá nhân trong
  `C:\Users\Admin\orca\workspaces`.
- Hợp đồng `/api/demo` (chỉ mở rộng), dữ liệu cũ Supabase (chỉ schema demo riêng, migration idempotent).
- Lưu ý: tài liệu trên nhánh `main` (README/HANDOFF dòng chính) còn chậm so với nhánh tích hợp —
  khi gộp về main phải đồng bộ lại, không lấy số liệu từ đó làm mốc.

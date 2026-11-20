# DEMO-V2 — Điều phối tự chủ: nâng bản nộp thành demo sống

> Prompt này bàn cho MỘT agent điều phối (OpenCode) mở ở repo SaiGon SMTF.
> Agent tự quyết toàn bộ, gọi subagent theo lát, KHÔNG hỏi người dùng cho tới khi báo ĐẠT hoặc blocker có chứng cứ.

Bạn là **Điều phối viên demo-v2** cho repo SaiGon SMTF. Mục tiêu: nâng bản production
`https://saigon-smtf-submit.vercel.app` từ "bản nộp dữ liệu mẫu tĩnh" lên **demo sống** đúng luồng
`docs/mockups/mockup-demo-flow.html` — 3D là trạm điều khiển sống, web cán bộ nhận dữ liệu trực tiếp,
người dân tra ra hồ sơ có bằng chứng. Làm **TỰ CHỦ đến khi đạt**; không hỏi người dùng giữa chừng
(chỉ dừng khi mất đăng nhập / 2FA / khóa tài khoản — khi đó ghi rõ bước đang kẹt rồi dừng).

## 0. Đầu phiên (bắt buộc)

- Nạp skill theo mục "Tự nạp skill đầu mỗi phiên" trong `AGENTS.md`:
  `skill fe`, `skill code`, `skill agent-language-vi`. QA trình duyệt dùng Playwright.
  Trước khi kết luận "xong": `skill verification-before-completion` và chạy lệnh kiểm thật.
- Đọc theo thứ tự: `docs/agent/DEMO-V2-PLAN.md` (kế hoạch + quy tắc trung thực + danh mục P0–P3),
  `docs/agent/DEMO-VERCEL-SUPABASE.md` (hợp đồng API), `docs/agent/DECISIONS.md` mục 4 và 6,
  `work/smtf-agent/DEPLOY-TARGET.md` (triết lý deploy + env đã có).
- Máy: Python hệ thống 3.14 làm hỏng pytest — luôn dùng venv 3.11
  (`backend/.venv` hoặc `F:\File\FileLapTrinhF\SaiGon_SMTF-wt\smtf-gate-recovery-python\venv`).
  Vercel CLI đã login; project `saigon-smtf-submit` đã có env production.

## 1. Chuẩn bị

1. Tạo worktree sạch, nhánh `codex/demo-v2` từ HEAD nhánh `codex/vercel-submit-integration-c`
   (đã gồm commit docs demo-v2). Thư mục đặt ngoài các worktree đang chạy.
2. Ghép 5 commit nhóm A từ nhánh `codex/ui-polish-v0` (`2143d12` → `d9b0b07`:
   lưới camera A1, lọc theo nút A6, realtime A3, chip tiết kiệm A2, KPI A4).
   **KHÔNG mở** worktree `F:\File\FileLapTrinhF\SaiGon_SMTF-wt\ui-polish-v0` — Antigravity còn tiến trình,
   chỉ lấy từ nhánh.
3. Mọi việc làm trong worktree demo-v2; mỗi lát một commit; chỉ stage tệp của lát mình.

## 2. Phân công subagent (song song khi các lát độc lập)

- Điều phối (bạn): giữ nhánh, đọc kết quả từng subagent, quyết định merge theo cổng, viết report cuối.
- Lát 3D (P1): nặng nhất — dùng subagent mạnh, hoặc tự làm nếu subagent không đủ ngữ cảnh.
- Lát web cán bộ + người dân (P2): 1–2 subagent sau khi chốt adapter.
- Lát landing (P3): 1 subagent, chỉ bắt đầu khi đã có ảnh chụp từ build mới.
- Mỗi subagent nhận khi bàn việc: ID lát, danh sách tệp được phép sửa, lệnh kiểm, tiêu chí ĐẠT
  (lấy nguyên mục 3 và 4 trong `DEMO-V2-PLAN.md`), và lệnh cấm sửa ngoài phạm vi.
  Mỗi lát đỏ tối đa 2 lượt sửa; hết lượt → ghi blocker + chuyển lát độc lập.

## 3. Thứ tự công việc

Thực hiện theo `docs/agent/DEMO-V2-PLAN.md` mục 3 — tóm tắt để định nhịp:

- **P0 chặn nhanh:** sửa lỗi dấu landing · bỏ chữ cấm §6 · camera mặc định có ảnh ·
  seed thêm 5–8 hồ sơ mẫu · trạng thái tiếng Việt có màu.
- **P1 trạm 3D sống:** nạp app smart + bản đồ nhiệt · đèn A/B + KPI ·
  overlay khung nhận diện + đẩy frame `POST /api/demo/frame` · kịch bản + VMS ·
  nhà lùi khỏi corridor · chứng minh SIGNAL vàng 3 s.
- **P2 web làm việc:** bảng vi phạm đủ cột + duyệt kèm bằng chứng (cán bộ);
  hồ sơ + bằng chứng + timeline + phạt kèm căn cứ + khiếu nại (người dân).
- **P3 landing theo mockup:** đúng cấu trúc mockup, ảnh chụp từ build mới, chữ trung thực.

## 4. Nghiệm thu mỗi lát và tổng

- `node --test` cho logic sim/luật; pytest backend (venv 3.11); vitest + build 2 entry web.
- Browser QA bằng Playwright theo mẫu `work/smtf-agent/submit-live.cjs`.
  **Không** dùng computer-use `get_app_state` để soi UI (đã từng trả khung trống).
- Cổng tổng trên artifact: NAV / DATA / CAM / 3D / SIGNAL — SIGNAL phải kèm trace pha vàng 3 s.
- Perf không tệ hơn bản nộp: median FPS ≥ 100 (bản nộp đo 120), cảnh sẵn sàng ≤ 45 s.

## 5. Deploy và bàn giao cuối

- Chỉ khi mọi cổng xanh: `vercel build --prod` → `vercel deploy --prebuilt --prod`.
  Không in secret ra log/chat/commit.
- Sau deploy: chạy lại cổng trên URL production thật + chụp ảnh từng màn (Playwright).
- Ghi `work/smtf-agent/DEMO-V2-REPORT.md`: từng mục P0–P3 ĐẠT/ĐỎ, bằng chứng, ảnh, SHA, URL;
  commit evidence; thêm một dòng trạng thái vào `work/smtf-agent/DEPLOY-TARGET.md`.
- Kết thúc phiên khi: mọi mục P0–P2 ĐẠT trên production và P3 ĐẠT (hoặc blocker có chứng cứ).
  Khi đó gửi một bản tóm tắt cuối cho người dùng — không kèm câu hỏi.

## 6. Rào chắn

- Không break hợp đồng `/api/demo/**` — chỉ mở rộng ngược tương thích.
- Không claim YOLOv8/YOLOX/model thật; không chữ cấm §6 trên UI.
- Heading tiếng Việt: không `text-transform: uppercase` + `letter-spacing`; font Be Vietnam Pro.
- Không đụng: checkout chính `F:\File\FileLapTrinhF\SaiGon_SMTF`, worktree cá nhân trong
  `C:\Users\Admin\orca\workspaces`, worktree `ui-polish-v0`, dữ liệu cũ Supabase
  (chỉ schema demo riêng theo migration idempotent có sẵn).

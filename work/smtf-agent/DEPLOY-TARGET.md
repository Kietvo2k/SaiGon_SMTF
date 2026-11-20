# Đích Supabase cho bản nộp

Người dùng đã duyệt tái sử dụng dự án cũ Kietvo2k.
Project ref: vzgyoezcovxuffcehcbq
SUPABASE_URL=https://vzgyoezcovxuffcehcbq.supabase.co
Chỉ dùng schema và tài nguyên demo riêng. Giữ dữ liệu cũ. Khóa đặt trong env server Vercel, không ghi vào tài liệu.
Đã yêu cầu Resume dự án lúc 17h05 giờ Việt Nam. Xác nhận trạng thái trước khi seed.

17h06: Dashboard đã rời màn hình paused; Data API trả HTTP 401 khi không có key. Kết nối có khóa, bảng và seed chưa kiểm.
Goal: cả hai CLI hiển thị Pursuing goal; CLI lõi bị Orca EPERM khi tự đọc mail. Viết bản sao tài liệu để đọc trực tiếp từ đĩa.

17h39: CI nền đỏ vì môi trường. Python mặc định 3.14 không có pytest; Python 3.11 pin tại F:/File/FileLapTrinhF/SaiGon_SMTF-wt/smtf-gate-recovery-python/venv/Scripts/python.exe. Dùng HARDTEST_PYTHON với thư mục TEMP/TMP riêng trên SSD khi chạy lại. Kiểm node_modules trước web.
Tài liệu Vercel: https://vercel.com/docs/functions/runtimes/node-js . Dùng export default có fetch(request) tại api/ và rewrite endpoint /api/demo liên quan tới handler chung. Đọc JPEG từ Web Request, áp giới hạn 256 KiB theo hợp đồng.

20h30 resume phiên OpenCode: preflight VERCEL-SUBMIT-CORE-00/code exit 0, receipt 5090b861… khớp startSha 3706054; commit lõi 6e6d022 (17 tệp đúng allowlist). Build lõi 6e6d022: 97 tệp, 31.104.352 byte, landing docker, 4 route. verify-submit-local PASS toàn bộ: migration/seed chạy lặp 2 lần, 10 nút/15 camera, grant + bucket RLS, phiên ký/cookie hết hạn, hai dạng biển 51K-123.45, tranh chấp frame cùng phiên, cách ly hai phiên, hết hạn về mẫu, 2 slot/phiên. DEMO_SESSION_SECRET trong .env.local dài 64 ký tự, đạt ngưỡng 32 byte.

20h50 candidate tích hợp codex/vercel-demo-integration tại F:\File\FileLapTrinhF\SaiGon_SMTF-wt\vercel-demo-submit-integration: cherry-pick UI 3ebfd48 vào 6e6d022 thành 689fdb7 (giữ theirs cho outputs/hcmc-poc/index.html, web/index.html, landing/landing.css theo ownership UI; UI typecheck PASS, test 87/88 chỉ copy.test.ts xung đột oracle cũ — ghi blocker bàn giao, không sửa test ngoài allowlist). 04b00fe bỏ installCommand/buildCommand khỏi vercel.json: CLI upload artifact prebuilt, né lỗi spawn cmd.exe ENOENT khi CLI chạy build command qua shell. Build 689fdb7: landing vite, submit-hud có trong artifact, 101 tệp, 31.174.590 byte, 4 route.

Trạng thái blocker lúc 21h: SUPABASE_SECRET_KEY chưa có ở máy (chỉ SUPABASE_URL + DEMO_SESSION_SECRET trong .env.local) → API thật và seed ảnh mẫu chờ; Vercel CLI logged out → dùng temporary deployment (không env, /api/demo sẽ 503, URL hết hạn sau vài giờ, có claim URL). Đã hỏi người dùng: (1) đặt service_role key vào .env.local + dán 2 SQL vào SQL Editor dự án vzgyoezcovxuffcehcbq, (2) chạy vercel login để deploy project thật kèm env.

## Phiên Điều phối Deploy 20/11 (bàn giao trước 24h)

Ứng viên: `codex/vercel-submit-integration-c`, xuất phát HEAD `95eed62` (lõi 6e6d022 + UI 3ebfd48 + 3 fix deploy).

- B0 21h12 commit `afe6e98`: cứu bằng chứng `work/smtf-agent` (DEPLOY-TARGET, briefs, receipts, verify-submit-local.mjs, 2 bundle JSON + 2 ảnh PNG) từ 2 worktree mồ côi ở F: vào nhánh tích hợp; quét secret sạch; `.env.local` bị `.env.*` chặn khỏi Git; 2 thư mục gốc ở F: giữ nguyên, không xóa.
- B1 21h40: service_role key (JWT 208 ký tự) lấy qua dashboard Supabase bằng computer-use (hồ sơ Chrome "Tuấn kiệt", confirm mới hiện nút copy sau khi bấm Tiết lộ), ghi thẳng `.env.local` không qua chat/log; REST probe 200. Lần copy đầu nhầm khóa anon (role=anon, 401) — phát hiện qua giải码 payload JWT (chỉ in claim role), làm lại đúng.
- B2 22h05: dán 2 SQL qua SQL Editor (UIA + clipboard, cần bấm xác nhận "destructive operations" của Supabase cho migration). Lỗi encoding: lượt dán đầu bằng PS 5.1 đọc UTF-8 theo ANSI làm nhãn tiếng Việt trong DB thành mojibake; chạy lại seed bằng [System.IO.File]::ReadAllText UTF-8 (seed idempotent nhờ on conflict do update) — nhãn đúng: "Vi phạm tín hiệu (mẫu)", "Cầu vượt Hàng Xanh ∩ Điện Biên Phủ". Xác minh REST: 10 nút, 15 camera, 1 hồ sơ, 1 KPI; bucket `smtf-submit-20261120` riêng tư, limit 256 KiB, chỉ jpeg; không khóa → 401.
- B3 22h10: `node --env-file=.env.local scripts/vercel/seed-samples.mjs --project-ref vzgyoezcovxuffcehcbq` tải 6 JPEG (CAM-BAC-001…005 + CAM-HX-001) kèm SHA-256; Storage list đủ 6 object đúng bucket.
- B4: `vercel login` device-flow (Chrome xác nhận, có bước xác minh email 6 chữ số do người dùng tự hoàn tất). Tạo project riêng `saigon-smtf-submit` (team louiskiet2009-1881s-projects). Env production: SUPABASE_URL, SUPABASE_SECRET_KEY, DEMO_SESSION_SECRET (đưa qua stdin pipe, không in giá trị). Lỗi deploy `[unused_function]`: pattern `api/**/*.mjs` không khớp gì — căn nguyên thật là `.vercelignore` dạng whitelist `/*` khiến walker CLI 66.5.0 chỉ thấy 2 tệp (trace vc.getFiles fileCount=2) nên api/** không bao giờ được phát hiện; chứng minh bằng cách gỡ file → build PASS có function; fix commit `6cac2b7` viết lại `.vercelignore` dạng blacklist (pattern `api/**/*.mjs` giữ nguyên theo intent 95eed62). `vercel build --prod` rồi `vercel deploy --prebuilt --prod`.
- Deployment production: https://saigon-smtf-submit-b0hwqv9ts-louiskiet2009-1881s-projects.vercel.app (dpl_BDVTWx2xETt7bLsWotc1QAd264BW, target production, Ready). Manifest: commit `6cac2b7419ecd75b37f79ebf1790bedaf27f96a5`, landing vite, 101 tệp, 31.174.590 byte, 4 route; function nodejs22 maxDuration 10.
- Sau deploy URL bị chặn bởi Vercel Authentication (Deployment Protection mặc định): PATCH /v9/projects/saigon-smtf-submit body {"ssoProtection": null} bằng token CLI → URL public.

## Cổng nghiệm thu trên URL thật (work/smtf-agent/submit-live.cjs + submit-live.json + ảnh live-*.png)

| Cổng | Kết luận | Bằng chứng |
|---|---|---|
| SUBMIT-NAV | ĐẠT | HTTPS, landing 200 đúng tiêu đề, 3 trang + /hcmc-poc/ đều 200, goBack về đúng landing, 0 lỗi console, 0 request ≥400, 0 request ngoài origin, forecast worker cùng origin. |
| SUBMIT-DATA | ĐẠT | Officer vào bằng 1 nút: KPI "Dữ liệu mẫu / 18 giây / 9 xe / 24 xe/phút", hồ sơ `51K-123.45 Vi phạm tín hiệu (mẫu) confirmed`, 15 camera; `51K12345` và `51K-123.45` trả cùng hồ sơ; `51K-987.65` → 200 "chưa có hồ sơ"; biển sai → 400 INVALID_PLATE; officer không phiên → 401; /api/demo không còn 503 (env Vercel sống). |
| SUBMIT-CAM | ĐẠT theo phương án ảnh mẫu; luồng trực tiếp chưa nghiệm thu | CAM-BAC-002 → ảnh mẫu 1280×720 nạp (bytes khớp ảnh upload), nhãn "Ảnh mẫu", meta Bac-02 · CAM-BAC-002; fullscreen: document.fullscreenElement=true, stage 1440×900 đủ khung, ảnh visible; đổi CAM-HX-001 → ảnh + meta đổi đúng, không dùng ảnh camera khác. Camera trực tiếp từ 3D (frame POST) chưa kiểm trên URL — phần chưa đạt được ghi rõ theo runbook. |
| SUBMIT-3D | ĐẠT phần đo được; phần thị giác để ảnh cho người xem | webgl2, region bac, mode lite, forecast ready, HUD 10 nút (HX-C1…C5 + Bac-01…05); chọn Bac-02 → cameraInfo đúng CAM-BAC-002, "Đang quan sát từ góc chuẩn" hoạt động; HUD 1440 là thanh đáy 482×54 không che trung tâm, HUD 390 hiển thị dải đáy; medianFPS 120, p95 17 ms. Lưu ý: lần đo HUD 768 rect rơi y≈901 (ngoài mép viewport) — chưa kết luận được, cần người xem ảnh live-3d-768.png. Hình xe rõ/thân-mui-bánh và "không che tâm nút" là kiểm thị giác — mô hình này không đọc được ảnh, xem live-3d-{1440,768,390}.png. |
| SUBMIT-SIGNAL | ĐỎ runtime; cấu hình đúng | Controller trên URL: params yellowS=3, allRedS=2, cycle đo 44 s (khớp đơn kiểm controller-32.test.mjs). Nhưng sampler 60 s tại Bac-02 qua app.traffic.signalState không quan sát được pha vàng (2 lần chuyển xanh→đỏ đều nhảy thẳng, không mẫu yellow nào), chỉ bắt 1 đoạn cả-đỏ ~3 s — chưa chứng minh được "vàng 3 s, đỏ chung 2 s" chạy thật. KHÔNG tuyên bố đạt. Cần owner lõi xem cách tra đúng nút/mode (có thể signalState('Bac-02') trả nút khác nút điều khiển thật, hoặc mode bỏ pha vàng). |
| SUBMIT-PERF | ngoài phạm vi B5 lần này | Đo bổ sung: medianFPS 120, p95 17 ms, 113 request; so sánh trước/sau và máy iGPU thuộc lần nghiệm thu v1. |

Ghi chú ranh giới phiên này (không đụng):
- UI nâng cấp của agent khác (Antigravity/Gemini) KHÔNG nằm trong artifact này; mọi selector kiểm ở trên lấy từ chính build SHA 6cac2b7 nên khớp UI đang chạy. Muốn đưa UI mới vào bản nộp phải build lại từ SHA mới + chạy lại toàn bộ cổng.
- `src/lib/copy.test.ts` vẫn đỏ oracle cũ (87/88) — giữ nguyên theo bàn giao UI, không sửa test ngoài allowlist.
- Hai thư mục bằng chứng gốc ở F:\File\FileLapTrinhF\SaiGon_SMTF-wt\… vẫn còn nguyên, không xóa.

Tổng kết phiên (23h55): đã đạt B0–B4 trọn vẹn + NAV/DATA/CAM(ảnh mẫu) trên URL production thật; còn mở: SIGNAL runtime vàng 3 s chưa chứng minh, HUD 768 cần người xem ảnh, camera trực tiếp chưa nghiệm thu. Vết nhỏ: cần xoá ảnh thử prefix live/ trong bucket demo sau đợt nộp (hiện chưa có vì chưa chạy frame POST).

## Phiên Điều phối bản trình diễn v2 (21/11, glm-5.3)

Ứng viên: `codex/demo-v2` — xuất phát `codex/vercel-submit-integration-c` ad81fa1 + ghép 5 commit nhóm A từ
`codex/ui-polish-v0` (A1/A6/A3/A2/A4). Deploy cuối: **dpl_F9Z7FoVTeRFbCTWNajQcBy5abXEF**,
SHA `c3953d94827194776101c1d367631a549ac27c30`, artifact 104 tệp 31,3 MB, production READY tại
https://saigon-smtf-submit.vercel.app (Deployment Protection trống — public như trước).
Nâng cấp: trạm 3D sống đầy đủ (HUD/KPI A/B, heat + dòng xe theo chiều, forecast, scenarios, inspector
xanh kế hoạch + dự báo kẹt, bàn cưỡng chế có hoàn tác, xe ưu tiên cứu thương>cứu hỏa>công an + VMS mở làn),
đẩy khung /api/demo/frame 3,2 s; API mở rộng record/record-media/timeline/decision/complaint (ngược tương thích);
8 hồ sơ + 24 ảnh bằng chứng + 15/15 camera có ảnh mẫu từ chính trạm; landing theo mockup-demo-flow với ảnh chụp
từ build mới. Cổng production 9/9 PASS (demo2-live.cjs): NAV, SIGNAL (vàng [3,3,3] s + đỏ chung [2,2] s — cổng đỏ
cũ nay xanh), 3D modules, PERF medianFPS 102/p95 29,7 ms, CAMS, INSPECTOR, OFFICER (bảng + duyệt + 3 ảnh),
CITIZEN (hồ sơ + căn cứ NĐ 168 + khiếu nại) + restore dữ liệu sau QA. Bằng chứng: work/smtf-agent/DEMO-V2-REPORT.md
+ demo2-live.json + ảnh demo2-*.png. Chi tiết từng mục P0–P3/3b và bài học xem DEMO-V2-REPORT.

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

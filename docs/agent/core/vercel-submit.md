# Bàn giao Lõi cho bản nộp Vercel

Phạm vi `VERCEL-SUBMIT-CORE-00`, vòng 0/2. Mốc nền `b9bdd82`, mốc tài liệu chung `2722abb`, preflight bắt đầu tại `3706054`. Ledger NORTH cũ đóng ở vòng 2/2. Dùng vùng Bắc từ mốc đã kiểm làm ứng viên dự phòng cho ô vuông 3,22 km.

## Dựng và kiểm ứng viên

Chạy `npm ci --prefix outputs/smart-traffic/web --no-audit --no-fund`, sau đó `node scripts/vercel/build.mjs` ở gốc repo. Giữ `artifact-manifest.json` cùng báo cáo trên đúng SHA đã dựng. Khi ghép UI, landing và hai trang React cần dùng bản nộp, với API cùng origin. Trước khi ghép UI, gói Lõi dùng landing từ Docker và hai trang React nền. Kiểm độc lập ở `/hcmc-poc/` để đánh giá ứng viên Bắc.

Trên URL HTTPS, kiểm các đường dẫn `/`, `/hcmc-poc/`, `/index-officer.html`, `/index-citizen.html`. Mở DevTools để xác nhận forecast worker và asset được tải cùng origin, hai trang React gọi `/api/demo`, rồi thử hai hồ sơ trình duyệt riêng. Trạm 3D cục bộ trước đây tự capture nhiều camera. Bản dự phòng hiện dùng ảnh mẫu từ bucket demo. Luồng trực tiếp còn cần tín hiệu chỉ rõ camera đang được xem và phép kiểm hai hồ sơ trên URL thật.

## Cấu hình Supabase

Dùng dự án demo đã xác nhận trong `work/smtf-agent/DEPLOY-TARGET.md`. Chạy nguyên tệp `supabase/migrations/20261120000000_smtf_submit.sql` rồi `supabase/seed.sql` trong SQL Editor của đích đó. Migration và seed dùng giao dịch và chạy lặp được. Chúng chỉ cấp tài nguyên có tên `smtf_submit_*` và bucket riêng `smtf-submit-20261120`. Policy bucket hạn chế cả quyền có thể phát sinh từ policy rộng sẵn có.

Đặt `SUPABASE_URL`, `SUPABASE_SECRET_KEY` và `DEMO_SESSION_SECRET` trong Vercel Functions. Secret ký phiên cần ít nhất 32 byte và ổn định giữa các instance. Bản cục bộ có thể dùng `.env.local` ngoài Git. Tải ảnh mẫu bằng `node --env-file=.env.local scripts/vercel/seed-samples.mjs --project-ref <ref>`. Lệnh kiểm khớp URL của đích trước khi tải và in SHA-256 của ảnh. Sáu JPEG là khung từ mô phỏng Bắc tại `b9bdd82`, gồm năm camera `CAM-BAC-001…005` và `CAM-HX-001`. Camera chưa có ảnh mẫu hiện trạng thái thiếu nguồn. Ảnh Bắc 02/03 giữ nguyên góc mô phỏng và chưa chứng minh vạch dừng đạt yêu cầu.

POST `/api/demo/session` cấp hoặc tái dùng cookie ký hạn 8 giờ. GET `officer`, `camera` và `media` dùng cookie đó. GET `lookup` công khai. POST `frame` kiểm JPEG tối đa 256 KiB, camera và phiên. PostgreSQL giữ nhịp tối thiểu ba giây bằng claim nguyên tử, nhận thời gian ở server và luân phiên hai đối tượng mỗi phiên. Sau mười giây, API trả về mẫu hoặc thiếu nguồn. API media kiểm SHA-256 khi đọc slot để tránh trả nhầm byte nếu slot đã dùng lại. Dọn ảnh thử sau đợt nộp bằng Storage API đối với prefix `live/` của bucket demo, rồi dọn metadata phiên tương ứng. Khi cần lùi bản, phục hồi deployment Vercel đã kiểm. Việc gỡ tài nguyên chỉ áp dụng cho các đối tượng demo sau khi đã kiểm kê chúng.

## Mốc bằng chứng

- Kiểm cục bộ bằng `node work/smtf-agent/verify-submit-local.mjs` chạy trên PostgreSQL 18 qua PGlite và lớp HTTP Supabase mô phỏng. Chạy migration và seed hai lần, kiểm 10 nút, 15 camera, quyền bảng và bucket, cookie giả/hết hạn, hai dạng biển mẫu, biển sai, biển rỗng và lỗi dữ liệu. Kiểm tranh chấp gửi cùng phiên trả 200/429, đọc khác phiên trả 404, hết hạn quay về mẫu và lưu tối đa hai slot trên phiên. Phép kiểm này không bao gồm phản hồi gateway và Storage từ đích Supabase.
- Baseline Chromium `b9bdd82` đã lên WebGL2, 10 thẻ và forecast worker. Các lỗi góc Bắc 02/03 bị che và HUD ở viewport nhỏ thuộc lần nghiệm thu NORTH trước. Bằng chứng này cần được chạy lại trên artifact tích hợp để kết luận `SUBMIT-3D` hoặc `SUBMIT-PERF`.
- Kiểm từ xa phụ thuộc khóa server, quyền chạy SQL trên đúng dự án và đích Vercel đã liên kết. Probe Supabase không khóa cho HTTP 401. Kết luận đủ ba demo cần trình duyệt sạch, Supabase thật và bản ghép UI.

[Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js) · [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) · [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)

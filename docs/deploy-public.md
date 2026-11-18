# Runbook Vercel và Cloudflare Pages

Runbook này mô tả bản **public-demo-v1** đang được triển khai theo [đặc tả](agent/PUBLIC-DEMO-SPEC.md). Chạy offline hoặc tác nghiệp API/SQLite theo [runbook cục bộ](runbook.md). Trạng thái có thể phát hành lấy từ hardtest trên đúng commit và từ kiểm thử preview.

## Kiến trúc triển khai

| Nơi phục vụ | Nội dung | Địa chỉ |
|---|---|---|
| Vercel | `/`, `/hcmc-poc/`, `/index-officer.html`, `/index-citizen.html`, JS/CSS, worker và cấu hình khả dụng ở browser. | `https://<project>.vercel.app` |
| Cloudflare Pages Free | Cảnh khu Bắc, tải texture/model, dữ liệu dẫn xuất và giấy phép đã duyệt. | Origin ghim theo commit `https://release-<12-ký-tự-SHA>.<project>.pages.dev` |
| Trình duyệt khách | Mô phỏng, ONNX inference, phiên nghiệp vụ với IndexedDB. | Tất cả trang ứng dụng dùng cùng origin Vercel |

Mọi hồ sơ, ảnh, đội ngũ và tài khoản trong bản tĩnh là mẫu. Giữ thông tin triển khai của hai nền tảng trong cơ chế đăng nhập chính thức của CLI/CI. Artifact public dùng đường dẫn whitelist, kiểm tên tệp, kích cỡ và hash. Ảnh bằng chứng từ phiên khách chỉ nằm trong hồ sơ trình duyệt của khách. Pages phục vụ tài nguyên tĩnh công khai với `Access-Control-Allow-Origin: *`. React và worker tham chiếu manifest được ghim, dùng thông tin origin tuyệt đối theo artifact đã build.

Vercel có hạn mức tổng source CLI upload theo gói, đặt trần nội bộ dưới 90 MiB cho gói Vercel. Pages Free giới hạn mỗi file 25 MiB và 20.000 file. Xử lý dữ liệu khu Bắc thành phần nhỏ trước khi publish, ghi bản đồ ID và thông tin nguồn đi kèm. [Vercel Limits](https://vercel.com/docs/limits) · [Vercel CLI](https://vercel.com/docs/cli/deploy) · [Pages Limits](https://developers.cloudflare.com/pages/platform/limits/) · [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/)

## Quy trình preview và phát hành

Các lệnh `scripts/package-public-demo.mjs` bên dưới là giao diện bàn giao cho nhánh lõi. Kiểm phần hiện trạng trong [handoff](agent/HANDOFF.md) trước khi chạy. Chạy với checkout sạch của SHA cần phát hành, Node 22.12+ và Python 3.11 cho các check hồi quy. Dùng project và tên miền do người quản lý chọn cho bản demo.

1. Chạy `node scripts/hardtest/run.mjs --profile ci`. Mọi ca bắt buộc phải có log đúng SHA và kết quả `PASS`.
2. Chạy `node scripts/package-public-demo.mjs --target pages`. Kết quả theo giao diện bàn giao ở `dist/public-demo/pages/`. Kiểm file count, từng file, giấy phép, graph ID, các tài nguyên theo whitelist và dữ liệu mẫu. Tạo preview tài nguyên với `npx wrangler pages deploy dist/public-demo/pages --project-name <pages-project> --branch release-<sha12> --commit-hash <sha-đầy-đủ>`, trong đó `<sha12>` là 12 ký tự đầu của commit. Ghi lại URL phiên bản. Khi kiểm và chạy public, dùng alias `https://release-<sha12>.<pages-project>.pages.dev`. Giữ alias gắn với cùng artifact đã kiểm. [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) · [Pages previews](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
3. Chạy `node scripts/package-public-demo.mjs --target vercel --assets-origin <pages-deployment-origin>`. Kết quả ở `dist/public-demo/vercel/`, manifest phát hành ở `dist/public-demo/release-manifest.json`. Tạo preview Vercel từ riêng thư mục `dist/public-demo/vercel` bằng `vercel deploy`. Project phải dùng output tĩnh và giữ các đường dẫn gốc trong đặc tả. Vercel Preview dùng cho người kiểm tra và có thể cần cấu hình quyền truy cập riêng. [Vercel deploy](https://vercel.com/docs/cli/deploy)
4. Agent browser-qa dùng preview đúng SHA, ghi browser trace, screenshot, kích cỡ tải, nguồn URL, kết quả dòng user flow và số đo máy thật. Tạo evidence JSON và chạy hardtest release như mục dưới. Kiểm tab network từ profile sạch để xác nhận GET tài nguyên tới đúng gói Pages đã ghim và thao tác nghiệp vụ còn hoạt động sau reload. [Kịch bản QA](qa-public-demo.md)
5. Chạy cổng phát hành dưới đây trên `codex/public-demo-release`. Ghi SHA, hash manifest, URL Vercel và nguồn Pages phiên bản vào bàn giao. Thử landing và ba lối vào từ hồ sơ browser sạch. Khi rollback, quay về deploy Vercel trước và giữ origin asset đã ghim của bản đó. Xác nhận dữ liệu mẫu còn dùng được sau đổi phiên bản hoặc hiển thị thông báo xác nhận tạo lại khi schema không tương thích.

## Chạy cổng kiểm phát hành

`HARDTEST_RELEASE_MANIFEST` trỏ tới manifest JSON do bản build sinh ra, đặt cùng cấp `pages/` và `vercel/`. Manifest có `schemaVersion: 1`, `commit`, `contractDigest` là SHA-256 của byte trong `docs/agent/CONTRACT-PUBLIC-DEMO.md`, `pagesOrigin`, và `artifacts.pages` / `artifacts.vercel` mỗi gói có `totalBytes` cùng `files: [{path, bytes, sha256}, ...]`. `HARDTEST_RELEASE_EVIDENCE` trỏ tới hồ sơ QA kèm artifact thật. Cổng kiểm ghi hash của cả hai tệp trong `report.json`.

```powershell
$env:HARDTEST_RELEASE_MANIFEST = (Resolve-Path 'dist/public-demo/release-manifest.json').Path
$env:HARDTEST_RELEASE_EVIDENCE = (Resolve-Path 'work/smtf-agent/release/evidence.json').Path
node scripts/hardtest/run.mjs --profile release
```

Sinh evidence từ cùng ứng viên. Danh sách ba ID `CAM-01`, `USER-01`, `PERF-01` có mỗi ID đúng một lần. Mỗi mục `artifacts` có ít nhất một `{path, sha256}`, đường dẫn tương đối bên dưới thư mục evidence và tệp thật có nội dung. Kiểm bằng `Get-FileHash -Algorithm SHA256` hoặc `sha256sum`, ghi hash chữ thường. Giữ đường dẫn và hash trong báo cáo bàn giao. [Nội dung evidence và kiểm thử](qa-public-demo.md)

## Cổng tải gói lên nền tảng

`scripts/deploy/publish.mjs` là cổng kiểm và tải gói, còn builder ở các bước trên thuộc đợt triển khai sản phẩm. Kiểm gói vừa tạo tại SHA ứng viên trước khi tải lên:

```powershell
node scripts/deploy/publish.mjs --manifest <manifest.json> --report <report.json> --verify-only
```

Khi phát hành thật, dùng worktree của `codex/public-demo-release` sạch. Đặt `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID` từ cấu hình project, chọn CLI đã cài tương ứng và đã xác thực. Cổng so SHA, hash hợp đồng, hash manifest, danh sách check và hash mỗi artifact trước khi tải Pages rồi Vercel production:

```powershell
node scripts/deploy/publish.mjs --manifest <manifest.json> --report <report.json> --pages-project <pages-project> --wrangler-cli <entry-js> --vercel-cli <entry-js>
```

## Chẩn đoán

- **Trang trắng, request 404 hoặc `.wasm` lỗi:** so URL origin ghim với manifest, kiểm MIME/CORS và hash của gói phát hành. Kiểm route HTML và đường dẫn worker trước khi đổi cấu hình CDN. `GATE-RELEASE-INPUTS` bị chặn khi manifest hoặc evidence thiếu/sai SHA.
- **Có web, không có camera:** kiểm trạm đang mở với cùng origin/hồ sơ, lease trạm, `captured_at`, camera đang chọn và trạng thái storage. Tài khoản mẫu vẫn truy cập được hồ sơ mà không có render 3D.
- **Đèn không đổi sau khi bấm:** đọc trạng thái lệnh và `command.updated`. Nếu `expired`, kiểm heartbeat và console của tab trạm, rồi gửi lại lệnh mới khi trạm hoạt động.
- **Người dùng mở bản cũ:** kiểm `build_id`, deployment Vercel và origin tài nguyên. Yêu cầu tải lại để dùng bundle mới. Báo cáo rollback cần đúng SHA và giữ trọn gói asset của bản trước.

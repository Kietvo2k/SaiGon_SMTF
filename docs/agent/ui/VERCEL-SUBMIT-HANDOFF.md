# Bàn giao UI bản nộp Vercel

Brief `VERCEL-SUBMIT-UI/code`, vòng 0/2, nền `619eed5`, nhận việc tại `f4e4bd7`.
Kết quả riêng của đợt `vercel-demo-2026-11-20` nằm trong
`work/smtf-agent/results/VERCEL-SUBMIT-UI.code.json`. Các ca đỏ và ngân sách sửa
của hai lát public-demo-v1 trước đó được giữ nguyên.

## Tích hợp UI với lõi

- Build React với `VITE_SMTF_SUBMIT=1` và đưa landing vào input Vite. Hai đường dẫn
  `/index-officer.html` và `/index-citizen.html` dùng cùng origin và gọi
  `/api/demo/*`. Các trang cục bộ giữ view cũ khi không có cờ build hoặc
  `?demo=vercel`.
- `/hcmc-poc/` mở khu Bắc toàn cảnh khi nhận `demo=vercel`. Trong entry chạy cảnh
  public, nạp `submit-hud.css` và gọi `mountSubmitHud` từ `submit-hud.js` sau khi
  runtime sẵn sàng. Truyền `junctions` là các hàng `junctionRows32` của đúng graph,
  `cameras` dạng `{cameraId, junctionId, label}` từ danh mục lõi, `showOverview`
  gọi `selectView('bac')`, `focusJunction(row)` dùng `focusJunction32(row)` và
  `showStandard(row)` đưa cảnh về góc chuẩn của nút đã chọn hoặc Hàng Xanh nếu chưa
  chọn. Giữ khóa `row.id` theo cụm logic. Bắc 02 là `CAM-BAC-002` → `Bac-02`,
  Bắc 03 là `CAM-BAC-003` → `Bac-03`.
- CSS HUD ẩn giao diện Story, Controls và Flood Lab cũ khi mount. Lõi bỏ module
  `flood-ui-25.js` và phụ thuộc riêng của nó khỏi gói public khi không còn caller.
  Runtime cục bộ vẫn cần tài nguyên cũ.
- Camera dashboard bỏ phản hồi cũ theo phiên yêu cầu và đối chiếu cả hai ID. UI
  cập nhật metadata mỗi 3 giây, đọc ảnh qua route media và hiển thị giờ chụp theo
  giờ Việt Nam. Hai phía cần thống nhất tín hiệu camera đang xem để capture thật.
  Khi chỉ nghiệm thu phương án ảnh mẫu, ảnh và metadata vẫn phải lấy từ Supabase.

## Bằng chứng và giới hạn

- Chạy `npm run typecheck`, `npm test` và `npm run build` tại
  `outputs/smart-traffic/web`. Bộ lọc cũ `src/lib/copy.test.ts` đang đỏ với các
  chữ “demo”, “mô phỏng” và các đường dẫn mà đặc tả bản nộp yêu cầu. Chuyển ca này
  cho điều phối viên và tác giả kiểm thử. Diff `landing.test.ts` có từ trước và
  nằm ngoài allowlist của brief.
- Chromium fixture trong `work/smtf-agent/qa/submit-ui/` ghi ảnh, trace và
  `observations.json`. Ca fixture xác minh view và request browser. Landing,
  cảnh 3D và hai trang React trên cùng artifact HTTPS cần kiểm lại sau khi ghép.
- Ảnh landing `submit-city.webp` là ảnh cảnh 3D có sẵn trong diff phiên trước.
  Vùng 3D, khung trực tiếp, cô lập giữa hai phiên, Supabase thật, manifest và URL
  cần bằng chứng trên ứng viên lõi đã ghép.

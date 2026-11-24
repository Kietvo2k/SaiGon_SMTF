# FIX-LABELS: ĐẠT
Commit: 81b4ab6 — FIX-LABELS: nhãn tiếng Việt cho mọi mã lỗi trên web
File đã đổi: outputs/smart-traffic/web/src/lib/labels.ts, outputs/smart-traffic/web/src/lib/labels.test.ts

## Số đo
| Chỉ số | Trước | Sau | Ngưỡng | Đạt? |
|---|---|---|---|---|
| Mã backend có nhãn tiếng Việt trong web | 1/12 | 12/12 | 12/12 | Đạt |
| Số chỗ UI hiện mã thô (mã backend) | 11 | 0 | 0 | Đạt |
| Test vitest | 43 pass | 46 pass | không hồi quy | Đạt |
| npm run build | pass | pass | pass | Đạt |

## Kiểm
- `npm run test` (web): 46/46 pass (7 file); `npm run build` (web): pass, 59 module; quét mojibake (RULES mục 10) trên 2 file đã sửa: 0 kết quả.

## Lệch khỏi prompt
- Test vitest đọc thẳng `backend/app/schemas.py` để so chữ thay vì chỉ chép danh sách mã — chống lệch hai bộ nhãn về sau, vẫn đúng bước 1.
- Nhãn dự phòng mã lạ: web vẫn trả mã thô (`?? code`), backend trả `'Vi phạm giao thông khác'`. Giữ nguyên vì ngoài phạm vi "mọi mã backend có" và test cũ đang khẳng định hành vi này. Không dùng cổng 8851/8950: task chỉ chạy test/build, không cần server.
- Backend có `STOP-LINE`, `NO-PRIORITY` mà 3D `CODE_LABEL_32` không có → theo backend. 10 mã chung khớp chữ 100 %, không lệch chữ nào.

## Ngưỡng đề xuất cho bước sau (chỉ prompt đo)
- Không áp dụng (prompt không đo).

## Việc còn dở / phát hiện ngoài phạm vi
- Nhãn dự phòng web/backend còn khác nhau; đồng bộ là đổi hành vi mã lạ nên để task riêng. 5 chỗ render vi phạm đều đi qua `violationLabel`, không còn chỗ in `violation_code` thẳng.

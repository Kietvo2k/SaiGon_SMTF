# Review bổ sung qua OpenCode Go — 22/10/2026

Theo yêu cầu tiết kiệm quota của người dùng, đã gọi CLI có sẵn bằng model `opencode-go/minimax-m3.1-flash-free`. Dịch vụ nền gặp lỗi `Location plugins did not finish activating`; chế độ `--standalone` chạy được. Không cài OpenCode hoặc đổi model sang gói trả phí.

Review đầy đủ đọc code đang thay đổi nên phải đọc lại nhiều lần; đã dừng lượt đó sau khi lấy các probe có ích, rồi dùng một lượt tóm tắt ngắn không dùng công cụ. Chỉ lấy nhận xét có bằng chứng và kiểm lại bằng test của repo. Các bước hoàn tất của CLI ghi `cost: 0`; đây là số CLI báo, không phải kiểm chứng độc lập hóa đơn.

## Hai phát hiện đã kiểm lại và sửa

1. **Nhả ưu tiên reset tuổi pha xanh.** Probe ở giây 40 cho thấy hướng kia trong fixed chờ tới giây 61 thay vì 48; smart tới 90 thay vì 85. Đã sửa `resumeNormal` giữ tuổi pha; nếu đã quá giới hạn thì chuyển qua vàng/đỏ chung. Test hồi quy đã thấy RED rồi GREEN, không rút ngắn khoảng an toàn.
2. **Giảm mật độ làm mất slot khẩn cấp ngoài vùng signature.** Probe tại 5%/2% làm slot đang chạy bị tắt. Đã giữ slot ưu tiên cùng tập được bảo vệ khi giảm mật độ; khi dừng trả về quy tắc bình thường. Test có RED/GREEN và kiểm việc trả lại slot.

MiniMax còn đối chiếu `isGreen` với `stateOf` trong fixed/smart sau khi nhả, probe không tìm thấy bất khớp. Không dùng kết quả này để tuyên bố đạt mọi seed, FPS hoặc soak. Bản tóm tắt của model có một câu nhầm “trên cầu signature”; báo cáo này giữ kết quả đúng của probe là slot **ngoài** signature.

Log cục bộ (không đóng vào Docker): `work/browser-qa-2026-10-22/opencode-review.jsonl`, `opencode-summary.jsonl`. OpenCode tạo một số script probe trong thư mục Temp riêng; không sửa mã ứng dụng thay agent điều phối. Các sửa lỗi cuối được kiểm bằng test/Browser của phiên này, xem [báo cáo triển khai](IMPLEMENTATION-2026-10-22-smart-traffic-package.md).

# AUTO-RUN: một prompt cho agent điều phối (VietCode, model qwen-3.8-max)

Dán nguyên khối dưới đây vào **một** phiên VietCode mở tại thư mục gốc repo.

```text
VAI TRÒ: Bạn là ĐIỀU PHỐI VIÊN. Bạn KHÔNG tự viết mã. Bạn giao việc cho sub agent, kiểm kết quả, commit/push, rồi giao việc tiếp. Mục tiêu: xong nhiều việc quan trọng nhất có thể trong 13 giờ.

=== BƯỚC 0 (5 phút) ===
1. Đọc: docs/agent/RULES.md, docs/prompts/README.md. CHỈ đọc lướt docs/agent/HANDOFF.md. KHÔNG đọc mã nguồn (để tiết kiệm token, sub agent sẽ đọc).
2. Chạy `git status` và `git log --oneline -3`, kiểm đang ở nhánh Kietvo2k/smart-traffic-bac. Sai nhánh thì DỪNG và hỏi người dùng.
3. Ghi giờ bắt đầu vào work/AUTO-RUN.log. Sau mỗi task, ghi thêm một dòng: giờ | task | ĐẠT/KHÔNG ĐẠT/DỪNG SỚM | commit.

=== DANH SÁCH VIỆC (ưu tiên từ trên xuống, chia 3 LUỒNG chạy song song) ===
Mỗi task là một khối ```text trong file docs/prompts/<FILE>.md, có tiêu đề "TÊN TASK: <TÊN>".

LUỒNG A — sim và 3D (cổng tĩnh 8831, backend 8930), chạy tuần tự:
  DEMAND-1 → DEMAND-2* → DEMAND-3 → PRIORITY-1* → PRIORITY-2* → PRIORITY-3 → PRIORITY-4 → PRIORITY-5 → (nếu còn giờ) A1-1 → A1-2* → A1-3
LUỒNG B — hiệu năng trình duyệt (cổng 8841, backend 8940), chạy tuần tự:
  PERF-1 → PERF-2* → PERF-3 → FIX-WRONGWAY → FIX-TURN → FIX-SPEED → FIX-BRIDGE
LUỒNG C — backend và web (cổng 8851, backend 8950), chạy tuần tự:
  FIX-LABELS → PERF-4 → PERF-5 → FIX-STATION-LOGIN → FIX-PLATES → FIX-SPEC46 → (đợi PRIORITY-5 của luồng A xong) PRIORITY-6 → CLEAN-2
(*) = cần model mạnh. Nếu công cụ cho chọn model cho sub agent: task có * dùng qwen-3.8-max, task còn lại dùng model rẻ nhất có sẵn (ox-alpha hoặc tương đương). Không chọn được thì dùng model hiện tại.

Ràng buộc chéo luồng:
- PERF-3 (B) và PRIORITY-5 (A) đều có thể đụng outputs/hcmc-poc/violation-perception-32.js hoặc station-client-32.js. Hai task này KHÔNG được chạy cùng lúc.
- PERF-2 (B) và PRIORITY-4 (A) đều đụng smart-app-32.js. KHÔNG chạy cùng lúc.
- Tối đa 3 sub agent cùng lúc (mỗi luồng một).

=== CÁCH GIAO MỘT TASK CHO SUB AGENT ===
Gửi cho sub agent đúng nội dung sau, thay <TÊN>, <FILE> và cổng của luồng:
"Bạn làm DUY NHẤT task <TÊN>. Mở docs/prompts/<FILE>.md, tìm khối text có 'TÊN TASK: <TÊN>' và làm đúng khối đó. Đọc docs/agent/RULES.md trước.
Không có bước duyệt của người dùng: chỗ nào ghi 'ngưỡng đã duyệt' thì dùng ngưỡng ĐỀ XUẤT trong báo cáo của bước trước; không có thì dùng ngưỡng mặc định ghi trong prompt.
Dùng cổng tĩnh <PORT_STATIC>, backend <PORT_API> thay cho cổng trong prompt.
Đo chạy dài: dùng --minutes 3 thay cho 10 hoặc 20.
Giới hạn 90 phút. Hết giờ thì dừng, ghi báo cáo 'DỪNG SỚM' với phần đã làm.
Chỉ git add đúng file mình sửa, không push.
Kết thúc bằng việc ghi work/<TÊN>.report.md theo mẫu RULES mục 13."

=== KIỂM SAU MỖI TASK (bạn tự làm, tối đa 10 phút) ===
1. Có file work/<TÊN>.report.md. Dòng đầu là ĐẠT, KHÔNG ĐẠT hoặc DỪNG SỚM.
2. `git show --stat HEAD`: chỉ có file mà prompt cho phép sửa. Có file lạ thì `git revert` commit đó, ghi KHÔNG ĐẠT vào log.
3. Với từng file .js/.py/.ts/.tsx/.md đã đổi, chạy `grep -c "Ã¡\|Ã©\|á»\|áº\|Ä‘\|Æ°" <file>`. Kết quả phải là 0; khác 0 thì revert commit đó.
4. Đúng 1 lần sau mỗi 3 task của một luồng (không phải mỗi task), chạy bộ test của luồng đó:
   A và B: node --test "outputs/hcmc-poc/test/*.test.mjs"
   C: outputs/smart-traffic/backend/.venv/Scripts/python.exe -m pytest outputs/smart-traffic/backend/tests -q -p no:cacheprovider, rồi trong outputs/smart-traffic/web chạy npm run test và npm run build.
   Fail thì giao một sub agent sửa ĐÚNG lỗi đó, giới hạn 30 phút. Vẫn fail thì revert task gây lỗi.
5. Ổn thì: git push origin Kietvo2k/smart-traffic-bac.

=== QUY TẮC KHÔNG SA LẦY ===
- Task KHÔNG ĐẠT hoặc DỪNG SỚM: ghi log, sang task kế của luồng. KHÔNG giao làm lại. Ngoại lệ: DEMAND-2 và PRIORITY-1 là nền của cả luồng A — mỗi task được thử lại đúng 1 lần (sub agent mới, kèm báo cáo lần trước). Lần 2 vẫn hỏng thì bỏ cả phần còn lại của chuỗi đó.
- Task sau phụ thuộc task trước bị hỏng (ví dụ PRIORITY-2 cần PRIORITY-1) thì bỏ qua, ghi "BỎ QUA do <task>".
- Không tự thêm việc ngoài danh sách. Phát hiện lỗi khác thì ghi vào work/AUTO-RUN.log mục "Phát hiện".

=== TIẾT KIỆM TOKEN ===
- Bạn không đọc mã và không đọc log dài; chỉ đọc báo cáo (≤ 25 dòng) và `git show --stat`.
- Không dán lại toàn bộ prompt task vào tin nhắn giao việc; sub agent tự mở file.
- Báo hết hạn mức (quota, 429 kéo dài, hết credit): dừng giao việc mới, làm phần KẾT THÚC.

=== MỐC GIỜ ===
- Giờ thứ 11: không giao task mới có (*). Giờ thứ 12: không giao task mới nào.
- KẾT THÚC (muộn nhất giờ thứ 12,5):
  1. Đợi sub agent đang chạy xong hoặc tới giới hạn.
  2. Chạy đủ 3 bộ test một lần.
  3. Cập nhật docs/agent/HANDOFF.md: mục 1 thêm task đã ĐẠT; mục 3 ghi số đo mới và task chưa xong.
  4. Viết work/AUTO-RUN.summary.md ≤ 30 dòng: bảng task | kết quả | commit | số đo chính; việc còn lại; lỗi phát hiện.
  5. Commit "AUTO-RUN: cập nhật HANDOFF sau đợt chạy", push, rồi in summary ra.
```

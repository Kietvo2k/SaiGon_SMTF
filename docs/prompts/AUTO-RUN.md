# AUTO-RUN: một prompt cho opencode tự điều phối

- **Agent chính** (điều phối): `vietapi/kimi-k3`. Chọn model này khi mở opencode.
- **Sub agent** đã khai báo trong `opencode.json` ở gốc repo. Kiểm bằng lệnh `opencode debug agents`.

| Sub agent | Model | Dùng cho |
|---|---|---|
| `worker-strong` | `vietapi/kimi-k3` | Task có dấu * |
| `worker-cheap` | `opencode/deepseek-v4.1-flash-free` | Task còn lại |
| `worker-alt` | `opencode/glm-5.3-flash-free` | Dự phòng khi deepseek lỗi hoặc bị 429 |

Dán nguyên khối dưới đây vào opencode, mở tại thư mục gốc repo.

```text
VAI TRÒ: Bạn là ĐIỀU PHỐI VIÊN. Bạn KHÔNG tự viết mã. Bạn giao việc cho sub agent bằng công cụ task (subagent_type: worker-strong / worker-cheap / worker-alt), kiểm kết quả, push, rồi giao tiếp. Mục tiêu: xong nhiều việc quan trọng nhất có thể trong 13 giờ.

=== BƯỚC 0 (5 phút) ===
1. Đọc docs/agent/RULES.md và docs/prompts/README.md. Đọc lướt docs/agent/HANDOFF.md. KHÔNG đọc mã nguồn: sub agent sẽ đọc, bạn đọc là tốn token.
2. Chạy `git status`, `git log --oneline -3`. Phải đang ở nhánh Kietvo2k/smart-traffic-bac; sai nhánh thì DỪNG, hỏi người dùng.
3. Tạo work/AUTO-RUN.log, ghi giờ bắt đầu. Sau mỗi task, thêm 1 dòng: giờ | task | ĐẠT/KHÔNG ĐẠT/DỪNG SỚM/BỎ QUA | commit.

=== DANH SÁCH VIỆC: 3 LUỒNG, mỗi luồng chạy tuần tự ===
Mỗi task là một khối text trong docs/prompts/<FILE>.md, bắt đầu bằng "TÊN TASK: <TÊN>". FILE suy ra từ tên: DEMAND-x → DEMAND.md, PERF-x → PERF.md, PRIORITY-x → PRIORITY.md, A1-x → A1.md, FIX-x và CLEAN-2 → SMALL.md.
(*) = giao cho worker-strong. Không có * = giao cho worker-cheap.

LUỒNG A, sim và 3D (cổng tĩnh 8831, backend 8930):
  DEMAND-1 → DEMAND-2* → DEMAND-3 → PRIORITY-1* → PRIORITY-2* → PRIORITY-3 → PRIORITY-4 → PRIORITY-5 → (còn giờ) A1-1 → A1-2* → A1-3
LUỒNG B, hiệu năng trình duyệt (cổng 8841, backend 8940):
  PERF-1 → PERF-2* → PERF-3 → FIX-WRONGWAY → FIX-TURN → FIX-SPEED → FIX-BRIDGE
LUỒNG C, backend và web (cổng 8851, backend 8950):
  FIX-LABELS → PERF-4 → PERF-5 → FIX-STATION-LOGIN → FIX-PLATES → FIX-SPEC46 → PRIORITY-6 (chỉ sau khi PRIORITY-5 xong) → CLEAN-2

=== CÁCH CHẠY THEO VÒNG ===
Mỗi VÒNG: lấy task kế tiếp của mỗi luồng, gọi tối đa 3 lệnh task CÙNG MỘT LƯỢT để chạy song song, đợi tất cả xong, kiểm, rồi sang vòng sau.
Không đưa vào cùng một vòng các cặp task đụng chung file:
- PERF-3 và PRIORITY-5: cùng có thể đụng violation-perception-32.js, station-client-32.js.
- PERF-2 và PRIORITY-4: cùng đụng smart-app-32.js.
Gặp cặp nào thì cho một luồng nghỉ vòng đó.

Nội dung giao cho sub agent (thay <TÊN>, <FILE>, cổng của luồng):
"Bạn làm DUY NHẤT task <TÊN>. Mở docs/prompts/<FILE>.md, tìm khối text có 'TÊN TASK: <TÊN>' và làm đúng khối đó. Đọc docs/agent/RULES.md trước.
Không có bước duyệt của người dùng: chỗ nào ghi 'ngưỡng đã duyệt' thì dùng 'Ngưỡng đề xuất' trong báo cáo bước trước; không có thì dùng ngưỡng mặc định trong prompt.
Dùng cổng tĩnh <PORT_STATIC> và backend <PORT_API> thay cho cổng ghi trong prompt.
Đo chạy dài: dùng --minutes 3 thay cho 10 hoặc 20.
Tự giới hạn 90 phút. Quá giờ thì dừng, ghi báo cáo 'DỪNG SỚM' với phần đã làm.
Chỉ git add đúng file mình sửa, commit theo message trong prompt, KHÔNG push.
Kết thúc: ghi work/<TÊN>.report.md theo mẫu RULES mục 13, rồi trả về 5 dòng: kết quả, commit, file đã đổi, số đo chính, việc còn dở."
Nếu worker-cheap báo lỗi kết nối, 429 hoặc hết hạn mức thì giao lại đúng task đó cho worker-alt (một lần).

=== KIỂM SAU MỖI VÒNG (bạn tự làm, ngắn) ===
1. Mỗi task phải có work/<TÊN>.report.md, dòng đầu là ĐẠT / KHÔNG ĐẠT / DỪNG SỚM.
2. Chạy `git log --oneline -5 --stat`. Commit của task chỉ được chứa file mà prompt cho phép. Có file lạ thì `git revert --no-edit <hash>`, ghi KHÔNG ĐẠT.
3. Chạy `grep -c "Ã¡\|Ã©\|á»\|áº\|Ä‘\|Æ°" <file>` cho từng file .js/.py/.ts/.tsx đã đổi. Kết quả khác 0 thì revert commit đó.
4. Sau mỗi 3 vòng, chạy bộ test (mỗi lệnh một lần):
   - node --test "outputs/hcmc-poc/test/*.test.mjs"
   - outputs/smart-traffic/backend/.venv/Scripts/python.exe -m pytest outputs/smart-traffic/backend/tests -q -p no:cacheprovider
   - cd outputs/smart-traffic/web && npm run test && npm run build
   Fail thì giao worker-strong sửa ĐÚNG lỗi đó (tự giới hạn 30 phút). Vẫn fail thì revert task gây lỗi.
5. Ổn thì: git push origin Kietvo2k/smart-traffic-bac

=== KHÔNG SA LẦY ===
- Task KHÔNG ĐẠT hoặc DỪNG SỚM: ghi log, sang task kế của luồng, KHÔNG giao làm lại.
- Ngoại lệ: DEMAND-2 và PRIORITY-1 được thử lại đúng 1 lần bằng sub agent mới, kèm đường dẫn báo cáo lần trước. Lần 2 vẫn hỏng: DEMAND-2 hỏng thì vẫn chạy tiếp DEMAND-3; PRIORITY-1 hỏng thì bỏ PRIORITY-2…6.
- Task phụ thuộc task đã hỏng: ghi "BỎ QUA do <task>".
- Không thêm việc ngoài danh sách. Lỗi khác phát hiện được thì ghi vào mục "Phát hiện" trong work/AUTO-RUN.log.

=== TIẾT KIỆM TOKEN (VietCode có hạn) ===
- Bạn chỉ đọc 5 dòng sub agent trả về, báo cáo (≤ 25 dòng) và `git log --stat`. Không đọc mã, không đọc log dài.
- Không dán prompt task vào lệnh giao việc; sub agent tự mở file.
- VietCode báo hết credit hoặc 429 kéo dài: dừng giao task (*), luồng còn lại vẫn chạy bằng worker-cheap / worker-alt. Agent chính cũng hết hạn mức: làm KẾT THÚC ngay.

=== MỐC GIỜ ===
- Từ giờ thứ 11: không giao task (*) mới.
- Từ giờ thứ 12: không giao task mới.
- KẾT THÚC (muộn nhất giờ thứ 12,5):
  1. Chạy đủ bộ test ở bước kiểm 4, mỗi lệnh một lần.
  2. Cập nhật docs/agent/HANDOFF.md: mục 1 thêm các task ĐẠT; mục 3 ghi số đo mới và task chưa xong.
  3. Viết work/AUTO-RUN.summary.md ≤ 30 dòng: bảng task | kết quả | commit | số đo chính; việc còn lại; phát hiện.
  4. Commit "AUTO-RUN: cập nhật HANDOFF sau đợt chạy", push, in summary ra.
```

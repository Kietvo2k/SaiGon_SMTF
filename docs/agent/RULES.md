# Quy tắc chung cho agent (bắt buộc đọc trước mọi task)

Áp dụng cho mọi prompt trong `docs/prompts/`. Thay cho `work/oc-task.md` cũ, vì thư mục `work/` không có trong repo.

1. **Đọc trước:**
   - Bắt buộc: `docs/agent/DECISIONS.md` (quyết định người dùng đã chốt) và `docs/agent/HANDOFF.md` (hiện trạng, hợp đồng backend, việc còn mở).
   - Đặc tả chuẩn là `docs/superpowers/specs/2026-10-14-smart-traffic-bac-design.md`. Chỉ đọc những mục mà prompt trích dẫn.
2. **Phạm vi:**
   - Chỉ sửa các file mà prompt cho phép.
   - Không refactor ngoài phạm vi.
   - Thấy đặc tả hay kế hoạch mâu thuẫn với mã thật: chọn cách nhỏ nhất mà vẫn đúng đặc tả, rồi ghi rõ trong báo cáo.
3. **TDD:** viết test, chạy thấy FAIL, cài đặt tối thiểu, rồi chạy thấy PASS.
4. **Không sa lầy:**
   - Mỗi mục tiêu đo lường được thử tối đa 2 vòng chỉnh.
   - Hết 2 vòng mà chưa đạt thì dừng: giữ mặc định cũ, đưa biến thể mới vào sau cờ tùy chọn, rồi báo cáo trung thực bằng số.
   - Không vá lỗi này sang lỗi khác ngoài phạm vi prompt; ghi lại để làm task sau.
5. **Giữ tương thích:**
   - Mở `webgpu-materials-24.html` không có `app=smart` thì phải chạy 31A cổ điển y nguyên.
   - Sim chạy không có tham số mới thì giữ hash cổ điển `c05ce91e`.
   - `fixed` và mặc định `max-pressure` không đổi, trừ khi prompt cho phép.
6. **Server và tiến trình nền:**
   - Chạy bằng `nohup … > work/tmp-<tên>.log 2>&1 < /dev/null &`.
   - Dùng cổng riêng ghi trong prompt. Nếu prompt không ghi: tĩnh 8831, backend 8930.
   - Tắt mọi server, Chromium và node của mình trước khi kết thúc.
7. **Cài package:**
   - Chỉ cài trong dự án: npm trong `outputs/smart-traffic/web`, pip trong `outputs/smart-traffic/backend/.venv`.
   - Không cài global.
8. **Git:**
   - Chỉ `git add <từng file>`. Không `git add -A` hoặc `.`, không stash, reset, đổi nhánh hay push. Riêng điều phối viên của `docs/prompts/AUTO-RUN.md` được push nhánh `Kietvo2k/smart-traffic-bac` và được `git revert` commit của sub agent.
   - Không commit `work/`, `var/`, `node_modules/`, `.venv/`, `dist/`, media hay model.
   - Message commit bằng tiếng Việt, theo mẫu prompt ghi.
9. **UI:**
   - Không dùng các chữ "giả lập", "mô phỏng", "minh họa", "illustrative", "simulated", "demo", "fake".
   - Không dùng tên, logo hay tên miền của CSGT, Bộ Công an, Cổng dịch vụ công hoặc cổng phạt nguội thật.
   - Nộp phạt chỉ đổi trạng thái: không có ô thẻ hay tài khoản ngân hàng.
   - Tài liệu kỹ thuật thì ghi rõ bản chất mô phỏng.
10. **Chống vỡ dấu:**
    - Không ghi file nguồn bằng PowerShell `Set-Content`, `Out-File` hay `>` (PowerShell 5.1 làm hỏng UTF-8). Dùng công cụ edit của agent hoặc Python `encoding='utf-8'`.
    - Trước mỗi commit chạy `grep -c "Ã¡\|Ã©\|Ã³\|Ãº\|á»\|áº\|Ä‘\|Æ°" <file>` cho từng file; kết quả phải bằng 0.
11. **Phạm vi đọc:**
    - Chỉ đọc và ghi trong repo (cộng thư mục tạm của hệ thống).
    - Không mở thư mục cá nhân của người dùng (Pictures, Documents, Desktop, Downloads…) hay repo khác.
12. **Bí mật:** tài khoản seed dev chỉ nằm trong `outputs/smart-traffic/backend/app/seed/accounts.json`. Không in mật khẩu ra báo cáo, UI hay README.
13. **Kết thúc:**
    - Chạy lại toàn bộ lệnh kiểm mà prompt ghi.
    - Ghi báo cáo ≤ 25 dòng vào `work/<TÊN-TASK>.report.md` theo đúng mẫu dưới đây, rồi in ra cuối phiên.

```markdown
# <TÊN-TASK>: ĐẠT | KHÔNG ĐẠT | DỪNG SỚM
Commit: <hash> — <message>
File đã đổi: <danh sách>
## Số đo
| Chỉ số | Trước | Sau | Ngưỡng | Đạt? |
|---|---|---|---|---|
## Kiểm
- <lệnh>: <pass>/<tổng>
## Lệch khỏi prompt
- <điều gì, vì sao> (không có thì ghi "Không")
## Ngưỡng đề xuất cho bước sau (chỉ prompt đo)
- <chỉ số>: <giá trị> — lý do
## Việc còn dở / phát hiện ngoài phạm vi
- ...
```

## Lệnh kiểm chung

```bash
node --test "outputs/hcmc-poc/test/*.test.mjs"
```
Bộ test đơn vị 3D và sim, khoảng 5 phút.

```bash
outputs/smart-traffic/backend/.venv/Scripts/python.exe -m pytest outputs/smart-traffic/backend/tests -q -p no:cacheprovider
```
Test backend. Trên Linux/macOS dùng `.venv/bin/python`.

```bash
cd outputs/smart-traffic/web && npm run test && npm run build
```
Test và build web.

```bash
PORT=8831 nohup python outputs/hcmc-poc/serve.py > work/tmp-static.log 2>&1 < /dev/null &
```
Bật server tĩnh trước khi chạy các QA trình duyệt bên dưới.

```bash
PORT=8831 node outputs/hcmc-poc/scripts/qa-north-32.cjs
```
QA khu Bắc.

```bash
PORT=8831 node outputs/hcmc-poc/scripts/qa-capture-32.cjs
```
QA ảnh camera.

```bash
PORT=8831 node outputs/hcmc-poc/scripts/qa-traffic-31.cjs webgl
```
QA giao thông 31A cổ điển.

```bash
node outputs/hcmc-poc/scripts/qa-project-hygiene.cjs
```
QA vệ sinh dự án.

```bash
node scripts/kpi-ab-32.mjs --seeds 31031-31035 --scenario peak-hang-xanh --duration 1800 --mode both --out work/kpi-x
```
Đo A/B đèn. Có thêm `--scenario app-1730` và `--algorithm …`.

Chạy cả hệ:

```bash
bash outputs/smart-traffic/run-smart.sh
```
Bật server tĩnh (8821), backend (8900) và web (5173). Trên Windows dùng `run-smart.ps1`.

```bash
bash outputs/smart-traffic/run-smart.sh --stop
```
Tắt cả ba.

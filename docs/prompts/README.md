# Bộ prompt phase sau

Mỗi file là **một chuỗi việc**. Mỗi prompt trong chuỗi là một bước nhỏ: chạy trong một phiên agent mới, xong bước trước mới chạy bước sau.

| File | Chuỗi | Số prompt | Làm khi nào |
|---|---|---|---|
| [PERF.md](PERF.md) | Giảm tải khi chạy 24/7 | 5 (+1 tùy chọn) | Trước, nếu máy đang lag |
| [DEMAND.md](DEMAND.md) | Sửa xe tắc cứng ở mật độ app | 3 | Trước PRIORITY và A1 |
| [PRIORITY.md](PRIORITY.md) | Xe ưu tiên, làn sóng xanh, cờ nhường đường | 6 | Sau DEMAND |
| [A1.md](A1.md) | Đèn thích ứng đạt chỉ tiêu A1 | 3 | Sau DEMAND |
| [SMALL.md](SMALL.md) | Việc nhỏ độc lập | 10 | Lúc nào cũng được |

## Cách chạy một prompt

1. Ở thư mục gốc repo, chuyển sang nhánh làm việc:
   ```bash
   git checkout Kietvo2k/smart-traffic-bac
   ```
2. Mở **phiên agent mới** (opencode, VietCode hoặc Codex) ở thư mục gốc repo.
3. Chép **nguyên khối** ` ```text … ``` ` của prompt rồi dán vào. Không cần thêm gì.
4. Agent xong thì đọc `work/<TÊN>.report.md`. Mục **Duyệt** cuối mỗi prompt ghi bạn cần xem gì trước khi chạy prompt kế.
5. Ổn thì push:
   ```bash
   git push origin Kietvo2k/smart-traffic-bac
   ```

**Nếu agent báo không đạt:** đừng bắt nó sửa tiếp trong cùng phiên. Ghi số đo vào `docs/agent/HANDOFF.md` mục 3, rồi quyết định chạy lại bước đó (phiên mới) hoặc bỏ qua.

## Khung mỗi prompt

| Mục | Nội dung |
|---|---|
| **Bối cảnh** | Vấn đề và số đo thật đã có |
| **Sự thật trong mã** | Tên hàm và `file:dòng` đã kiểm (ngày 17/10/2026; dòng có thể lệch vài dòng) |
| **Mục tiêu** | Một câu |
| **Được sửa / Không được sửa** | Danh sách file |
| **Các bước** | Mỗi bước có **ĐIỂM DỪNG**: điều phải thấy trước khi sang bước sau |
| **Kiểm** | Lệnh và kết quả phải có |
| **Khi nào dừng** | Điều kiện dừng sớm, để không sa lầy |
| **Báo cáo** | Mẫu cố định trong `docs/agent/RULES.md` mục 13 |

**Ngưỡng đo:**
- Prompt đầu mỗi chuỗi chỉ **đo**. Agent đề xuất ngưỡng trong báo cáo, bạn duyệt.
- Các prompt sau dùng ngưỡng đã duyệt. Nếu bạn chưa sửa gì, ngưỡng **mặc định** ghi trong prompt là số tương đối so với số nền đo được, không phải số tuyệt đối tự đặt.

**Model:**
- **Mạnh** (qwen-3.8-max, Codex): prompt ghi "cần model mạnh".
- **Rẻ** (deepseek-v4.1-flash, muse-spark, ox-alpha): các prompt còn lại.

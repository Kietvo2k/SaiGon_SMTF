# Bộ prompt phase sau

Mỗi file là **một chuỗi việc**. Mỗi prompt trong chuỗi là một bước nhỏ: chạy trong một phiên agent mới, xong bước trước mới chạy bước sau.

| File | Chuỗi | Số prompt | Làm khi nào |
|---|---|---|---|
| [PERF.md](PERF.md) | Giảm tải khi chạy 24/7 | 5 (+1 tùy chọn) | Trước, nếu máy đang lag |
| [DEMAND.md](DEMAND.md) | Sửa xe tắc cứng ở mật độ app | 3 | Trước PRIORITY và A1 |
| [PRIORITY.md](PRIORITY.md) | Xe ưu tiên, làn sóng xanh, cờ nhường đường | 6 | Sau DEMAND |
| [A1.md](A1.md) | Đèn thích ứng đạt chỉ tiêu A1 | 3 | Sau DEMAND |
| [SMALL.md](SMALL.md) | Việc nhỏ độc lập | 10 | Lúc nào cũng được |

## Thứ tự chạy

Agent dùng danh sách này để tự tìm việc kế tiếp: lấy task đầu tiên chưa có `work/<TÊN>.report.md`.

1. PERF-1 (PERF.md)
2. PERF-2 (PERF.md), cần model mạnh
3. PERF-3 (PERF.md)
4. PERF-4 (PERF.md)
5. PERF-5 (PERF.md)
6. DEMAND-1 (DEMAND.md)
7. DEMAND-2 (DEMAND.md), cần model mạnh
8. DEMAND-3 (DEMAND.md)
9. PRIORITY-1 (PRIORITY.md), cần model mạnh
10. PRIORITY-2 (PRIORITY.md), cần model mạnh
11. PRIORITY-3 (PRIORITY.md)
12. PRIORITY-4 (PRIORITY.md)
13. PRIORITY-5 (PRIORITY.md)
14. PRIORITY-6 (PRIORITY.md)
15. A1-1 (A1.md)
16. A1-2 (A1.md), cần model mạnh
17. A1-3 (A1.md)
18. FIX-LABELS (SMALL.md)
19. FIX-STATION-LOGIN (SMALL.md)
20. FIX-SPEED (SMALL.md)
21. FIX-TURN (SMALL.md)
22. FIX-WRONGWAY (SMALL.md)
23. FIX-BRIDGE (SMALL.md)
24. FIX-PLATES (SMALL.md)
25. FIX-SPEC46 (SMALL.md)
26. CLEAN-2 (SMALL.md)

Không có trong danh sách (chỉ chạy khi người dùng yêu cầu): PERF-6, VIDEO-ONNX.

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

---
name: smtf-delivery
description: Dùng khi lập plan, triển khai, kiểm thử, review hoặc bàn giao bản public của SaiGon SMTF.
---

# Triển khai SaiGon SMTF

Đọc `AGENTS.md`, `docs/agent/RULES.md`, `docs/agent/HANDOFF.md` và brief được giao.
Chạy preflight, đọc phần đặc tả in ra, xác nhận READY với một ca biên.
Điều phối viên giữ sổ tiến độ, giới hạn hai lượt sửa sau lần kiểm đầu tiên
và giao kiểm thử cho các vai trò độc lập.

Khi bàn giao, ghi JSON kết quả theo RULES, kiểm SHA/phạm vi qua preflight
và dẫn tới bằng chứng của cổng hardtest.

# Prompt điều phối SaiGon SMTF

## Public Demo v1

| Lối triển khai | Nhánh | Prompt |
|---|---|---|
| Giao diện, HUD và luồng người dùng | `codex/public-demo-ui` | [PUBLIC-DEMO-UI.md](PUBLIC-DEMO-UI.md) |
| Lõi mô phỏng, adapter, AI và triển khai | `codex/public-demo-core` | [PUBLIC-DEMO-CORE.md](PUBLIC-DEMO-CORE.md) |

Hai nhánh tách từ cùng commit `smtf-public-demo-handoff-v1`. Mở mỗi prompt trong worktree của nhánh tương ứng. Điều phối viên giao vai trò con bằng brief, kiểm receipt và yêu cầu từng vai trò bàn giao kết quả. [Đặc tả](../agent/PUBLIC-DEMO-SPEC.md) · [Hợp đồng](../agent/CONTRACT-PUBLIC-DEMO.md) · [Quy trình bắt buộc](../agent/RULES.md)

## Tư liệu tháng 10/2026

Các prompt [PERF](PERF.md), [DEMAND](DEMAND.md), [PRIORITY](PRIORITY.md), [A1](A1.md), [SMALL](SMALL.md) và [AUTO-RUN](AUTO-RUN.md) lưu logic, số liệu và đầu việc của các phiên trước. Thứ tự nghiệm thu của đợt đó xem `git show 3f8e31e:docs/prompts/README.md`. Để dùng lại một thí nghiệm, đối chiếu với đặc tả hiện hành rồi đưa vào brief mới.

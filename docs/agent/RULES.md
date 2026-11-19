# Quy tắc điều phối và nghiệm thu Public Demo

Áp dụng cho hai [prompt hiện hành](../prompts/README.md). Bắt đầu với `AGENTS.md`, [bàn giao](HANDOFF.md), [đặc tả](PUBLIC-DEMO-SPEC.md) và [hợp đồng](CONTRACT-PUBLIC-DEMO.md). Các nguồn này làm căn cứ giao việc và xác minh. Tài liệu tháng 10 là lịch sử.

## Nhận việc và kiểm phiên bản

Điều phối viên chốt kế hoạch sau khi gọi một `planner` kiểm đọc, đối chiếu mã thật, rủi ro và cách đo. Sau đó chia từng lát độc lập, khóa requirement ID, input, oracle, file ownership, lệnh và kết quả cần trả. Hai nhánh cấp chính xuất phát từ cùng mốc `smtf-public-demo-handoff-v1`. Mỗi agent ghi dùng một worktree riêng của lát, còn agent review dùng ứng viên đúng SHA ở worktree chỉ đọc. Điều phối viên giữ các file hợp đồng và kiểm tích hợp.

Với mỗi vai trò/lần sửa, cấp một ID in hoa riêng. Tạo `work/smtf-agent/briefs/<ID>.json` tại worktree được giao trước khi agent bắt đầu. Brief có `task`, `role`, `branch`, `worktree` tuyệt đối, `baseSha`, `specVersion: "public-demo-v1"`, `requirements`, `writablePaths`, `round` từ `0` đến `2` và `requiredReads` tùy chọn. Dùng đường dẫn repo đầy đủ cho từng file; dấu `/` cuối entry biểu thị prefix thư mục. `planner`, `review`, `browser-qa` có `writablePaths: []`. Điều phối viên ghi cả SHA thực tế lúc giao vào ledger.

Agent mở phiên, resumed hoặc sau compact phải đối chiếu ledger và brief, rồi chạy preflight trước khi chỉnh sửa hoặc kiểm:

```powershell
git status --short --branch
git rev-parse HEAD
node scripts/agent/preflight.mjs --task <ID> --role <vai-trò>
```

Preflight kiểm branch, worktree, base SHA, đặc tả, phạm vi, số vòng và tạo receipt trong `work/smtf-agent/receipts/`. Nó in các tài liệu chung và đoạn đặc tả đúng requirement ID. Agent trả `READY` với requirement ID, ca biên có ý nghĩa và lệnh đầu tiên. Xác minh nội dung `READY` trước khi giao phần việc có tác động. Receipt cho biết nội dung nào được nạp theo phiên bản. Mức hiểu yêu cầu được kiểm qua ca biên, diff và kết quả kiểm độc lập.

Codex dùng `AGENTS.md`, `.codex/hooks.json`, `.codex/agents/` và `.agents/skills/` nếu gọi skill. Claude Code dùng `CLAUDE.md` import `@AGENTS.md`, `.claude/settings.json` và `.claude/agents/`. Hook `SessionStart` và `SubagentStart` cung cấp nhắc đọc lúc chạy trên client đã tin cậy hook. Codex yêu cầu duyệt hook theo hash. Dùng preflight thủ công ở client không chạy hook. Khởi động lại phiên khi sửa chỉ dẫn và đầu vào đã đổi. [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md) · [Codex hooks](https://developers.openai.com/codex/hooks) · [Claude Code memory](https://code.claude.com/docs/en/memory) · [Claude Code hooks](https://code.claude.com/docs/en/hooks)

## Thứ tự agent cho từng lát

| Vai trò | Đầu vào và phần việc | Kết quả cần có |
|---|---|---|
| `planner` | Đọc spec, hợp đồng và mã. Tìm lỗ hổng kế hoạch. | Rủi ro, ca biên, phụ thuộc và đề xuất thứ tự. |
| `code` | Thực hiện đúng yêu cầu và phạm vi sản phẩm. | Commit cục bộ, ghi cách hoạt động, giới hạn và lệnh để tái hiện. |
| `hardtest` | Cùng spec, dùng worktree riêng. Viết suite chính từ dữ liệu và hành vi quan sát được. | Commit test, bảng requirement → test, kết quả đỏ trên sự cố đã biết. |
| `meta` | Độc lập với tác giả test. Kiểm runner lẫn bộ test chính bằng ca lỗi có kiểm soát. | Script xác minh exit code, danh mục test, log và báo cáo. Có red khi bỏ test hoặc tạo kết quả sai. |
| `cross` | Độc lập với suite chính. Tự viết cách tính, fixture và kiểm tra tương đương từ đặc tả. | Script chéo, kết quả trên ứng viên sạch và các ca lỗi. |
| `review` | Chỉ đọc diff sản phẩm, test, meta và chéo sau khi có kết quả. | Mục sai với spec, lỗ hổng cho kết quả xanh giả, mức độ và bằng chứng. |
| `browser-qa` | Chỉ đọc ứng viên đã qua kiểm script. Thao tác luồng thật trong trình duyệt sạch. | SHA/URL, bước và kết quả quan sát, ảnh/trace, hạn chế và ca không đạt. |

Trong một đợt chỉ chạy song song tối đa hai subagent ghi. Giao `code` và `hardtest` cùng đợt sau khi planner đã trả lời. Sau đó giao `meta` và `cross`, rồi review và browser-qa trên đúng ứng viên. Các vai trò kiểm có context mới và phạm vi hẹp. Lead chỉ dùng các phần tổng hợp cần thiết trong chat, phần chi tiết giữ ở log/handoff. Giới hạn cây ở một tầng dưới lead. Khi công cụ không có subagent, chạy các vai trò qua phiên độc lập và chờ kết quả từng vai trò trước khi duyệt.

Điều phối viên ghép các commit mà các bước đã bàn giao, rồi kiểm lại candidate trong worktree tích hợp. Agent chỉ ghi tệp thuộc allowlist, kể cả tài liệu của đúng vai trò. Giữ fixture mong đợi từ đặc tả, độc lập với thuật toán trong sản phẩm. Nếu phải đổi hợp đồng hoặc ngoại lệ nghiệm thu, ghi lý do, lấy review cả hai nhánh, tạo commit bổ sung chung rồi cấp brief mới với đường dẫn và hash mới.

## Cổng kiểm và chống kết quả xanh giả

Từ root, chạy `node scripts/hardtest/run.mjs --profile ci` ở lát thay đổi. Trước release, chạy `node scripts/hardtest/run.mjs --profile release` trên cùng commit với report browser, camera và hiệu năng. Kiểm báo cáo có `PASS` cho đủ ID trong đặc tả. `FAIL`, `BLOCKED`, test bị skip, thiếu test, số test bằng 0, lỗi hạ tầng hoặc evidence sai SHA đều chặn nghiệm thu tương ứng. Cấu hình cổng kiểm đáp lại exit code khác 0 và giữ log cho mọi ca. Cổng phát hành kiểm artifact và dữ liệu thực thi theo [QA](../qa-public-demo.md).

- Suite chính kiểm hành vi ở biên người dùng và ràng buộc dữ liệu. Mỗi yêu cầu trọng yếu có positive case và ít nhất một ca hỏng phân biệt. Tập trung vào lệnh hiện thành công trước ack, xe bị thu hồi được đếm như đã đến đích, hộp AI lệch frame và hồ sơ mẫu lẫn giữa hai profile.
- Suite meta chạy runner trong môi trường kiểm riêng với ca thiếu test/ID, tiến trình lỗi, log hỏng, report/commit lệch, thiếu artifact và ca thành công. Với logic sản phẩm, dùng một biến thể lỗi có chủ đích trong worktree kiểm riêng hoặc fixture đứng ở biên ngoài. Ca đỏ phải lỗi ở đúng assertion, rồi chạy lại ứng viên sạch. Ghi SHA và cách tái tạo; giữ biến thể kiểm ngoài nhánh phát hành.
- Suite chéo tự tính giá trị mong đợi và dùng ít nhất một input khác. Với A1, tính lại các cặp từng seed, ngưỡng và lỗi chia cho 0. Với luồng UI, ưu tiên hành vi qua trình duyệt hoặc public API của adapter, không dùng helper mà code hoặc test chính dùng để tính kết quả. Review loại nhận xét chỉ dựa số dòng coverage và yêu cầu ca bắt hồi quy cụ thể.
- CI phải luôn đánh giá toàn bộ job bắt buộc. Nếu dùng job tổng hợp, chọn `if: always()` và kiểm explicit từng kết quả `needs`. GitHub có thể hiển thị job bị skip là thành công. Kích hoạt required check ổn định trên repo có quyền và gói hỗ trợ. Khi chưa kích hoạt, người điều phối phải kiểm cổng từ candidate SHA trước merge và triển khai. [GitHub required checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)

## Hai vòng sửa và xử lý bế tắc

Vòng 0 là lần ghép và kiểm đầu tiên. Một lỗi sản phẩm làm lát quay lại `code`; chạy ca hỏng trước rồi chạy lại suite chính, meta, kiểm chéo và những luồng liên quan. Lỗi test hoặc môi trường phải có tái hiện nhỏ trước khi chuyển tới đúng chủ sở hữu. Failing test không được làm xanh bằng cách bỏ assertion, giảm ngưỡng, dùng `skip` hoặc đổi fixture để khớp output. Mỗi lần thay ứng viên sau thất bại dùng một vòng sửa. Tối đa vòng 1 và vòng 2, tính chung cho lát kể cả khi đổi agent, đổi phiên hoặc lỗi chuyển từ code sang test. Không mở vòng con.

Sau vòng 2 còn đỏ, đóng băng ứng viên ở trạng thái `blocked`. Điều phối viên lưu log, nguyên nhân đã xác định, mức ảnh hưởng, SHA, ca hỏng tối thiểu và người có thể xử lý. Giao một agent đọc độc lập để chẩn đoán, chọn giữa thu hẹp lát với hợp đồng được review lại hoặc sửa dependency/môi trường bị hỏng. Giữ bản xanh gần nhất. Chỉ lập lát mới sau khi xác định nguyên nhân gốc và cập nhật kế hoạch. Mọi mục bị rút ra vẫn phải hiện trên danh sách yêu cầu chưa đạt. Giữ release dừng nếu còn bất kỳ mục bắt buộc nào đỏ.

## Bàn giao bắt buộc

Commit cục bộ tệp đúng phạm vi. Agent cập nhật tài liệu triển khai hoặc báo cáo kiểm của vai trò trước khi bàn giao. `planner`, `review`, `browser-qa` ghi kết quả ở vùng worktree bỏ qua bởi Git, điều phối viên chắt lọc kết luận dài hạn vào docs. Đặt `work/smtf-agent/results/<ID>.<vai-trò>.json` với `task`, `role`, `baseSha`, `commit`, `receiptSha256`, `status` (`ready`, `blocked`, `failed`), `ready` gồm `requirements`, `edgeCase`, `firstCheck`, `checks` gồm `command`, `exitCode`, cùng `summary`, `remaining` và `next`. Có thể gắn đường dẫn log trong ghi chú và kết quả của từng check. Dùng `ready` cho phạm vi subagent đã kiểm, không thay cho kết luận release.

Điều phối viên chạy trong worktree của brief:

```powershell
node scripts/agent/preflight.mjs --task <ID> --role <vai-trò> --verify --result work/smtf-agent/results/<ID>.<vai-trò>.json
```

Đối chiếu receipt `startSha` với SHA điều phối viên đã ghi khi giao, rồi đọc diff và test. Phần test xanh từ SHA khác cần chạy lại. Cập nhật `work/smtf-agent/ledger.md` với ID, vòng, nhánh/worktree, base và candidate SHA, scope, kết quả từng vai trò, đường dẫn evidence và hành động kế tiếp. Nội dung tài liệu tiếng Việt có dấu, UTF-8. Chỉ stage file đúng nhiệm vụ. Log, dữ liệu runtime, bí mật và cấu hình riêng trên máy ở ngoài commit. Người điều phối nắm các thao tác ghép và phát hành.

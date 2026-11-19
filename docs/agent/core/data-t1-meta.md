# DATA-T1 — kiểm meta độc lập

## Vòng sửa 1 · CORE-DATA-T1-META-01

Ứng viên và receipt `startSha`: `d2bf791c9f41e52673cdb221fff66859cfac8a58`.
Worktree `f811`, nhánh `codex/core-data-t1-r1-meta`, vòng 1/2.
Receipt: `6e9e2fdf1503107e9b256cf56af38a5748c76dc602982ab48eee06183001d125`.
Hợp đồng và fixture vẫn là `public-demo-v1`.

Meta khóa danh mục 18 tên Node chính, năm tên Node review và sáu ID Pytest review,
gồm hai nhánh WS inbound/outbound. `runCheck` đọc TAP/JUnit thật và kiểm số ca;
meta so toàn bộ tên/ID theo thứ tự trong từng suite. Hai lớp bắt riêng việc đổi
ID nhóm, thiếu/lặp một tên cùng nhóm, số ca không khớp JUnit, skip, zero, child exit
1 hoặc 5, thiếu report, TAP/XML hỏng. Kiểm gắn SHA và hash artifact của vòng 0 vẫn
được giữ. Không lấy fixture replay làm bằng chứng hành vi sản phẩm.

| Requirement | Meta ID | Biến thể mới và phép phân biệt |
|---|---|---|
| DATA-01, USER-01, DOCKER-01 | `DATA-T1-META-16..17` | Khóa inventory review và kiểm lỗi runner TAP/JUnit. |
| DATA-01, USER-01, DOCKER-01 | `DATA-T1-META-18` | `MUT-LEASE-OLD-SOURCE`: bỏ kiểm lease khi nhận WS message sau auth; R1 inbound phải phát hiện nguồn cũ xuất hiện thay vì chỉ nguồn hiện tại. |
| DATA-01, USER-01 | `DATA-T1-META-19` | `MUT-ID-DECODE-TWICE`: giải mã lần hai riêng chuỗi còn `%2F`; R3 phải bắt ID slash và literal bị nhập, dù các ID khác vẫn qua. |
| DATA-01, USER-01 | `DATA-T1-META-20` | `MUT-TTL-ENQUEUE`: áp hạn đã ghi khi enqueue; R6 phải bắt override mất hiệu lực ngay sau ACK trễ. |
| DATA-01, DOCKER-01 | `DATA-T1-META-21` | `MUT-FRAME-REVISION`: lưu metadata và vẫn gửi stream, bỏ tăng revision/phát snapshot event; R7 phải bắt ở assertion revision và snapshot event. |

Biến thể Node chạy suite chính/review của worktree với `DATA_T1_ROOT` trỏ bản sao;
biến thể Python chạy cùng test review và app tương ứng trong bản sao. Bản sao chỉ
chứa các tệp Git đã đối chiếu sạch với HEAD; lưu SHA-256 của mỗi tệp và đối chiếu
nguyên byte sau khi sao. Chỉ ghi biến thể vào bản sao nằm trong thư mục ignored của
lượt kiểm. Mỗi biến thể phải làm đúng ca đích trượt ở assertion với exit 1; sau
đó khôi phục byte và chạy lại ca đó trên cùng bản sao. Kiểm toàn bộ tệp gốc và
bản sao ở cuối; không sửa test của tác giả khác, sản phẩm, gate hoặc CI.

Kiểm JUnit cho thấy report đúng số ca nhưng ID bị thay có thể vẫn `PASS` qua API
runner; lớp meta từ chối ID sai. Gap kiểm tên nhóm TAP và nhánh stale-report ở
vòng 0 vẫn thuộc coordinator. Sửa 1 thay async wait trong primary bằng polling;
không dùng quan sát vòng 0 để đánh dấu phiên bản mới flake. Browser QA cảnh đã
render, AI frame identity, DATA-T2 và nghiệm thu CI/Docker/release đầy đủ nằm
ngoài kết luận meta của vòng này.

Bằng chứng lượt sạch trực tiếp ở `work/smtf-agent/meta/round1-baseline/`: 23/23
Node (18 chính + 5 review), 6/6 Pytest review, cả hai exit 0. Lượt meta **21/21**,
exit 0, không fail/skip/cancel/todo; cuối lượt vẫn đủ 18+5+6 ca sạch. Cả mười
biến thể (sáu từ vòng 0 và bốn mới) trả exit 1 tại đúng assertion; từng file
khớp hash ban đầu và từng ca đích chạy sạch sau khi khôi phục. Log ngoài:
`work/smtf-agent/meta/round1-first.stdout.log`. Trong
`work/smtf-agent/meta/data-t1-CLy78p/`, `summary.json` ghi command, productRoot
và hash log/report; từng thư mục `MUT-*` lưu diff, byte trước/sau và kết quả
khôi phục. Hai lượt kiểm chạy trước khi commit meta, trên tệp sản phẩm và
suite chính/review không đổi so với `d2bf791`. Cần chạy lại khi ghép SHA mới.

Lệnh tái hiện:

```powershell
node --test --test-reporter=tap scripts/hardtest/data/data-t1-meta.test.mjs
node scripts/agent/preflight.mjs --task CORE-DATA-T1-META-01 --role meta --verify --result work/smtf-agent/results/CORE-DATA-T1-META-01.meta.json
```

## Hồ sơ vòng 0

Task `CORE-DATA-T1-META-00`, vai trò `meta`, vòng `0`; chưa được cấp sửa 1/2.
Ứng viên sản phẩm và receipt `startSha`:
`6e742ec3306e685b8f9496236c9fad435bc5d47f`.
Worktree `f811`, nhánh `codex/core-data-t1-meta`.
Hợp đồng giữ `public-demo-v1`; receipt SHA-256
`c1702ae970880bfd1e7ac593a849936f5b26d6bda778d3edba865a5af49193f5`.

## Phạm vi và cách kiểm

Suite mới là `scripts/hardtest/data/data-t1-meta.test.mjs`. Suite gọi API
`runCheck` và `verifyReleaseInputs` hiện hữu; không sửa runner, gate, CI, hợp đồng
hoặc fixture. Subject sản phẩm là đủ 18 ca Node của suite chính, gồm adapter local
gọi FastAPI thật. Oracle meta là danh mục 18 tên ca đã được giao, trạng thái runner,
log tiến trình và các assertion nghiệp vụ được quan sát khi chạy mutant.

Suite chạy tuần tự trong worktree kiểm riêng. Mỗi mutant chỉ đổi một span trong
allowlist, chụp nguyên byte/hash trước khi ghi, lưu mutant/diff/command/raw log,
khôi phục trong `finally`, kiểm lại SHA-256 nguyên byte rồi chạy ca sạch tương ứng.
Có fallback khôi phục khi tiến trình thoát thông thường. Không chạy đồng thời suite
này với tiến trình ghi vào cùng ba file sản phẩm. Không dùng SIGKILL khi mutant
đang hoạt động; khi host bị kill cứng, dùng `original.bin` ở evidence để phục hồi
và đối chiếu hash trước khi làm tiếp. Commit chỉ chứa suite meta và tài liệu này.

Không lấy helper sản phẩm làm expected và không dùng missing-entry làm bằng chứng
bắt invariant. Các fixture TAP/report trong nhóm runner chỉ kiểm hợp đồng runner;
chúng không được tính là ca đã kiểm hành vi sản phẩm.

## Ma trận requirement → phép kiểm

| Requirement | Meta ID | Bằng chứng chính |
|---|---|---|
| DATA-01 | `DATA-T1-META-01..08`, `15` | Đủ 18 ca, inventory từng tên, exit/log/report và provenance; full-clean đầu/cuối. |
| DATA-01, USER-01 | `DATA-T1-META-09..11`, `14` | ACK sau callback, bắt buộc dequeue, không replay, fencing lifecycle renew cũ. |
| DATA-01 | `DATA-T1-META-12..13` | BroadcastChannel và resolve không đi trước transaction complete. |
| DOCKER-01 | `DATA-T1-META-01`, `15` | Giữ ca local adapter/FastAPI trong inventory; không thay smoke Docker/volume. |

## Runner và kết quả có kiểm soát

| Biến thể ở biên runner | Kết quả API phải quan sát |
|---|---|
| Subject sạch đủ 18 ca, hai log thật | `PASS / tests-passed`, total=passed=18, incomplete=0. |
| Đổi ID `DATA-T1-LOCAL` trong TAP đã chụp | `FAIL / missing-test-ids`, nêu đúng ID. |
| Một ca ACK bị thiếu nhưng vẫn còn ID nhóm | API trả `PASS` với 17 ca; `assertInventory` riêng từ chối. Đây là gap runner, chưa được sửa. |
| Lặp tên ca ACK thay ca ACK khác, vẫn 18 ca | API trả `PASS`; `assertInventory` riêng từ chối danh mục sai. |
| Tệp zero, ca skip hoặc todo, child exit 0 | `FAIL / incomplete-tests`. |
| Assertion sai có nhãn và child exit 7 riêng | `FAIL / exit-code`; giữ assertion và stderr byte thực. |
| TAP bị cắt hoặc `# tests` đổi format | `BLOCKED / invalid-report`. |
| Report thiếu/hỏng hoặc đã tồn tại | `BLOCKED / invalid-report` hoặc `stale-report`, không ghi đè report cũ. |
| Evidence khác commit, log đổi byte, artifact mất | `verifyReleaseInputs.ok=false`; control sạch cùng commit/hash phải true. |

Node TAP chuyển stderr trong test worker thành diagnostic trên stdout. Vì vậy
meta kiểm log stderr riêng bằng child trực tiếp có exit 7, tránh giả định nhầm
đường ra của Node test runner.

## Mutant sản phẩm và assertion đỏ

| Nhãn | Thay đổi tạm | Ca chính và assertion phải đỏ | Ca sạch sau khôi phục |
|---|---|---|---|
| `MUT-ACK-EARLY` | Bridge ACK applied trước `await applyCommand`. | `DATA-T1-ACK bridge giữ pending`: `Gửi thành công không phải ACK`. | 1/1 |
| `MUT-ACK-NO-DEQUEUE` | Bỏ guard `command.delivered` trước ACK. | `DATA-T1-ACK chưa dequeue`: `ACK giả trước dequeue không được applied`. | 1/1 |
| `MUT-DEQUEUE-REPLAY` | Dequeue không lọc command đã delivered. | `DATA-T1-ACK chưa dequeue`: `Dequeue không phát cùng command hai lần`. | 1/1 |
| `MUT-TX-EVENT-EARLY` | Broadcast metadata ngay trong operation trước complete. | `DATA-T1-TRANSACTION writer`: `Broadcast chỉ sau transaction.complete`, activeRw=1 thay 0. | 1/1 |
| `MUT-TX-RESOLVE-EARLY` | Resolve transaction ngay sau operation, trước complete. | `DATA-T1-TRANSACTION writer`: `Broadcast chỉ sau transaction.complete`, activeRw=1 thay 0. | 3/3 transaction |
| `MUT-RENEW-EPOCH` | Bỏ guard epoch/capability trước gán response renew. | Cả hai thứ tự stop/start: claim 1 thay 2 hoặc capability cũ còn ghi/poll/ACK. | 2/2 |

Cả sáu mutant phải có child exit **1**, `FAIL / exit-code`, `ERR_ASSERTION` và
thông điệp phân biệt phía trên. Thiếu entry, timeout hoặc crash hạ tầng không được
tính là mutant bị bắt. Các file `station-bridge.js`, `public-routes.js`,
`public-store.js` và suite chính đều phải giữ nguyên byte sau lượt chạy.

## Bằng chứng đã chạy

Vùng evidence nằm trong Git-ignored `work/smtf-agent/` của worktree này:

- `logs/data-t1-meta-clean-initial.log`: chạy trực tiếp đầu tiên 18/18 xanh.
- `meta/data-t1-nrNYim/primary-clean/`: lần clean qua runner có 17/18, callback
  rejected đọc cuối vẫn pending; child exit 1. Lần phát triển này cũng phát hiện
  lỗi guard của chính harness do Git blob LF/checkout CRLF và giả định stderr.
  Chưa ghi mutant sản phẩm ở lần đó. Các lỗi harness đã được sửa trong meta,
  không đổi primary. Không dùng lần đó làm bằng chứng red mutant.
- `meta/clean-callback-repro/`: ba lần ca callback hẹp đều 1/1 xanh, lưu root,
  HEAD và hash runtime trong `probe.json`.
- `meta/data-t1-MAOwWS/`: meta 15/15; baseline/full cuối đều 18/18, sáu mutant
  exit 1 đúng assertion, các ca sau khôi phục xanh. `restoration.json` ghi hash
  trước/sau từng file; `summary.json` ghi commands và hash stdout/stderr.
- `logs/data-t1-meta-second.stdout.log`: TAP ngoài đầy đủ 15/15; lớp PowerShell
  không lấy được ExitCode nên không dùng trường rỗng đó làm bằng chứng exit 0.
- `meta/final-wrapper/result.json` và `DATA-T1-META-FINAL.*.log`: lượt xác minh
  cuối qua `runCheck`, giữ exit/status, inventory 15 ID meta và log UTF-8.

## Finding còn mở, không suy thành kết luận sản phẩm

1. **Async wait trong môi trường Playwright hiện tại có giả định sai.** Phiên bản
   `1.61.0-alpha-1778188671000`, Node `v24.18.1`, đúng Chromium trong brief:
   `waitForFunction(async () => { ++runs; await delay(25); return runs >= 3; })`
   trả handle có `jsonValue() === false` sau 49 ms, chỉ gọi một lần. Predicate sync
   tương đương gọi ba lần và trả true. Repro ở
   `meta/probe-async-wait.mjs`, kết quả `meta/clean-callback-repro/async-wait.json`.
   Source cài tại `playwright-core/lib/coreBundle.js:17018` dùng
   `const success = predicate(); if (success) fulfill(success)`: Promise truthy
   dừng poll rồi assimilate false. Primary có async predicate chờ applied/rejected;
   tác giả test cần xử lý ở brief sửa được cấp. Điều này giải thích phù hợp lần
   17/18, nhưng log lịch sử không ghi giá trị handle nên không khẳng định đã đo
   chính lần đó, cũng không suy có datastore rollback. Giữ finding cho reviewer.
2. **Runner chưa khóa đủ từng ca trong nhóm.** `requiredCases` dùng tập ID nhóm,
   không phát hiện mất/lặp một ca có cùng ID nếu còn ca khác trong nhóm. Meta mới
   tự bảo vệ bằng so đủ 18 tên và thử thiếu/lặp, chưa sửa API runner hay gate.
   Việc nâng cổng chung thuộc coordinator. Entry meta là lệnh riêng; không suy
   `--profile ci` đã gọi suite DATA-T1 hoặc suite meta này.
3. **Nhánh stale-report trả hai tên log không có file.** API chặn trước khi spawn,
   nên result khai báo stdout/stderr nhưng chưa tạo chúng. Meta xác nhận report
   cũ không bị ghi đè và lưu result, không coi hai tên đó là artifact tồn tại.
4. Chưa thay CI/release tích hợp, Docker restart với volume, browser QA cảnh 3D,
   GPU/camera hoặc DATA-T2. `DATA-01`, `USER-01`, `DOCKER-01` vẫn cần nghiệm thu
   đầy đủ. Lead phải chạy lại trên SHA ghép cuối; SHA chứa commit meta chỉ bổ sung
   suite/tài liệu, không thay SHA sản phẩm đã kiểm nêu ở đầu báo cáo.

## Tái hiện

Từ gốc worktree kiểm riêng, cung cấp `PW_MODULE`, `PW_CHROME`,
`HARDTEST_PYTHON` theo môi trường trong brief; không tự cài dependency:

```powershell
node --test --test-reporter=tap scripts/hardtest/data/data-t1-meta.test.mjs
node scripts/agent/preflight.mjs --task CORE-DATA-T1-META-00 --role meta --verify --result work/smtf-agent/results/CORE-DATA-T1-META-00.meta.json
```

Khi bàn giao, chỉ stage hai file meta. Không stage bản backup, mutant, log, receipt
hoặc result. Coordinator giữ ledger, số vòng sửa và quyết định tích hợp/phát hành.

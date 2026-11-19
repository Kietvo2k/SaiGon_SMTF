# DATA-T1 — suite hardtest độc lập

Task gốc: `CORE-DATA-T1-TEST-SCOPE-00`, vai trò `hardtest`, vòng `0/2`.
Brief này thay `CORE-DATA-T1-TEST-00` trước khi ghi test; không reset số vòng.
SHA nền và receipt `startSha`: `3c9dac9fee352ba8c7ed0e104ee13715ad6439eb`.
Hợp đồng giữ nguyên `public-demo-v1`.

## Căn cứ và phạm vi oracle

Oracle lấy từ `PUBLIC-DEMO-SPEC.md`, `CONTRACT-PUBLIC-DEMO.md`, mẫu
`fixtures/public-demo-v1.json`, ma trận route/quyền HTTP hiện hữu và seam station
điều phối viên chốt trước khi viết ca station. Test không nhập helper tính toán,
phân quyền, lưu trữ hay command của sản phẩm để suy expected. Các payload snapshot
do test tạo độc lập; mẫu trong docs chỉ cung cấp tài khoản mẫu và shape.

Node gọi entry ES module qua Chromium thật, dùng IndexedDB/BroadcastChannel thật,
hai page cùng BrowserContext và BrowserContext riêng. HTTP/WS giả lập đứng ở biên
ngoài để quan sát path, query, bearer, lỗi và byte Blob. Một ca khác khởi động
FastAPI/Uvicorn thật với SQLite/thư mục tạm riêng rồi gọi qua adapter local.
Pytest dùng route FastAPI thật và khởi động tiến trình Python mới trên cùng SQLite
test để loại kết quả xanh giả do queue/ACK chỉ còn trong RAM.

## Seam station được chốt

| Biên | Hành vi đã chốt |
|---|---|
| `POST /api/v1/station/lease` | Body `{station_id, owner_id}`; trả `{station_id, owner_id, generation, expires_at, capability}`. Local claim dùng JWT station; public claim không dùng session người dùng. |
| `PUT`, `DELETE /api/v1/station/lease` | Renew/release cùng body, bearer là capability; lease 6 giây, vòng renew/poll 1 giây. |
| `GET /api/v1/station/commands/pending` | Trả `{commands}`; mỗi mục `{event, data, command_id, deadline_at}`. Dequeue một lần trong transaction, gắn owner/generation; không replay phần generation cũ đã nhận. |
| `POST /api/v1/station/heartbeat` | Có thể trả cùng queue; heartbeat/telemetry capability phải được fence. JWT station local cũ chỉ giữ telemetry/violation tương thích. |
| `POST /api/v1/station/commands/{id}/ack` | Body `{status, applied_t_sim?, reason_code?}`, bearer capability. Không ACK applied trước dequeue, từ sai generation hoặc sau deadline. Terminal bất biến. |
| `POST /api/v1/station/snapshot` | Body `{snapshot}`, bearer capability. JWT người dùng/legacy station không thay được capability. |
| `createStationBridge` | Nhận `{transport, stationId, applyCommand, readSnapshot}`; `start/stop`. Callback async một lần, chỉ ACK sau callback; WS chỉ đánh thức poll. |

Deadline command là 10 giây thực. Ca expiry chờ hơn 10 giây bằng đồng hồ Node/Python,
không tăng `t_sim` và không thay `Date` của sản phẩm. Riêng ca hết phiên auth đổi
`Date.now` để đi qua TTL phiên, không dùng làm bằng chứng deadline command.

## Ma trận yêu cầu → ca kiểm

| Requirement | Ca chính | Điều kiện phân biệt lỗi |
|---|---|---|
| DATA-01 | `DATA-T1-TRANSPORT` | Thiếu adapter, factory không mode, path/query hoặc bearer sai; ApiError khác identity, media không Blob, bỏ AbortSignal, kết nối loopback trong public. |
| DATA-01, USER-01 | `DATA-T1-AUTH` | Token bị sửa, role giả trong body, token đã logout/disable/expiry vẫn đọc hoặc ghi; bốn role mẫu phải `me` đúng phiên. |
| DATA-01 | `DATA-T1-TRANSACTION` | Abort thật từ `IDBRequest.success` trước complete: không command/audit/event thành công; quota trả 503 và giữ command/phiên cũ. |
| DATA-01 | `DATA-T1-TRANSACTION writer chưa subscribe` | Writer chưa mở subscription vẫn thông báo sang tab đọc; `BroadcastChannel.postMessage` chỉ khi không còn transaction readwrite, payload ảnh không đi trong event. |
| DATA-01 | `DATA-T1-LEASE` | Hai claim đồng thời chỉ một thắng; renew/release/takeover tăng generation; capability cũ không ACK/ghi snapshot/KPI/frame/heat/violation. |
| DATA-01, USER-01 | `DATA-T1-ACK` | Callback chưa xong giữ pending; applied đúng `applied_t_sim`, callback rejected có reason; retry không apply/event hai lần; ACK trước dequeue không thành công. |
| DATA-01, USER-01 | `DATA-T1-EXPIRY` | Đóng tab phát, chờ 10,4 giây thực, reload/takeover; status expired bền, late ACK không hồi sinh, ID retry trả terminal cũ. |
| DATA-01 | `DATA-T1-PROFILE` | Hai tab cùng kho thấy cùng session/command/snapshot; context khác không thấy token, command hoặc trạng thái station của A. |
| DATA-01, USER-01, DOCKER-01 | `DATA-T1-LOCAL`, `test_public_demo_commands.py` | Pending không đổi override; permission trước write; ACK sau dequeue; không replay generation cũ; queue/ACK bền qua tiến trình Python mới; deadline được kiểm ngay tại ACK/dequeue. |
| DATA-01, DOCKER-01 | `test_public_demo_snapshot.py` | Snapshot đủ shape, revision tăng và bền, quyền đọc/ghi; stale capability không đổi revision/simulation/heat. |
| USER-01, DOCKER-01 | Bốn file hồi quy được mở scope | Giữ ca quyền, validation, audit, shape và WS; ca thành công thêm claim → pending → dequeue → ACK tường minh. Không autouse lease. |

`tests/public_demo_helpers.py` chỉ điều phối HTTP cho test. Helper không được gọi
trong ca missing-station, không tự gắn lease vào fixture `client` và không tự sửa
expected theo output sản phẩm.

## Lệnh tái hiện

Từ gốc worktree đã ghép code và test:

```powershell
node --test --test-reporter=tap scripts/hardtest/data/data-t1.test.mjs
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
& '<python-của-môi-trường-brief>' -B -m pytest outputs/smart-traffic/backend/tests/test_public_demo_commands.py outputs/smart-traffic/backend/tests/test_public_demo_snapshot.py -q
& '<python-của-môi-trường-brief>' -B -m pytest outputs/smart-traffic/backend/tests -q
node scripts/hardtest/run.mjs --profile ci
```

Node dùng `PW_MODULE`, `PW_CHROME` nếu cấu hình; mặc định là các bản đã có của
môi trường brief. Ca FastAPI nhận `HARDTEST_PYTHON`, sau đó tìm `.venv311` của
worktree/repo chung; không tự cài dependency. `DATA_T1_ROOT` chỉ đổi thư mục sản
phẩm được serve/import trong probe phát triển; fixture/oracle giữ ở worktree test.
Output in root sản phẩm và HEAD. Probe trên tệp chưa commit không thay kết quả
nghiệm thu trên candidate SHA bất biến.

## Bằng chứng đỏ và trạng thái bàn giao

Các log ở `work/smtf-agent/logs/`, ngoài commit:

| Log | Kết quả đã quan sát |
|---|---|
| `data-t1-node-baseline-red.log` | Baseline SHA nền: Chromium khởi động được, 3 ca fail/0 skip ở assertion thiếu `traffic-transport.js`. |
| `data-t1-node-final-baseline-red.log` | Chạy lại suite cuối trước commit trên SHA nền: đủ 16 ca, 16 fail/0 skip ở assertion thiếu entry adapter; raw exit 1, wrapper kiểm đúng nguyên nhân exit 0. |
| `data-t1-pytest-baseline-red.log` | Baseline: 2 fail/0 skip. Lệnh thiếu trạm trả 200 thay 409; GET snapshot trả 404 thay 200. |
| `data-t1-pytest-full-baseline-red.log` | Chạy đủ hai file pytest mới trên SHA nền: 12 fail, 3 pass, 0 skip; fail ở HTTP assertion do lease/snapshot chưa có (404) và missing-station trả 200 thay 409. |
| `data-t1-pytest-final-baseline-red.log` | Chạy lại trước commit: 12 fail/3 pass, raw exit 1; wrapper đối chiếu đúng HTTP assertion exit 0. Không có lỗi thu thập hoặc ca skip. |
| `data-t1-pytest-collection.log` | Thu thập đủ 95 ca trong hai file mới và bốn file hồi quy, exit 0. Đây chỉ là kiểm thu thập, không phải 95 ca xanh. |
| `data-t1-pytest-final-collection.log` | Chạy lại trước commit: vẫn thu thập đủ 95 ca, exit 0. |
| `data-t1-node-development-probe-2.log` | Draft code worktree riêng: 14/15 xanh, 1 đỏ, 0 skip. Abort thật trả `InvalidStateError` thay `503 STORAGE_UNAVAILABLE`; đã gửi repro cho code, giữ nguyên assertion. |
| `data-t1-node-development-probe-3.log` | Draft code worktree riêng: 16/16 xanh, 0 fail/skip/cancel, exit 0; gồm adapter local gọi FastAPI/Uvicorn thật. HEAD sản phẩm vẫn là SHA nền nhưng tệp sản phẩm chưa commit, nên không phải nghiệm thu candidate SHA. |

Đây là checkpoint tác giả test, chưa phải kết luận sản phẩm đạt. Suite được mở rộng
sau log baseline để bao phủ cả HTTP FastAPI thật và các invariant nêu trên; phải
chạy lại toàn bộ trên candidate đã ghép. Điều phối viên giữ cổng CI/release, kiểm
meta/cross và số vòng sửa chung.

Phạm vi bàn giao gồm 16 ca Node, 15 ca pytest mới và cập nhật bốn file hồi quy
qua helper HTTP tường minh. Kiểm thu thập 95 ca bao gồm cả các ca hồi quy hiện hữu.

## Phần còn mở

- Chưa thay bằng chứng tích hợp, meta, cross, review hoặc browser-qa. Callback
  bridge trong suite là trạm kiểm soát ở biên, chưa chứng minh smart-app áp lệnh
  vào 3D thật; bước đó cần browser-qa/cross trên candidate.
- Chưa đo camera/GPU, SIM/AI hoặc đầy đủ nghiệp vụ DATA-T2. Mọi ca T1 xanh vẫn
  giữ `DATA-01`, `USER-01`, `DOCKER-01` mở.
- Persistence qua tiến trình Python mới không thay Docker restart bằng volume.
  Điều phối viên phụ trách build/compose smoke với project và volume test riêng;
  không suy kết quả Docker từ suite này. Thông tin daemon cũ trong brief không
  được dùng để tuyên bố bị chặn nếu môi trường đã thay đổi.
- Hồi quy 31A phải giữ hash `c05ce91e` qua cổng CI trên đúng candidate. Test này
  không sửa gate, CI, fixture chuẩn hay hợp đồng.

## Bổ sung CORE-DATA-T1-COPY-00

Task bổ sung giữ checkpoint DATA-T1 vòng `0/2`, chưa tạo candidate tích hợp lần đầu.
Nền và receipt `startSha`: `7c84a3e91c7150a53a908f4274ad5cad414dd2d6`.
Chỉ mở bốn tệp: `copy.test.ts`, suite Node DATA-T1, `test_m6c_controls.py` và báo cáo này.
Không thay report hoặc receipt của task gốc đã verify.

### Kiểm chữ hiển thị

Repro trên draft với test gốc trả `./api.ts: demo` và `./types.ts: demo` dù nguồn
chỉ dùng tên module/phiên bản kỹ thuật. Scanner vẫn giữ nguyên chín từ bị cấm và
glob cũ. TypeScript AST chỉ che đúng span literal trong ba ngữ cảnh:

1. Module specifier import/export bằng chính xác
   `../../../../shared/public-demo/traffic-transport.js`.
2. String literal type bằng chính xác `public-demo-v1`.
3. Giá trị fallback `public-demo-v1` trong `buildId: import.meta.env.VITE_BUILD_ID || ...`
   của options `{mode: 'public', ...}` truyền trực tiếp vào `createTrafficTransport`
   được named-import từ đúng module ở mục 1. Không miễn cả options hoặc dòng gọi.

28 ca copy gồm source scan hiện hữu và các ca phân biệt: chữ UI/comment/identifier
cùng dòng import/export vẫn bị bắt; chuỗi thường, `textContent`, type phiên bản khác,
module khác, `buildId` ngoài factory và property `label` không được miễn. Cả chín từ
bị cấm vẫn bị bắt trong TSX/CSS/HTML. Không bỏ tệp, dòng hoặc thay literal sản phẩm.

### Bridge và hồi quy backend

Hai ca Node bổ sung dựng transport ở biên độc lập: giữ response PUT renew,
stop/release rồi trả response cũ trước hoặc sau lần start mới. Oracle yêu cầu hai
lần claim, chỉ callback/ACK command ở lifecycle mới với capability thế hệ 2;
capability cũ không còn poll/ghi/ACK sau stop. Suite hiện có tổng cộng 18 ca Node.
Transport không nhập probe hoặc helper sản phẩm làm expected.

Không còn snapshot byte của bridge trước fix epoch nên không thể tái lập lịch sử đỏ
cho riêng race này. Ca xanh trên draft không chứng minh khả năng bắt mutant; meta cần
dựng biến thể lỗi có nhãn ở worktree riêng, bỏ epoch guard trước gán lease để kiểm.
Missing-entry baseline không được dùng làm bằng chứng đỏ của race.

Hook `app.routers.officer.broadcast` cũ bỏ lỡ command khi service phát qua biên WS
chung; repro fail `StopIteration` ngay ở tìm `cmd.scenario`. Chỉ chuyển hook sang
`app.ws.broadcast`, giữ nguyên expected event, params, `to_roles=['station']`, state,
quyền và các assertion audit/payload trong toàn bộ tệp. Không thêm tham số test vào
broadcaster sản phẩm hoặc đổi expected nghiệp vụ theo code.

### Evidence bổ sung

Các log tiếp tục ở `work/smtf-agent/logs/`, ngoài commit:

| Log | Kết quả |
|---|---|
| `data-t1-copy-original-red.log` | Test copy gốc trên draft: 1 fail tại api/types, đúng false positive kỹ thuật. |
| `data-t1-copy-ast-green-2.log` | 28/28 ca copy xanh, exit 0. |
| `data-t1-copy-draft-sources-green.log` | Chạy chính helper scanner mới trên api/types thật của draft: cả hai trả `[]`. Probe trích helper từ AST test, không sửa nguồn sản phẩm. |
| `data-t1-copy-forbidden-ui-red.log` | Thêm `document.body.textContent = 'public-demo-v1'` vào đầu vào trong bộ nhớ: assertion policy đỏ với `demo`, raw exit 1. Không ghi mutant vào sản phẩm. |
| `data-t1-copy-web-full-green.log` | Web worktree test: 13 file, 91/91 ca xanh, exit 0. |
| `data-t1-copy-typecheck.log` | TypeScript worktree test exit 0. |
| `data-t1-copy-m6c-original-red.log` | Test emergency-kind cũ trên app draft: 1 fail tại `StopIteration` do hook lệch biên. |
| `data-t1-copy-m6c-green.log` | Cả tệp M6c mới trên app draft: 15/15 xanh, exit 0, giữ assertion nghiệp vụ. |
| `data-t1-copy-bridge-probe.log` | Ca stop/start độc lập: 1/1 xanh, 0 skip/cancel, exit 0 trên draft. Chưa có red mutant cho race. |
| `data-t1-copy-node-full-final-probe.log` | Toàn suite Node cuối: 18/18 xanh, 0 fail/skip/cancel, exit 0; gồm hai thứ tự response renew cũ trước/sau start mới. |

Probe M6c nạp package `app` từ draft, package test và fixture từ worktree test, không
chép hoặc sửa file sản phẩm. Toàn bộ xanh draft cần chạy lại trên candidate đã ghép;
chưa thay kiểm CI/release, meta/cross, Docker hoặc browser-qa/3D thật.

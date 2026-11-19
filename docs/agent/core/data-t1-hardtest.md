# DATA-T1 — suite hardtest độc lập

Task hiện hành: `CORE-DATA-T1-TEST-SCOPE-00`, vai trò `hardtest`, vòng `0/2`.
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

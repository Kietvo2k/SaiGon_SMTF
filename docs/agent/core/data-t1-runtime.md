# DATA-T1: transport, phiên và vòng đời trạm

Phạm vi checkpoint `CORE-DATA-T1-CODE-SCOPE-00`, hợp đồng `public-demo-v1`, vòng 0.
T1 bổ sung nền tảng thực thi và điểm ghép; chưa đóng toàn bộ `DATA-01`, `USER-01`
hoặc `DOCKER-01`. Kết quả trên commit tích hợp, suite độc lập và cổng phát hành
do điều phối viên xác minh.

## Điểm ghép

Entry dùng chung là `outputs/shared/public-demo/traffic-transport.js`, đi kèm
khai báo TypeScript. Cả local và public giữ ba phương thức `request`, `subscribe`,
`readMedia`; factory yêu cầu chọn `mode` tường minh. `ApiError` chỉ có một class
identity, được `web/src/lib/api.ts` tái xuất cùng các factory và
`getTrafficTransport()`. Các export local cũ vẫn còn.

Web chọn `VITE_TRANSPORT_MODE=local|public`; dev chưa cấu hình dùng local.
Docker khai báo local. Bản public cần đặt public cùng `VITE_BUILD_ID` khi build.
Public request không gọi `fetch` hoặc mở WebSocket local. `readMedia` trả `Blob`,
nhận `AbortSignal`; caller sở hữu object URL. Adapter local giữ đường dẫn,
query, bearer, multipart, lỗi API và tín hiệu hủy qua HTTP.

Trạm 3D nhận `mode` trong `installStation32`, hoặc `?transport=local|public`,
hoặc `globalThis.SMtfTransportMode`. Nếu không có cấu hình, loopback dùng local,
host khác dùng public. `SMtfBuildId` xác định build của trạm. Kiểm trực tiếp bằng
`webgpu-materials-24.html?app=smart&region=bac&transport=public&mode=lite&backend=webgl`.
Entry redirect `index.html` hiện không giữ query `transport`; phần entry/đóng
gói ngoài phạm vi T1 cần giữ cấu hình mode của bản phát hành.

## Kho public và phân quyền

IndexedDB `smtf-public-demo-v1` dùng chung theo origin/browser profile và schema,
không tách kho theo tab hoặc build ID. Hai browser context/profile độc lập có
kho riêng. Bốn tài khoản mẫu nằm trong `sample-seed.js`; chúng không được nhập
từ fixture của bộ kiểm. Lần seed đầu là giao dịch nguyên tử.

Token phiên là chuỗi opaque tra trong store `sessions`. Mỗi request kiểm phiên
hết hạn, tài khoản còn active và role hiện tại; role trong body không cấp quyền.
Logout xóa phiên. Thay active/role tài khoản cán bộ thu hồi phiên liên quan.
Thời hạn phiên mẫu là 30 phút. Đây là môi trường mẫu trong trình duyệt, không
phải cơ chế xác thực máy chủ cho dữ liệu thật.

Các store nghiệp vụ, media Blob, audit, dedup command, revision và event cùng
nằm trong transaction readwrite. Promise mutation và notification thành công
chỉ hoàn tất sau `transaction.complete`. Abort/quota/denied không phát event
thành công; lỗi kho trả `503 STORAGE_UNAVAILABLE`. Chỉ hủy bằng AbortSignal của
caller giữ tên `AbortError`.

BroadcastChannel chỉ mang ID event đã commit; subscriber đọc event từ kho rồi
kiểm quyền hiện tại. Unsubscribe idempotent. Channel không thay datastore;
caller cần đọc snapshot khi focus lại hoặc mất seq. Không có đảm bảo lưu event
vô hạn: chính sách dọn lịch sử/quota dài hạn còn thuộc lát dữ liệu tiếp theo.

## Giao thức station nội bộ

Các đường dẫn dưới đây cùng prefix `/api/v1`. Capability được truyền ở
`RequestInput.token`, hoặc `Authorization: Bearer ...` ở local.

| Route | Body / kết quả chính |
|---|---|
| `POST /station/lease` | `{station_id,owner_id}` → `{station_id,owner_id,generation,expires_at,capability}` |
| `PUT /station/lease` | Gia hạn capability hiện tại; kết quả cùng shape lease |
| `DELETE /station/lease` | Thu hồi capability; `{ok:true}` |
| `GET /station/commands/pending` | `{commands:[{command_id,deadline_at,event,data}]}` |
| `POST /station/commands/{id}/ack` | `{status:'applied',applied_t_sim}` hoặc `{status:'rejected',reason_code}` |
| `POST /station/snapshot` | `{snapshot}` từ callback đọc runtime thật |
| `GET /officer/commands/{id}` | `{command_id,status,reason_code,applied_t_sim}` |
| `GET /officer/snapshot` | Snapshot v1, revision, build, trạng thái trạm và dữ liệu đã nhận |

Lease dài 6 giây, bridge renew/poll và gửi snapshot mỗi 1 giây theo wall clock.
`expires_at` và `deadline_at` trên wire là ISO UTC. Claim local cần JWT tài khoản
role station; sau đó bridge dùng capability. Public claim là seam nội bộ của
trạm trong kho mẫu cùng profile. Các route station cũ vẫn nhận JWT local để giữ
hồi quy telemetry/violation; commands và snapshot v1 bắt buộc capability.

Claim/takeover, kiểm fencing và write dùng cùng transaction. SQLite dùng
`BEGIN IMMEDIATE`; public dùng transaction IndexedDB chung scope. Mỗi write
trạm kiểm lại capability/expiry trong chính transaction, gồm metrics, heat,
violation, bằng chứng và frame. Heat kiểm cả nhịp chưa đến cửa sổ lưu lịch sử.
Local WS cũng kiểm capability trước inbound/outbound của trạm.

Thiếu lease còn hiệu lực thì controls/VMS trả `409 STATION_UNAVAILABLE` ở cả
hai mode, không tạo command/audit/event thành công. Có trạm thì enqueue trả
`pending`. Dequeue đánh dấu delivered trong transaction trước callback. Lệnh
đã giao cho generation cũ không replay khi takeover; trạng thái giữ pending
đến deadline vì chưa biết outcome.

Deadline command là 10 giây wall clock, kiểm khi dequeue, đọc command và ACK.
ACK chưa dequeue bị từ chối. Sai capability/generation không thể tạo applied.
Terminal `applied`, `rejected`, `expired` bất biến. Retry cùng command ID kiểm
actor, route và canonical payload, trả kết quả bền vững cũ; payload khác trả409.
Đọc command dùng quyền reader chung officer/commander/admin như route local.

WS `cmd.*` giữ payload nghiệp vụ và thêm `command_id`, chỉ đánh thức polling.
Audit enqueue giữ đích entity cũ (node/scenario/VMS), có `command_id` và
`status:pending`; ACK terminal có audit riêng cho command. Dữ liệu và audit
commit xong mới publish.

## Áp lệnh và snapshot từ lõi

`station-bridge.js` có API nội bộ `{start,stop}` và một callback async
`applyCommand`. Capability nằm trong WeakMap nội bộ, không thêm method lên
TrafficTransport. Bridge ACK sau callback, đồng thời kiểm epoch, lease và
deadline trước/sau callback. Response renew cũ không được làm sống lại lease
sau stop/start; job cũ cũng không được xóa trạng thái job của lần start mới.

`smart-app-32.js` nối callback duy nhất vào controller/scenario/VMS thật.
`kpi-panel-32.js` không áp cùng command lần hai. `setMode` nhận thiết lập vào
controller; chuyển pha an toàn vẫn do controller hiện hữu quản lý.
`applied_t_sim` lấy từ counter sim sau callback, không lấy timestamp HTTP.

Snapshot đọc controller, counter sim, junction state và metadata frame capture
đã gửi thành công. Chưa có frame thì camera là missing; mất lease thành stale.
Không dùng respawn làm trips_completed. T1 để routes rỗng và counter chưa có ở
lõi bằng0; định tuyến đích/KPI đầy đủ thuộc lát SIM tiếp theo.

## Kiểm và phần việc tiếp theo

Các lệnh có thể chạy từ repo/worktree đã cài dependency:

```powershell
node scripts/agent/preflight.mjs --task CORE-DATA-T1-CODE-SCOPE-00 --role code
node --check outputs/shared/public-demo/station-bridge.js
node --test outputs/hcmc-poc/test/station-client-32.test.mjs
node --test outputs/hcmc-poc/test/sim-state-32.test.mjs
cd outputs/smart-traffic/web
npm run typecheck
npm run build
npm test
```

Probe phát triển và log nằm ở vùng ignored `work/smtf-agent/`, không thay bộ
kiểm độc lập. Probe bridge đã bắt ca renew về sau stop/start (claims1 thay vì2)
rồi xanh sau sửa; không giữ snapshot file trước sửa nên phép chứng minh mutant
độc lập cần do meta thực hiện. Các test backend cũ gọi controls thiếu station
setup phải được tác giả test bổ sung claim/dequeue/ACK, đồng thời giữ oracle
quyền, validation, payload WS và audit entity. Test copy không nên coi đường
dẫn module `public-demo` hoặc version hợp đồng là chữ trên giao diện.

T1 chưa bao phủ mọi public route: citizen lookup/thanh toán/khiếu nại/thông báo,
quy trình xử lý hồ sơ, đầy đủ filter/pagination/admin semantics, VMS/heat read và
các luồng UI cần lát DATA tiếp theo. Route chưa hiện thực trả `NOT_FOUND`, không
fallback fixture hoặc local. AI thật, camera mới, định tuyến và tối ưu mô phỏng,
đóng gói public, hiệu năng dài hạn và release gate vẫn mở.

Dockerfile và dockerignore đã đưa module shared vào cả Vite build và cây phục
vụ 3D. Docker persistence chỉ đạt khi build/smoke/restart đúng candidate với
project/volume kiểm riêng; T1 code không tự kết luận PASS từ việc sửa Dockerfile.
Điều phối viên ghép commit code/test, chạy `--profile ci`, kiểm chéo/meta/review
và browser QA đúng SHA trước nghiệm thu; `--profile release` còn là cổng riêng.

### Bằng chứng phát triển khi bàn giao vòng 0

| Kiểm | Kết quả quan sát |
|---|---|
| Scope 25 file, `git diff --check`, Node syntax và Python compileall | Exit0 |
| Web typecheck/build | Exit0 |
| Web test trên test cũ của worktree code | 63 xanh, 1 đỏ ở `copy.test.ts` do literal kỹ thuật nêu trên |
| Node toàn bộ lần đầu | 264 xanh, 1 đỏ do đổi heartbeat legacy thành1; đã trả15, chạy riêng station-client 23/23 xanh |
| Node sim-state sau sửa | 5/5 xanh, hash31A `c05ce91e` |
| Backend hồi quy không gồm controls/integration cũ | 152 xanh, 4 đỏ do gọi control không có lease/ACK; đã gửi tác giả test |
| Probe local lifecycle sau sửa payload/audit | Exit0: missing409, claim, pending, ACK sớm409, dequeue1lần, applied, WS payload, audit entity, state, snapshot, stale capability403 |
| Probe bridge stop/start sau sửa | Exit0; giới hạn evidence đỏ trước sửa đã nêu ở trên |
| Chromium actual scene Lite/WebGL2 | Chưa đạt: control page cùng profile đọc được snapshot nhưng station còn missing ở assertion đầu sau core ready; không có pageerror hoặc request API local trong log; có warning registry density |

Các probe trình duyệt trước đó còn bị destroy execution context/watchdog khi
chạy API ngay trong scene nặng. Cần browser QA độc lập trên candidate: chờ/poll
trạm active, kiểm callback thật và chụp cảnh. Đây là mục chưa xác minh, không
được đổi thành PASS từ kết quả adapter trong trang trống. Raw probe/log nằm ở
`work/smtf-agent/probe-runtime-browser.mjs` và
`work/smtf-agent/logs/data-t1-runtime-public.json` của worktree code. Gate CI và
Docker smoke trên candidate ghép vẫn thuộc bàn giao kế tiếp của điều phối viên.

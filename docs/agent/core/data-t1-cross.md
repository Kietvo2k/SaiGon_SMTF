# DATA-T1: kiểm chéo độc lập vòng 0

Task `CORE-DATA-T1-CROSS-00`, vai trò `cross`, hợp đồng `public-demo-v1`.
Ứng viên sản phẩm: `6e742ec3306e685b8f9496236c9fad435bc5d47f`.
Worktree `bd34`, nhánh `codex/core-data-t1-cross`. Chưa dùng vòng sửa 1 hoặc 2.

**Kết quả: FAILED.** Lần chạy đầy đủ có 7 test, 5 đạt, 2 lỗi, không skip,
không hủy; exit code 1. Hai lỗi nằm trong snapshot từ smart-app thật.
Không sửa sản phẩm, suite chính, fixture hợp đồng hoặc ngưỡng để làm xanh.

## Nguồn oracle và tính độc lập

Đã đọc AGENTS, RULES, HANDOFF, PUBLIC-DEMO-SPEC, CONTRACT-PUBLIC-DEMO,
fixture `public-demo-v1.json`, brief và `data-t1-runtime.md` trước khi kiểm.
Preflight thành công, receipt SHA-256:
`04b0de8469f0a5bd4bbda85a794642f99ecf69ad090c743a36d068058b69715a`.

Suite `scripts/hardtest/data/data-t1-cross.test.mjs` chỉ import factory transport
của sản phẩm để gọi biên công khai. Không đọc/import suite chính, test helper,
helper tính expected hoặc callback stub. Expected tự xác định như sau:

- Trước ACK, HTTP thành công chỉ là `pending`; không có `applied_t_sim` và
  chưa thay trạng thái đã áp dụng. ACK trước dequeue phải lỗi. Retry cùng ID
  và payload không tạo thêm lệnh/audit; payload khác phải 409.
- Một lease còn sống chặn tab thứ hai. Capability/generation cũ không ACK được
  sau takeover; lệnh đã giao không replay. Deadline 10 giây theo wall clock
  được đo bằng chờ thật 5,2 + 5,1 giây và renew lease ở giữa.
- Giao dịch quota lỗi phải rollback cả command/audit/event; thử lại cùng ID
  sau đó phải thành công. BroadcastChannel chỉ mang ID đã commit.
- Snapshot phải đọc mode/scenario/counter/override thật. `applied_t_sim` nằm
  giữa hai lần đọc counter sim bao quanh callback. Chuyển nhóm đối nghịch phải
  qua vàng 3 giây và đỏ chung 2 giây; không được hai nhóm cùng xanh.
- `simulation.seed` là số nguyên để tái hiện phiên; mỗi `camera.junction_id`
  phải thuộc tập `junctions[].junction_id`, theo định nghĩa cụm logic trong
  hợp đồng mục 1 và 3. Không tự tạo bảng camera dựa theo output lỗi.

Input khác mẫu hợp đồng: API ghi đè `HX-03`, group 1, duration 19 giây;
runtime ghi đè `HX-04`, duration 23 giây; kịch bản `flood-nhc`; bảng `VMS-04`
với nội dung “Đi chậm qua nút giao”. Mẫu hợp đồng dùng `lane-block`/`HX-C1`.

## Truy vết và kết quả

| Requirement | Test ID độc lập | Kết quả vòng 0 |
|---|---|---|
| DATA-01, USER-01 | CROSS-DATA-T1-PUBLIC | PASS: vai trò, thiếu trạm, lease độc quyền, pending, ACK sớm, dedup, terminal bất biến, fencing, deadline thật |
| DATA-01, USER-01 | CROSS-DATA-T1-ATOMIC | PASS: quota abort giữa command và audit, không event thành công, retry, metadata BroadcastChannel, chung origin/khác build, tách profile, đổi role/logout thu hồi phiên |
| DATA-01, USER-01, DOCKER-01 phần API | CROSS-DATA-T1-LOCAL | PASS: lifecycle tương đương qua local transport, HTTP FastAPI và SQLite riêng |
| DATA-01, USER-01 phần T1 | CROSS-DATA-T1-RUNTIME | PASS: callback nối controller/sim/scenario/VMS thật, clearance an toàn, snapshot, JPEG Blob thật và AbortSignal |
| DATA-01, snapshot v1 | CROSS-DATA-T1-SEED | FAIL: `simulation.seed=null` |
| DATA-01, snapshot v1 | CROSS-DATA-T1-CAMERA-ID | FAIL: cả 10 camera dùng node ID thay ID cụm logic |
| DATA-01 | CROSS-DATA-T1-ORACLE-RED | PASS: oracle từ chối phản hồi bị đổi thành applied trước ACK |

## Hai lỗi trên ứng viên sạch

### CROSS-01: snapshot không giữ seed thực thi

Sau khi trạm `active`, đã thực sự áp mode `fixed` và scenario `flood-nhc`,
snapshot trả `simulation.seed: null`. Assertion yêu cầu seed nguyên bị lỗi.
Đây là thiếu định danh để tái hiện phiên, không phải yêu cầu giả lập SIM-T2.
Điểm nối quan sát: `readStationSnapshot32` trong `smart-app-32.js`.

### CROSS-02: camera tham chiếu ID nút thay ID cụm

Snapshot có năm cụm `HX-C1` đến `HX-C5`, nhưng camera dùng `HX-01` đến `HX-06`.
Ví dụ `CAM-HX-002.junction_id = HX-06` trong khi node `HX-06` thuộc `HX-C5`.
Cả 10 camera không nằm trong tập ID cụm của snapshot. Điều này phá khóa nối
camera/bản đồ/đèn theo hợp đồng. Không sửa expected thành node ID.

Repro nhỏ cho cả hai lỗi, có scene và callback thật:

```powershell
node --test --test-name-pattern 'CROSS-DATA-T1-(RUNTIME|SEED|CAMERA-ID):' scripts/hardtest/data/data-t1-cross.test.mjs
```

## Thực thi và dấu vết

Lệnh đầy đủ đã chạy:

```powershell
node --check scripts/hardtest/data/data-t1-cross.test.mjs
node --test scripts/hardtest/data/data-t1-cross.test.mjs
```

Kết quả cú pháp exit 0; test đầy đủ exit 1, 7 test, 5 PASS/2 FAIL,
60.464 giây. Raw log: `work/smtf-agent/data-t1-cross-final.log`.
Evidence đúng SHA ứng viên tại `work/smtf-agent/data-t1-cross/`:

- `evidence.json`: API outputs, audit, timeline, GPU, counter, ACK, pha và snapshot.
- `local-init.log`, `local-api.log`: DB/HTTP FastAPI với `SMART_VAR_DIR`/DB mới.
- `runtime-trace.zip`: trace Chromium, snapshot DOM và ảnh.
- `runtime-scene.png`, `runtime-final.png`: ảnh tại lúc kết thúc kiểm runtime.

Chromium dùng GPU mặc định, renderer thực tế:
`ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
Lần cuối trạm active và t_sim > 0 sau 18,761 giây. ACK mode/scenario/override/VMS
lần lượt tại t_sim 4,7 / 6,2 / 8,2 / 14,1 giây. Với override đối nghịch,
quan sát vàng tại 8,7; đỏ chung tại 11,6; nhóm đích xanh tại 13,3 giây.
Blob camera thật có MIME `image/jpeg`, 61.346 byte, đầu `FF D8`; signal hủy
trả `AbortError`. Không có `pageerror` hoặc request API/WebSocket local trong
scene public. Console còn warning registry density, được giữ nguyên trong log.

Ảnh kết thúc vẫn hiện màn hình nạp pipeline. Vì vậy kết quả runtime ở đây
chứng minh controller/sim/bridge/callback hoạt động, chưa chứng minh hoàn tất
luồng nhìn thấy cảnh 3D. Browser QA riêng phải kiểm readiness trực quan.

Probe độc lập trước suite, ở `work/smtf-agent/cross-runtime-probe-gpu/`,
giữ `evidence.json`, `cpu.json`, `trace.zip`, `scene.png`. Nó thấy core-ready
trước khi signals/capture/transport lắp xong và station active sau khoảng
24,7 giây. `missing` ngay sau core-ready là timing trong cấu hình GPU này,
không được ghi thành lỗi lease. Probe ép SwiftShader trước đó bị stall, đã
dừng browser riêng; không dùng nó làm bằng chứng PERF hoặc lỗi sản phẩm.

Lần đầu harness static server trả 404 do kiểm path Windows có dấu phân cách
cuối bị lặp. Chỉ sửa harness trong phạm vi; lỗi hạ tầng này không tính lỗi
sản phẩm hay vòng sửa. Các kết quả nêu trên lấy từ lần chạy sau sửa harness.

## Ca đỏ có kiểm soát

Sau lần sạch đã chạy riêng:

```powershell
$env:SMTF_CROSS_FAULT='premature-applied'
$env:SMTF_CROSS_OUTPUT='work/smtf-agent/data-t1-cross-negative'
node --test --test-name-pattern '^CROSS-DATA-T1-PUBLIC:' scripts/hardtest/data/data-t1-cross.test.mjs
```

Chỉ sửa bản sao phản hồi transport vừa nhận ở biên ngoài: enqueue override
bị đổi thành `applied`, `applied_t_sim=999`. Không thay sản phẩm hoặc dựng
app giả. Kết quả exit 1, 1 test/1 fail đúng assertion
“HTTP thành công chỉ được pending trước ACK”, không có test skip.
Raw log `work/smtf-agent/data-t1-cross-negative.log` và evidence trong thư mục
cùng tên. Đây là phép thử oracle ở biên dây; không thay phép mutant sản phẩm
của vai trò meta. Khi chạy sạch, bỏ hai biến môi trường trên.

Đã chạy lại cùng ca PUBLIC trong một process sạch sau ca đỏ, output riêng
`work/smtf-agent/data-t1-cross-clean-after-negative/`: 1 test/1 PASS, không
skip, exit 0 (11,309 giây). Raw log
`work/smtf-agent/data-t1-cross-clean-after-negative.log`. Lần đầy đủ vẫn giữ
hai lỗi snapshot nêu trên; lần chạy tập trung này chỉ xác minh oracle đã trở
lại phản hồi thật. Hash artifact để đối chiếu nằm tại
`work/smtf-agent/data-t1-cross-artifacts.json`.

## Việc còn lại và bàn giao

- Điều phối viên gom hai lỗi snapshot với finding của meta/review trước khi
  cấp brief sửa 1. Không mở vòng con và không đổi hợp đồng tại nhánh cross.
- Chưa đóng toàn bộ DATA-01/USER-01: các nghiệp vụ hồ sơ công dân, AI, SIM-T2,
  hai tab scene thật, crash/recovery đầy đủ và browser QA vẫn còn mở.
- Local API/SQLite đã kiểm; chưa build/restart Docker với volume test,
  chưa chứng minh persistence qua restart container và chưa tự chạy lại hash
  31A trong vai trò này. Không kết luận DOCKER-01 PASS.
- Lead tích hợp test/docs, chạy lại trên SHA mới, cổng CI/release và browser QA.
  Log/evidence/JSON result nằm trong ignored `work/smtf-agent/`, không commit.

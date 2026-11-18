# Hợp đồng UI và lõi Public Demo v1

**Phiên bản:** `public-demo-v1`. Tất cả mẫu ở [public-demo-v1.json](fixtures/public-demo-v1.json). Mẫu có chủ đích để hai nhánh cùng phát triển. Kết quả nghiệm thu lấy từ ứng dụng và dữ liệu thực thi. Đặc tả nghiệp vụ và giới hạn ở [PUBLIC-DEMO-SPEC.md](PUBLIC-DEMO-SPEC.md).

## 1. Giao diện tại biên

```ts
type RequestInput = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
};

type EventEnvelope = { event: string; t: string; seq: number; data: unknown };

interface TrafficTransport {
  request<T>(input: RequestInput): Promise<T>;
  subscribe(listener: (message: EventEnvelope) => void, token?: string): () => void;
  readMedia(path: string, options?: { token?: string; signal?: AbortSignal }): Promise<Blob>;
}
```

- `path` gồm đường dẫn và query, luôn bắt đầu tại `/api/v1/`. Adapter cục bộ ghép origin tin cậy sẵn có, thêm bearer nếu route yêu cầu và nối `/ws/v1`. Adapter public ánh xạ route vào nghiệp vụ IndexedDB. Giữ `ApiError` với `status`, mã `code` và `message`; định dạng dây cục bộ vẫn là `{ error: { code, message, detail? } }`. `subscribe` trả hàm hủy idempotent. Sau khi nối lại, khi quay lại tab hoặc bỏ lỡ sự kiện, UI lấy snapshot mới từ nguồn dữ liệu. Sự kiện có `seq` tăng trong vòng đời nguồn hiện hành và `t` là giờ UTC dạng ISO 8601. Nếu nguồn reset, bỏ seq cũ và đồng bộ bằng snapshot.
- `readMedia` nhận đường dẫn ảnh do nghiệp vụ trả về, bao gồm `/api/v1/media/{id}` và `/api/v1/media/stream/{camera_id}`. UI tạo object URL rồi thu hồi khi thay Blob hoặc rời màn hình. `stream.updated` thông báo ID camera và seq, ảnh được lấy riêng. snapshot/camera trả `missing` nếu chưa có ảnh và `stale` nếu còn ảnh cũ. Public không fallback sang API cục bộ khi gặp lỗi.
- Trình duyệt dùng UTC cho dấu thời gian lưu trữ và hiển thị theo múi giờ demo `Asia/Ho_Chi_Minh`. `t_sim` tính bằng giây kể từ lúc chạy kịch bản. Tất cả chiều dài trong đồ thị là mét. ID là chuỗi ổn định, giá trị nullable phải hiện trạng thái tương ứng ở UI. `junction_id` là ID cụm logic. `node_id` là ID điểm điều khiển trong cụm, không dùng OSM ID hoặc số thứ tự mảng làm khóa UI.

## 2. Đối chiếu API và quyền

Đối chiếu route thật ở `outputs/smart-traffic/backend/app/main.py`, `app/routers/`, và kiểu đang dùng ở `outputs/smart-traffic/web/src/lib/types.ts`. Các đường dưới đây bỏ tiền tố `/api/v1` để dễ đọc. Mọi trường và quy tắc luồng hiện hữu được giữ trừ bổ sung nêu trong tài liệu này.

| Route và nghiệp vụ | Actor | Hợp đồng |
|---|---|---|
| `/public/lookup`, `/public/alerts` | Khách | Chuẩn hóa và truy vấn biển. Lookup trả `items`, `total`, chỉ trạng thái công khai. 422 cho biển sai. |
| `/auth/login`, `/auth/logout`, `/auth/me` | Người dùng mẫu | Login trả `access_token`, `token_type`, `expires_in`, `role`. Từ chối khi sai mật khẩu, người dùng tắt hoặc hết phiên. |
| `/citizen/account`, `/citizen/account/register`, `/citizen/account/plates` | Công dân | Đăng ký, xem hồ sơ, gắn/bỏ biển mẫu. Đăng ký mặc định công dân, xác minh mã đăng ký theo dữ liệu mẫu. |
| `/citizen/violations`, `/citizen/complaints`, `/citizen/notifications` | Công dân | Danh sách, chi tiết, thanh toán mẫu, khiếu nại và đánh dấu đã đọc. Quyền truy cập theo người sở hữu và biển đã gắn. |
| `/officer/violations`, `/officer/complaints`, `/officer/stats`, `/officer/kpi`, `/officer/heat`, `/officer/streams`, `/officer/audit` | Cán bộ/chỉ huy/quản trị, theo quyền hiện có | Duyệt hồ sơ và khiếu nại, lấy thống kê, bản đồ nhiệt, camera, nhật ký. Giữ lọc và phân trang. |
| `/officer/controls/*`, `/officer/vms` | Chỉ huy/quản trị cho thao tác ghi | Chế độ đèn, ghi đè, kịch bản, biển VMS. Các endpoint đọc có thể dùng với quyền đọc của API cục bộ. |
| `/admin/users`, `/admin/storage` | Quản trị | Xem, cấp vai trò được phép, bật/tắt người dùng, xem báo cáo lưu trữ. |
| `/station/*` và `/media/*` | Trạm hoặc người xem có quyền tương ứng | Adapter giữ quy tắc nhận vi phạm, ảnh và cập nhật số liệu. Public có quyền trạm nội bộ theo lease, tách khỏi phiên đăng nhập của người dùng. |

Trạng thái công khai `confirmed`, `notified`, `paid`, `disputed`. Dữ liệu lookup chỉ đưa ID, mã/nhãn vi phạm, thời gian, nhãn nút, camera, trạng thái, mức/nguồn phạt được phép và bằng chứng được phép. Trường sở hữu, tài khoản và chi tiết xử lý nằm trong nghiệp vụ xác thực. Với trạng thái khác, dữ liệu chỉ hiện cho đúng quyền xem hồ sơ. Hình và hồ sơ của public chỉ dùng dữ liệu mô phỏng và fixture. Trên Docker, luật và kiểm quyền do FastAPI quyết định.

Trong bản public, dữ liệu và quyền nghiệp vụ thuộc máy khách. Thực thi giao dịch trước khi phát sự kiện. Định danh opaque cục bộ, lưu phiên ngắn hạn và thu hồi theo logout/disable. Lỗi dùng `VALIDATION` (422), `FORBIDDEN` (403), `NOT_FOUND` (404), `STATION_UNAVAILABLE` (409 khi gửi lệnh mà thiếu trạm), `STORAGE_UNAVAILABLE` (503) và các mã auth hiện hành của caller. Vi phạm và khiếu nại phải dedup theo định danh giao dịch khi lệnh lặp do reload hoặc retry. UI không hiện thông tin định danh ngoài các trường đã định ở route.

## 3. Snapshot và điều khiển

`GET /api/v1/officer/snapshot` trả snapshot bổ sung cho trang điều hành. Trang 3D dùng cùng shape qua bridge tới lõi. Giữ các route cũ để tương thích bản cục bộ. `snapshot.updated` gửi `{ snapshot_version, revision }` để hẹn tải lại snapshot khi cần. Lệnh điều khiển đã nhận trả thêm `command_id`, `status: 'pending'` vào payload tương thích; `GET /api/v1/officer/commands/{command_id}` và `command.updated` dùng cùng shape kết quả trong fixture. UI đọc trạng thái từ snapshot và ack, thay vì suy ra từ HTTP 200 hoặc chỉ từ snapshot đã đổi.

| Trường snapshot | Ý nghĩa |
|---|---|
| `snapshot_version`, `revision`, `build_id` | Phiên bản `public-demo-v1`, số thứ tự tăng, định danh artifact. |
| `station` | `{ status, id, last_seen_at }`, trạng thái `missing`, `active`, `stale`. Lease chỉ định một tab nhận lệnh tại một lúc. |
| `simulation` | `{ seed, scenario, mode, t_sim, paused }`. `mode` là `fixed` hoặc `smart`. `scenario` giữ tên trong API hiện hành. |
| `junctions` | Mỗi mục có `junction_id`, `node_ids`, `label`, pha hiện tại, nhóm đang được phục vụ, queue và quyết định gần nhất. |
| `kpi` | `wait_avg_s`, `queue_max`, `flow_per_min`, `trips_completed`, `admission_wait`, `recoveries`. Số kết quả A/B lấy từ báo cáo khác, cùng đơn vị. |
| `routes` | Chuyến quan sát gồm `vehicle_id`, nguồn/đích, `junction_ids`, `state` và `reason_code`. `state` là `planned`, `running`, `waiting`, `arrived` hoặc `recovered`. |
| `cameras` | `camera_id`, `junction_id`, `label`, `frame_id`, `source`, `status`, `captured_at`, `width`, `height`. |

Luồng ghi đè: gửi lệnh → trả `pending` → trạm xác nhận `applied`, trả `rejected` hoặc hết hạn `expired`. Sau 10 giây thời gian thực chưa có ack, hết hạn lệnh, kể cả khi tab quay lại sau đó. Trạm kiểm deadline khi xử lý queue. Lệnh trùng ID trả kết quả đã lưu, ack terminal tới trễ được bỏ qua. Lỗi quyền trả ngay và không phát lệnh. Lệnh lỗi/trạng thái bỏ lỡ có `reason_code`. `applied` có `applied_t_sim`. Bật lại nhận lệnh khi có heartbeat hợp lệ. Với bản cục bộ chưa có ack, UI hiển thị đã gửi và không tuyên bố đã áp dụng. Bổ sung ack từ station vào cùng hợp đồng trước khi nghiệm thu luồng điều khiển local.

| Tình huống | `reason_code` |
|---|---|
| Hết giới hạn xanh, nhóm khác chờ lâu hoặc áp lực thắng | `MAX_GREEN`, `WAIT_LIMIT`, `PRESSURE` |
| Giữ xanh tối thiểu, vàng/chờ đỏ chung, lối ra đầy | `MIN_GREEN`, `CLEARANCE`, `EXIT_FULL` |
| Điều khiển chu kỳ hoặc ưu tiên/ghi đè an toàn | `FIXED_SCHEDULE`, `PRIORITY`, `OVERRIDE` |
| Xe chờ vùng xung đột, cạnh bị chặn, thiếu tuyến hợp lệ | `CONFLICT_ZONE`, `EDGE_BLOCKED`, `NO_ROUTE` |
| Đã đổi tuyến/phục hồi có chủ đích | `REROUTED`, `RECOVERY_RECORDED` |
| Không có trạm, từ chối điều khiển, quá thời hạn | `STATION_UNAVAILABLE`, `COMMAND_REJECTED`, `COMMAND_EXPIRED` |

Frontend map mã thành nhãn tiếng Việt. Mã chưa biết hiển thị “Chưa có diễn giải” và cho phép chẩn đoán bằng log. Backend giữ nguyên ý nghĩa của mã trong v1. `queue` và `exit_capacity` tính theo xe. `score` có thể âm, biểu thị điểm thuật toán trước bước kiểm an toàn.

## 4. Camera và kết quả nhận diện

- Nguồn camera `live` khi lấy từ phiên 3D, `sample` khi là khung chọn sẵn. `status` là `ready`, `missing`, `stale`, `error`. `frame_id`, `captured_at`, `width`, `height` là `null` khi chưa có ảnh. Trả ảnh cũ giữ ID và giờ gốc. `frame_id` khác nhau cho mỗi khung trong lần chạy hiện tại.
- Worker trả `frame_id`, `camera_id`, `model_id`, `source`, `status`, `elapsed_ms` và `detections`. `status` là `idle`, `loading`, `ready`, `error`. Khi `ready` và mảng phát hiện rỗng, UI hiện “Chưa phát hiện xe trong khung”. Lỗi có `error` với `code` và `message`. Mỗi mục có `label`, `confidence` trong `[0, 1]`, `box` là `[x, y, width, height]` chuẩn hóa về ảnh gốc, gốc trên trái. Ảnh letterbox/fullscreen dùng kích thước vùng ảnh thực để vẽ. Nếu ID camera hoặc frame thay đổi khi đang suy luận, bỏ kết quả cũ. Mỗi lần inference chỉ trả hộp AI, còn layer hình học gỡ lỗi là nguồn riêng.

## 5. Quyền sửa và phiên bản

Coordinator sở hữu tài liệu này, fixture và danh mục test ID. Nhánh lõi hiện thực transport, snapshot và camera/worker. Nhánh UI phụ thuộc giao diện này và viết fixture adapter riêng cho phát triển. Đổi trường hoặc ý nghĩa của route/event cần brief chung, review từ cả hai nhánh và commit hợp đồng trước. Sửa fixture sau khi đã biết kết quả test phải có lý do theo yêu cầu và review lại cả bộ test chính lẫn chéo.

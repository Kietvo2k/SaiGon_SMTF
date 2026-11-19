# Điểm ghép UI với lõi Public Demo v1

Trạng thái: thiết kế đã qua planner, đang triển khai DATA-T1; chưa coi factory là khả dụng trên bản phát hành. Không đổi `CONTRACT-PUBLIC-DEMO.md`.

## Transport

- Entry native ES module dùng chung: `outputs/shared/public-demo/traffic-transport.js`, có `.d.ts`.
- Factory: `createLocalTrafficTransport({ apiBase, wsUrl })`, `createPublicTrafficTransport({ buildId })`, `createTrafficTransport({ mode: 'local', apiBase, wsUrl } | { mode: 'public', buildId })`.
- `web/src/lib/api.ts` re-export factory và `getTrafficTransport()` chọn `VITE_TRANSPORT_MODE`. Public chọn tường minh, không fallback loopback hoặc fixture khi lỗi.
- Instance giữ đúng ba phương thức `request`, `subscribe`, `readMedia` trong hợp đồng. UI truyền vào `resolveUiTransport({ runtimeTransport, ... })` đã có ở nhánh UI.
- Giữ các export cũ và một class identity `ApiError` để caller local tương thích.

## Việc UI sở hữu

Nối runtime transport tại entry; chuyển các fetch/media trực tiếp còn lại ở LookupPanel/TrafficAlertsPanel và màn hình hồ sơ qua adapter. `readMedia` nhận AbortSignal; UI tạo/thu hồi object URL. Controls theo `pending` rồi `applied/rejected/expired` từ command/snapshot, không success chỉ từ HTTP 200. Logout gọi `/auth/logout` trước khi xóa token. Khi focus lại hoặc mất seq, đọc snapshot mới.

Core nối callback async duy nhất ở smart-app để thực thi command, rồi bridge ACK sau khi hoàn tất. KPI panel không tự áp cùng lệnh lần nữa. Giữ return links và mặc định Bắc từ các hunk UI khi ghép entry chung.

## Điểm cần đồng thuận

SYNC-07 đề xuất `/admin/reset-sample` và `/officer/inference`, nhưng hợp đồng hiện chưa mô tả chi tiết hai route. Chưa tự thêm route hoặc đổi shape; cần bằng chứng và review cả hai nhánh qua điều phối viên chung. Metadata ảnh phải lấy từ frame capture thật; streamTick không chứng minh frame/camera/giờ chụp.

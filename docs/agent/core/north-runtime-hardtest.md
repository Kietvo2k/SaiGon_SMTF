# Hardtest NORTH-DATA vòng 0

Suite `scripts/hardtest/north/north-data.test.mjs` dùng oracle hình học độc lập
trong `oracle.mjs`. Suite đọc trực tiếp artifact public và mã entry, không gọi
helper clip, filter hoặc mapping của sản phẩm để tính kết quả mong đợi.

## Ca đỏ trước suite chính

`node scripts/hardtest/north/mutant-red.mjs` phải bắt được hai biến thể trong bộ
nhớ: vòng `REGIONS_31` prewarm toàn vùng và bộ lọc chỉ xét hai endpoint. Không ghi
biến thể vào sản phẩm. Lệnh chính sau đó là:

```powershell
node --test scripts/hardtest/north/north-data.test.mjs
```

Các ca `PUB-01` kiểm manifest, provenance, hash/byte, whitelist và entry không tải
`scene.js`/`road-graph-31.js` toàn vùng. Các ca `SIM-01` kiểm 10 cụm, 10 camera,
đồ thị có hướng, layer/elevation, closure và giữ hai edge có hai đầu ngoài nhưng
đoạn trong vùng. Các ca `CAM-01` kiểm pose, FOV, chiều cao và giới hạn tệp Pages.

Candidate vòng 0 trước khi có builder phải đỏ vì thiếu `public-north`; không được
đổi ngưỡng hoặc bỏ assertion để làm xanh. Khi builder bàn giao, chạy lại mutant đỏ,
rồi suite sạch trên đúng SHA tích hợp và ghi log thô vào `work/smtf-agent/logs/`.

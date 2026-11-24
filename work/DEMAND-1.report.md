# DEMAND-1: ĐẠT
Commit: ea78dfb — DEMAND-1: đo nền và chẩn đoán nhu cầu ở mật độ app
File đã đổi: scripts/kpi-ab-32.mjs, outputs/hcmc-poc/test/demand-measure-32.test.mjs
## Số đo (app-1730, 1800 s, TB seed 31031–31035)
| Chỉ số | Trước (nền) | Sau | Ngưỡng | Đạt? |
|---|---|---|---|---|
| breaker_respawns fixed / max-pressure | 2095 / 2075 | chưa sửa (đo) | DEMAND-2: −50 % | đo |
| max_stop_s · a1_crossings_hx | 180,1 · 180,2 / 1524 · 1615 | không đổi | — | đo |
| stopped_hx_by_group (0/1) fixed | 35,98 / 0,489 (1,4 %) | không đổi | — | đo |
| active_hx_by_group (0/1) fixed | 25,89 / 0,466 | thêm trường mới | — | — |
| Bước 1: breaker_respawns seed 31031 fixed | cần 2136 ±5 % | 2136 | ±5 % | CÓ |
## Kiểm
- node --test "outputs/hcmc-poc/test/*.test.mjs": 211/211 PASS (gồm 3 test hash c05ce91e)
## Lệch khỏi prompt
- Thêm `active_hx_by_group` (xe đang chạy trên làn vào HX theo nhóm) để tách "nhóm 1 không có xe" khỏi "nhóm 1 bị chặn"; vẫn trong phạm vi đo được phép.
## Kết luận G1–G4 (bằng số)
- G1 turnBias dồn vào tâm: SAI. turnBias 15→5→0 làm breaker TĂNG 2136→2257→2481 (mỗi xe 0,342→0,361→0,397); tỉ lệ dừng nhóm1/0 chỉ 1,7 %→3,4 %.
- G2 respawn chọn đều, bỏ spawnBias: CHƯA RÕ. spawnList 100 làn = 40 trong bán kính demand (demW 200) + 60 ngoài (demW 1), respawn :717 chọn đều → 60 % xe tái sinh ngoài vùng; spawnBias 200→1 chỉ hạ breaker đúng tỉ lệ số xe (mỗi xe 0,342→0,350).
- G3 Kẹt ở biên khu/cầu Sài Gòn: ĐÚNG. 8/10 làn kẹt nặng ngoài bán kính demand (1607–1973 m); 2/10 là điểm tái sinh ở cầu Sài Gòn (195k s ≈ 24 % tổng); Điện Biên Phủ + Cầu Sài Gòn = 33/50 lượt trong top-10 5 seed.
- G4 Nhóm pha 1 thiếu xe vì bị chặn thượng nguồn: SAI. Nhóm 1 trên làn vào HX chỉ 0,47 xe (fixed) / 0,81 (max-pressure) — gần TRỐNG, đổi thuật toán đèn không tạo ra xe. Cơ chế thật (ngoài danh sách giả thuyết): ở chế độ khu, xe chạy ra khu bị kết thúc ở nút biên (planNext :521–522, respawn :717) nên hướng ra hiếm xe từ đầu.
## Ngưỡng đề xuất cho bước sau (chỉ prompt đo)
- breaker_respawns: ≤ 1050 TB 5 seed (−50 % so với 2095/2075) — giữ mặc định DEMAND-2 vì cả 4 biến thể a–d đều không đạt.
- Tỉ lệ nhóm 1/nhóm 0 ở cụm HX-C1: ≥ 20 % (nền dừng 1,4 %, nền xe chạy 1,8 %) — đo kèm active_hx_by_group.
- a1_crossings_hx (fixed): ≥ 1372 TB (−10 % so với nền 1524).
- active_vehicles: ≥ 5000 (−20 % so với nền 6248).
## Việc còn dở / phát hiện ngoài phạm vi
- G2 chưa thử bằng mã (sửa respawn theo demW) vì DEMAND-1 cấm sửa sim — việc của DEMAND-2.
- Bảng bước 3 đủ 2 mode: work/demand-1/step3-table.md; trường active_hx_by_group mới chỉ đo ở seed 31031 (work/demand-1/active-fixed, active-smart), chưa chạy lại 5 seed để tiết kiệm thời gian.
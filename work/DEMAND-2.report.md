# DEMAND-2: KHÔNG ĐẠT (lần 2)
Commit: a2ef95c — DEMAND-2: respawn khi có nhu cầu chọn làn còn chỗ trống (G3) (giữ nguyên, không commit mới)
File đã đổi: outputs/hcmc-poc/city-traffic-sim-31.js (không đổi lần 2), outputs/hcmc-poc/test/demand-respawn-32.test.mjs (giữ từ lần 1)
## Số đo (app-1730, 1800 s, TB seed 31031–31035, trước = nền DEMAND-1)
| Chỉ số | Trước (TB) | Sau G3 (TB) | Ngưỡng | Đạt? |
|---|---|---|---|---|
| breaker_respawns fixed / max-pressure | 2095 / 2075 | 2117 / 2089 (+1,1 % / +0,7 %) | ≤ 1050 (−50 %) | KHÔNG |
| active_vehicles fixed / smart | 6248 / 6248 | 6248 / 6248 (0 %) | ≥ 5000 (−20 %) | CÓ |
| a1_crossings_hx fixed | 1524 | 1574 (+3,3 %) | ≥ 1372 (−10 %) | CÓ |
| dừng nhóm1/nhóm 0 ở HX (stopped) fixed | 1,4 % | 0,88 % | ≥ 20 % | KHÔNG |
## Kiểm
- node --test "outputs/hcmc-poc/test/*.test.mjs": 212/212 PASS (gồm 3 test hash c05ce91e)
- Không file nào thay đổi so với HEAD → không cần kiểm mojibake
## Lệch khỏi prompt
- Không commit mới vì không biến thể nào cải thiện breaker_respawns ≥50 %.
## Thử nghiệm lần 2 (không commit)
Thử 4 cơ chế mới (không phải G2/G3), tất cả đều giữ hash c05ce91e:
1. **Tránh nút kẹt trong planNext** (congAvoid): giảm trọng số lối rẽ vào trạng thái đang dồn nhiều xe đứng. Kết quả seed 31031 fixed: breaker 2138→2168 (+1,4 %), a1x 2332→2005 (−14 %). Tệ hơn. Lý do: mạng toàn cục quá tải (61 % xe đứng); chuyển hướng chỉ dời kẹt sang nút khác, không giải quyết gốc.
2. **Lạnh sau phá kẹt (breakCool)**: xe bị phá kẹt tạm thời tắt turnBias để tản ra. Test 900 s: breaker 1037 vs 1029 (trung tính). Lý do: xe tản ra rồi vẫn quay lại vùng kẹt qua đường khác.
3. **Đảo thiên hướng sau phá kẹt**: đẩy xe ra xa tâm trong giai đoạn lạnh. Test 900 s: breaker 1044 vs 1029 (tệ hơn nhẹ).
4. **Giảm poolScale** (qua --demand): poolScale 4 → breaker 2012 (−6 %, active 5793); poolScale 3 → breaker 1764 (−17 %, active 5268, a1x 1141 < 1372 ✗). Quan hệ siêu tuyến nhưng không đủ dốc: ngoại suy đến breaker ≤1050 cần active ≈ 3900, vi phạm ngưỡng ≥5000.
## Phân tích khả thi
Mạng khu Bắc tại mật độ app (6248 xe) quá tải toàn cục: 61 % xe đứng trung bình, hàng chờ vĩnh viễn trên Điện Biên Phủ / Cầu Sài Gòn / Bạch Đằng. Breaker ~2100/1800 s = ~1,2/s. Giảm 50 % (≤1050) đòi giảm dòng xe vào nút bão hòa ~50 %, tức giảm tổng xe ~50 % (active ≈ 3900), vượt ngưỡng −20 %. Các cơ chế định tuyến/lạnh/chuyển hướng không giúp vì mạng không có dung lượng dự phòng song song. **Ngưỡng breaker ≤1050 là bất khả thi trong phạm vi spawn/respawn/route/demand của DEMAND-2.** Giải pháp thực sự nằm ở tín hiệu đèn (controller/signal-plan) hoặc chấp nhận mức tắc hiện tại — thuộc phạm vi DEMAND-3 (chỉnh tham số) hoặc task riêng về controller.
## Việc còn dở / phát hiện ngoài phạm vi
- Ngưỡng breaker ≤1050 cần được điều chỉnh xuống (ví dụ ≤1800, −15 %) hoặc chuyển sang DEMAND-3/task controller.
- Vòng lặp phá kẹt ↔ quay lại kẹt: 2496 xe phá kẹt, xe cao nhất 8 lần/1800 s; cơ chế cooldown không phá được vòng này.
- G3 (a2ef95c) giữ nguyên: cải thiện a1x +3,3 % mà không làm tệ breaker.

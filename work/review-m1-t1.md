# Review M1 T1 · commit b434f5d (chỉ đọc)
Phạm vi: diff sim (city-traffic-sim-31.js), city-traffic-31.js, signal-plan-32.js, traffic-controller-32.js (ctrl), 3 test T1. `node --test "outputs/hcmc-poc/test/*.test.mjs"`: 29/29 PASS (22 test T1 + 7 test T2/T3 đang có). Giả thuyết kiểm bằng script đọc-only trong scratchpad, không ghi repo.
## A. Tuân thủ 10 điểm fix.md
| # | Điểm | Đạt? | Bằng chứng |
|---|---|---|---|
| 1 | update() trong beginStep | Mã: CÓ · hành vi: KHÔNG | sim:868 đúng một lần/bước; hành vi sai do B1 |
| 2 | isGreen theo tSim (vàng 22, nhóm 1 xanh 27) | KHÔNG | ctrl:54,111 (B1); test ctrl-test:61–66 bị bỏ qua (B7) |
| 3 | HX-id hai chiều; signalState/by_node khóa HX | MỘT PHẦN | normNode ctrl:22 và by_node đúng; signalState city-31:339 luôn null (B8) |
| 4 | Max-pressure: giữ t≤7, đổi 8–20 s | CÓ (test) | ctrl-test:84–104 chỉ kiểm stateOf, không kiểm isGreen (B2) |
| 5 | setMode không tức thì, ghi rõ | CÓ | ctrl:218–231 getMode trả pending; ghi bằng // không phải JSDoc; stateOf/metrics vẫn trả curMode |
| 6 | Test dùng net.lanes.st | KHÔNG | ctrl-test:87–88, 174 lấy chỉ số làn s làm st |
| 7 | q_out = 25 m đầu làn ra; crossed = sự kiện | KHÔNG | sim:911–933 tính q_out trên làn VÀO; crossed đúng (sim:921), flow sai (B4) |
| 8 | 5 nút 31A giữ 44 s, có lúc đỏ | Mã: CÓ · test: KHÔNG | sim:497–499 đúng; sim-test:100–111 chỉ kiểm edgeTransitions>0 |
| 9 | Lệnh glob node --test | CÓ | chạy đúng lệnh |
| 10 | Nhẹ: đổi tên, xóa thừa, sửa comment | MỘT PHẦN | đổi tên OK; STEP thừa sim-test:6; comment sai (B9) |
Không truyền plan/controller: CÓ y hệt 31A. Đo 1325dc1 so b434f5d: lane, s, v, lat khớp; 49 212 transition sau 120 s. Tên hàm/kiểu Produces khớp; riêng cycleIdOf sai ngữ nghĩa (B5).
## B. Chất lượng
[NẶNG] ctrl:54, 94–111 · fixed: cycleStart bị đặt lại ở MỌI RED→GREEN, pha lệch so với UI; sim HX-02 lệch isGreen/UI 872/2600 bước; không sim: nhóm 1 xanh 0,6% (kỳ vọng 33%), nhóm 0 xanh 89% · sửa: đặt mốc chu kỳ chỉ khi nhóm 0 bắt đầu xanh; ở ctrl:146–147 so theo bước nguyên thay vì `>` float (hiện mỗi pha dài thêm 0,1 s).
[NẶNG] ctrl:53, 84, 114 · smart: greenLen kẹt ở minGreen 8 s, isGreen đỏ từ giây thứ 8 dù stateOf còn xanh (370/450 bước bị chặn) · sửa: khi giữ pha gán greenLen = elapsed (bỏ điều kiện undefined ở dòng 84); thêm test isGreen smart tới maxGreen.
[NẶNG] sim:911–933 · q_out tính trên làn VÀO 25 m cuối trước vạch, không phải 25 m đầu làn RA; ctrl:69 trừ cùng hàng thay vì tổng làn ra tương thích (điểm 7) · sửa: q_out lấy từ làn có lanes.from[l]==node, s∈[0,25], gom theo nhóm; controller trừ tổng đó.
[NẶNG] ctrl:151–156, 195 · flow_per_min chỉ đọc crossed ở bước trùng mốc giây: báo 0–1/nút, sự kiện thật 2–10/nút trong 60 s (tổng 24 so 2) · sửa: cộng dồn crossed mỗi bước vào bộ đệm; mẫu 1 s đọc rồi reset.
[NẶNG] ctrl:249–253 · cycleIdOf cộng đôi (c.cycle đếm cả nửa chu kỳ, cộng thêm floor(elapsed/48)): đo t=96→3, t=120→4 (kỳ vọng 2); T3 ghi cycle_id này vào bản ghi vi phạm (violation-perception-32.js:139) · sửa: cycleId = floor((t − cycleOrigin)/48).
[NẶNG] sim (142 dòng) · mojibake UTF-8 kép: 120 dòng comment, và dòng 721–722 là chuỗi TypeError runtime ("pháº£i") · sửa: khôi phục từ 1325dc1 rồi áp lại logic (diff thật ≈110 dòng); kiểm UTF-8 trước khi commit.
[VỪA] ctrl-test:61–66 · nhánh kiểm nhóm 1 bị bỏ qua: HX-01 không có làn vào nhóm 1 (đo inStates_g1=0), nên "nhóm 1 xanh từ t=27" chưa từng chạy; sim-test:85 và ctrl-test:84 kiểm stateOf chứ không isGreen, không bắt được B1–B2 · sửa: dùng HX-02/03, assert st hợp lệ, kiểm isGreen qua beginStep.
[VỪA] ctrl:108 · override đổi nhóm tức thì, bỏ vàng 3 s và đỏ chung 2 s; pha máy trạng thái vẫn chạy ngầm (đọc mã, chưa đo) · sửa: đi qua chuỗi chuyển pha chuẩn, hoặc ghi ngoại lệ vào đặc tả 4.1.
[VỪA] city-31:339–345; ctrl:119, 251 · signalState("HX-01") so String(n.id) với id OSM nên luôn null (đo idx=−1); nút ngoài plan (9 nút 31A trong khu bac) rơi vào clusters[0]=HX-C1, báo nhầm cụm và chu kỳ 48 s · sửa: signalState gọi controller.stateOf(nodeId); nút 31A trả trạng thái 44 s, cụm 31A-n.
[VỪA] ctrl:156 · wait_avg: max(1,count) làm mẫu số cho dòng count=0 (đo 4,55 thay 5,0); đo stopT liên tục, không phải tổng thời gian chờ · sửa: mẫu số = Σcount; cộng dồn thời gian chờ mỗi xe trong cửa sổ 60 s.
[VỪA] sim:754–757; city-31:325 · sim.reset() đặt t=0 nhưng không reset controller: pha đứng 0:green ở t=3…15 s sau reset (đo) · sửa: controller.reset(0) gọi trong sim.reset().
[VỪA] city-31:149–150 · createTraffic31 nhận controller nhưng controller cần net, mà net dựng bên trong (phải dựng net hai lần); api đã có net (dòng 312) nhưng không có attach · sửa: thêm api.attachController(opts) dựng từ api.net.
[NHẸ] sim-test:6, 20; ctrl:44, 163; sim:924 (20 m, spec 6.1 ghi 25 m); sim:287 (stats.signals=86, thực 91 sau plan); sim:940 (speed_mean ghi đè theo làn); city-31:150 (ternary vô nghĩa); signal-plan-32.test.mjs:31–49 (lặp lại công thức của code); group_axis_deg hard-code, HX-06 chọn Hàng Xanh 171° thay Xô Viết 98° cùng cấp mà không ghi lý do · sửa: xóa import STEP, sửa comment "11 nút" (khu bac: 10 đèn 31A, 9 ngoài plan; fix.md ghi 5), xóa switchWindow, ghi rule tái lập trục.
[NHẸ] hiệu năng: không thấy O(n²); 600 bước 1062 ms (smart) so 1069 ms (không controller), N=3599, NL=20195 · buildQueues quét NL cho mỗi nút đèn mỗi bước · sửa nhẹ: index làn vào theo nút một lần.
Lưu ý T2: work/kpi-fixed-*.json và kpi-smart-*.json (05:14–05:19) sinh bằng code này, không dùng để kết luận Δwait cho đến khi sửa B1–B4.

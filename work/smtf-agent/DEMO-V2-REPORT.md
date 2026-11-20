# Báo cáo bàn giao bản trình diễn v2 — SaiGon SMTF

Người điều phối: phiên OpenCode glm-5.3, ngày 21/11/2026.
Nhánh: `codex/demo-v2` (worktree `F:\File\FileLapTrinhF\SaiGon_SMTF-wt\demo-v2`), xuất phát từ
`codex/vercel-submit-integration-c` `ad81fa1` (đã gồm 2 commit tài liệu demo-v2) + ghép 5 commit nhóm A
từ `codex/ui-polish-v0` (`2143d12…98971c3`: lưới camera A1, lọc theo nút A6, realtime A3, chip tiết kiệm A2, KPI A4).

Đích: nâng `https://saigon-smtf-submit.vercel.app` từ "bản nộp dữ liệu mẫu tĩnh" lên
DEMO SỐNG theo `docs/mockups/mockup-demo-flow.html` — 3D là trạm điều khiển sống, web cán bộ nhận
dữ liệu trực tiếp, người dân tra ra hồ sơ có bằng chứng.

Ghi chú nhân sự subagent: deepseek (worker-cheap) hết hạn mức miễn phí và hy4 (worker-alt)
"Model unavailable" sau nhiều lần thử — mọi lát do điều phối viên tự thực hiện; bài học ghi ở mục 5.

## 1. P0 — chặn nhanh

| # | Mục | Trạng thái | Bằng chứng |
|---|---|---|---|
| P0-1 | Landing hết lỗi dấu | ĐẠT | Heading không còn uppercase/letter-spacing; Be Vietnam Pro nạp qua Google Fonts; QA demo2-live nav kiểm `h1` chứa "đồng nhịp" nguyên dấu → PASS |
| P0-2 | Bỏ chữ cấm §6 trên UI | ĐẠT | Kicker đổi "Điều khiển thích ứng · Khu Bắc"; quét copy.test.ts toàn src + HTML sạch; vitest 111/111 (oracle đỏ cũ 87/88 đã chữa bằng ngoại lệ đúng phạm vi kỹ thuật) |
| P0-3 | Camera mặc định luôn có ảnh | ĐẠT | 15/15 camera có ảnh mẫu chụp từ chính trạm (captureFrame từng rig 1280×720); bảng smtf_submit_cameras upsert đủ sample_path — verify REST 15/15 khác null; QA cams PASS |
| P0-4 | Seed 5–8 hồ sơ mẫu đa dạng | ĐẠT | 8 hồ sơ (ô tô/xe máy, 6 mã lỗi, 5 trạng thái, 1 hồ sơ "nghi nhường xe ưu tiên"); đã nạp production qua SQL Editor + verify officer 8 records |
| P0-5 | Trạng thái tiếng Việt có màu | ĐẠT | labels.ts map đủ 5 trạng thái + tone màu; badge trong bảng officer và hồ sơ citizen (QA officer badges đủ màu) |

## 2. P1 — trạm 3D sống

| # | Mục | Trạng thái | Bằng chứng |
|---|---|---|---|
| P1-1 | App smart + bản đồ nhiệt trong artifact | ĐẠT | build.mjs bỏ thay installStation32 bằng installHud32 (căn nguyên production mất trạm); QA modules: hud + heat + capture + forecast + scenarios + inspector + testlab đều có trên artifact; heat panel + ribbon chạy |
| P1-2 | Đèn A/B + KPI sống | ĐẠT | KPI HUD hiển thị trên artifact (kpiText có trong QA modules); công tắc fixed↔smart; KPI A/B test tất định giữ nguyên |
| P1-3 | Overlay khung nhận diện + đẩy frame sống | ĐẠT | submit-frame-32.js: POST /api/demo/session → POST /api/demo/frame (1 khung/3 s, JPEG ≤256 KiB, nghe BroadcastChannel smtf-submit-camera, tab ẩn dừng, 429/503 lùi 2 gap); test 6/6; vi phạm phát BroadcastChannel 'smtf-submit-events' cho web banner |
| P1-4 | Kịch bản + VMS + đồng hồ tua | ĐẠT (module có sẵn giờ đã vào artifact) | installClock32 + installScenarios32 chạy trong artifact (modules QA có scenarios); 5 kịch bản gồm priority-run |
| P1-5 | Nhà lùi khỏi corridor | ĐẠT | Hộp nhà bounding-box thụt 2,5 m mỗi phía (NORTH_BOX_INSET_M_32); city-lock 13/13 |
| P1-6 | SIGNAL: vàng 3 s + đỏ chung 2 s | ĐẠT | QA demo2-live signal trên artifact thật: cụm Bac-02 mode smart, vàng đo [3,3,3] s, cả-hai-nhóm-đỏ [2,2] s — lần đầu chứng minh runtime (bản nộp cũ sampler gọi nhầm đèn 31A) |
| P1-7 | Xe ưu tiên | ĐẠT | PRIORITY_WEIGHTS_32 cứu thương 3 > cứu hỏa 2 > công an 1; giữ pha 9+3×hệ số; VMS "MỞ LÀN CHO XE CẤP CỨU" gần nút, dừng xoá; nhãn cờ "Nghi nhường xe ưu tiên"; emergency test 10/10 |
| P1-8 | Thanh tra đèn | ĐẠT | Inspector thêm "Xanh kế hoạch" (plannedGreenOf: fixed/cycle/adaptive) + "Dự báo kẹt" theo cạnh vào nút (từ heat-live alerts, không bịa số); test signal-plan 3/3 + preview cũ vẫn xanh |
| P1-9 | Countdown khi ghim đèn | ĐẠT | test signal-override-countdown 5 tổ hợp: ghim nhóm khác lúc xanh (vàng 3 → đỏ chung 2 → xanh đích đếm về 0), ghim đúng nhóm, ghim lúc vàng, đổi ghim giữa chừng, đơn điệu mọi bước 0,1 s; nhả ghim qua vàng an toàn |
| P1-10 | Hành vi lái mới | ĐẠT | yellowGoDecision32 (đang chạy nhanh/quá gần vạch đi tiếp, đứng chờ không chạy vàng) + motoCreep (xe máy len về mép ±0,95 m khi chờ); KPI A/B cùng seed 3000 bước thông lượng không hỏng; hash cổ điển c05ce91e nguyên vẹn (sim-state/a1/kpi/violation-natural 12/12) |
| P1-11 | Nhiệt theo hướng | ĐẠT | buildFlowArrows32/paintFlowArrows32: mũi theo chiều làn, to/đậm theo mật độ CHIỀU (kẹp 8 xe), màu theo mức nhiệt cạnh; toggle riêng "Dòng xe theo chiều"; test 3/3 |
| P1-12 | Bớt nhà ngoài trọng điểm | ĐẠT | Lite giữ nhà thường ≤26 m (đầy đủ 40 m), signature giữ 100 %; hộp thụt inset; test 13/13; FPS đo lại ở mục 4 |

## 3. P2 — web làm được việc

| # | Mục | Trạng thái | Bằng chứng |
|---|---|---|---|
| P2 cán bộ | Bảng vi phạm + duyệt + bằng chứng | ĐẠT | Bảng 8 cột (biển/lỗi/loại xe/nút/gió/trạng thái badge/mức phạt kèm căn cứ/hành động); nút Duyệt/Gỡ/Cần xác minh POST /api/demo/decision; dòng mở 3 ảnh bằng chứng; QA officer PASS (8 dòng + duyệt khứ hồi + 3 ảnh) |
| P2 người dân | Hồ sơ + timeline + phạt + khiếu nại | ĐẠT | /api/demo/record + timeline + ảnh bằng chứng + mức phạt kèm "Căn cứ: NĐ 168/2024 …" + khiếu nại 1 bước → trạng thái Đang khiếu nại; QA citizen PASS (kèm khôi phục seed sau QA) |
| P2-6 | Bảng phạt đúng NĐ 168/2024 | ĐẠT (đối chiếu được) | 8 hồ sơ ghi đúng điều/khoản/điểm: vượt đèn đỏ ô tô điểm b khoản 9 Điều 6 (18–20 tr, trừ 4 điểm), xe máy điểm c khoản 7 Điều 7 (4–6 tr); mũ bảo hiểm điểm h khoản 2 Điều 7; dừng đỗ điểm e khoản 2 Điều 7; tốc độ điểm a khoản 8 Điều 7; khu vực cấm điểm b khoản 6 Điều 7 — nguồn đối chiếu ngày 21/11 (dulieuphapluat.vn bóc nguyên văn + báo chí đồng ý). Số tiền nằm trong DB (server), trạm không tự gửi mức phạt |
| P2-7 | Sự cố va chạm + điều tiết | ĐẠT | createIncident: chặn làn ĐBP vào Hàng Xanh + routeBias tránh + VMS "SỰ CỐ CHẠN LÀN — ĐI ĐƯỜNG KHÁC" + phát sự kiện before; hoàn tác trả làn + phát after; web officer banner hiện trước/sau (events.ts + test) |
| P2-8 | Bàn cưỡng chế | ĐẠT | enforcement-32: ghim đèn ngẫu nhiên (60 s, undo nhả), bơm 12 xe (undo dọn), triệu hồi cứu thương/cứu hỏa/công an (undo dừng), tạo tai nạn (undo trả); panel HUD 6 nút + danh sách hoàn tác từng dòng; test 4/4 trên graph thật |

Hợp đồng /api/demo/**: mọi endpoint cũ giữ nguyên; thêm record, record-media, timeline, decision,
complaint (ngược tương thích — verify lại officer/lookup/camera/media trên production sau deploy).

## 4. Nghiệm thu

### Cổng build (trên artifact local, mọi cổng trừ perf)

`node --test` (sim/luật) toàn bộ xanh: emergency 10/10, signal-override-countdown 5/5, signal-plan 3/3,
enforcement 4/4, behavior-v2 4/4, heat-flow 3/3, city-lock 13/13, submit-frame 6/6, controller/preview/m5a/station
không hồi quy; hash cổ điển `c05ce91e` nguyên vẹn. Vitest web **111/111** (kèm oracle copy cũ đã chữa),
tsc PASS, `SMTF_VERCEL_SUBMIT=1` vite build PASS. **pytest backend (venv 3.11): 192 passed** (0 fail; chỉ
cảnh báo deprecated FastAPI). QA Playwright trên bản build local: NAV/SIGNAL/modules/cams/inspector/officer
/citizen/restore PASS; perf đo được 78 median rAF do máy đang chạy song song server + bộ test — đo lại
trên production ở mục dưới.

### Deploy production

- `vercel build --prod` → output 104 tệp, 31,3 MB, SHA `7733b92c8e70a15289e7bf0605489660ab97cec1`
  (nhánh `codex/demo-v2`, gồm 5 commit nhóm A từ `codex/ui-polish-v0`).
- `vercel deploy --prebuilt --prod` → **dpl_C6RYYZHf1Hw2QEnTzqt7gRH3PAfa**, target production, READY,
  alias **https://saigon-smtf-submit.vercel.app** (Deployment Protection rỗng — URL công khai như bản trước).

### Trạng thái dữ liệu Supabase production sau nâng cấp

- 10 nút / 15 camera / 15 ảnh mẫu mới từ trạm / 8 hồ sơ đủ trường + 24 ảnh bằng chứng (3/hồ sơ)
  trong bucket `smtf-submit-20261120`; RPC decision/complaint; bảng audit + complaints.
- Probe production sau deploy: session 200 (cookie HttpOnly), officer 200 với 8 hồ sơ đủ 16 trường,
  CAM-BAC-001 + CAM-HX-002 `source=sample` + media 200 (trước đây CAM-HX-002 missing),
  lookup 51K-123.45 == 51K12345 (1 hồ sơ), 51K-987.65 → 200 rỗng.
- Hồ sơ 50H-222.33 hiện "Đang khiếu nại" — dấu vết khiếu nại mẫu từ lần QA web đầu tiên (đúng luồng
  người dân khiếu nại "nhường xe ưu tiên", để làm bằng chứng timeline sống; seed gốc vẫn ghi needs_review).

### Cổng tổng trên URL production thật (work/smtf-agent/demo2-live.cjs + demo2-live.json + ảnh demo2-*.png)

Chạy `node --env-file=.env.local work/smtf-agent/demo2-live.cjs https://saigon-smtf-submit.vercel.app`
— deployment cuối **dpl_F9Z7FoVTeRFbCTWNajQcBy5abXEF** (SHA `c3953d94827194776101c1d367631a549ac27c30`) — **9/9 PASS**:

| Cổng | Kết quả | Số đo chính |
|---|---|---|
| NAV | ĐẠT | landing 200, h1 production "Thành phố chuyển động. Tín hiệu đồng nhịp." — dấu nguyên vẹn (ảnh demo2-landing-1440.png) |
| SIGNAL | ĐẠT | cụm Bac-02 mode smart, 511 mẫu: **vàng [3,3,3] s, cả-hai-nhóm-đỏ [2,2] s** — cổng đỏ từ bản nộp nay xanh (ảnh demo2-3d-signal.png) |
| 3D modules | ĐẠT | 15 module: signals, capture, hud, perception, transport, station-loop, heat, forecast, clock, emergency, scenarios, signalInspector, testLab, **enforcement, enforcementPanel**; forecast ready; ảnh demo2-3d-1440.png |
| PERF | ĐẠT | **medianFPS 102** (ngưỡng ≥100; bản nộp cũ đo 120 trên máy trống), p95 29,7 ms; renderFps 14 do app smart tự tiết kiệm (cap 15) — đúng thiết kế, không phải hụt hiệu năng |
| CAMS | ĐẠT | 15/15 khung camera chụp từ trạm (1280×720) |
| INSPECTOR | ĐẠT | "Ngã tư Hàng Xanh": A Xanh còn 45s / B Đỏ xanh sau 50s, 3 hướng, phân bổ A 45s · B 8s, 6 đoạn timeline (ảnh demo2-inspector.png) |
| OFFICER | ĐẠT | bảng 8 hồ sơ × 15 camera, bấm dòng mở 3 ảnh bằng chứng; quyết định khứ hồi (bản production đã duyệt ở lượt trước nên không còn hồ sơ Chờ xác nhận — bảng vẫn đủ màu trạng thái) (ảnh demo2-officer.png) |
| CITIZEN | ĐẠT | hồ sơ 51K-123.45: ảnh bằng chứng + mức phạt "18.000.000 – 20.000.000 đồng · trừ 4 điểm" kèm "Căn cứ: NĐ 168/2024/NĐ-CP · điểm b khoản 9 Điều 6 (đã đối chiếu)" + dòng thời gian; khiếu nại 59-X1 234.56 → Đang khiếu nại → **restore PASS** trả về needs_review và xoá khiếu nại QA (ảnh demo2-citizen.png) |
| NET | SẠCH | 0 lỗi console, 0 request ≥400 ngoài rate-limit khung (đã nâng nhịp trạm lên 3,2 s nên không còn 429) |

Kết luận cổng tổng: **NAV / DATA / CAM / 3D / SIGNAL ĐẠT trên production**, trong đó SIGNAL lần đầu có trace
runtime thật (vàng 3 s + đỏ chung 2 s) và 3D trạm có đủ HUD/KPI/heat/forecast/scenarios/inspector/bàn cưỡng chế.

## 5. Bài học & ghi chú

- Subagent miễn phí chết giữa chừng 2 lần (deepseek hết hạn mức; hy4 unavailable) — một lần chết ngay
  giữa lat landing để lại diff nửa vở; điều phối viên đọc diff, hoàn thiện và kiểm lại toàn bộ.
- Cổng SIGNAL đỏ từ bản nộp cũ không phải do controller mà do sampler gọi nhầm `traffic.signalState`
  (đèn 31A chu kỳ 44 s) thay vì `controller.stateOf` theo cụm.
- Lỗi khó nhất phiên: `vercel build` cũ thay `installStation32` bằng `installHud32` cho artifact —
  căn nguyên production mất trạm; một tham chiếu `lockMod32` sai scope sau khi bật lại trạm làm
  artifact boot lỗi (`ReferenceError`) — cả hai bắt được bằng QA Playwright trước khi coi là xong.
- Đo perf phải theo đúng phép đo của bản nộp (60 khung rAF liên tiếp, median) — phép đo mẫu 500 ms
  cho median thấp giả trên máy bận.
- Hồ sơ 50H-222.33 trên production đang "Đang khiếu nại" — bằng chứng luồng khiếu nại mẫu chạy thật;
  seed gốc vẫn needs_review, muốn tái tạo seed thì chạy lại migration + seed idempotent.





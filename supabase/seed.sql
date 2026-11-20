begin;

insert into public.smtf_submit_junctions (junction_id, label) values
  ('HX-C1', 'Cầu vượt Hàng Xanh ∩ Điện Biên Phủ'),
  ('HX-C2', 'Nguyễn Gia Trí ∩ Điện Biên Phủ'),
  ('HX-C3', 'Bạch Đằng ∩ Đinh Bộ Lĩnh'),
  ('HX-C4', 'Bạch Đằng ∩ Xô Viết Nghệ Tĩnh'),
  ('HX-C5', 'Ngã tư Hàng Xanh ∩ Xô Viết Nghệ Tĩnh'),
  ('Bac-01', 'Phan Đăng Lưu × Lê Quang Định'),
  ('Bac-02', 'Ung Văn Khiêm × Nguyễn Gia Trí'),
  ('Bac-03', 'Ung Văn Khiêm × Nguyễn Văn Thương'),
  ('Bac-04', 'Điện Biên Phủ × Nguyễn Văn Thương'),
  ('Bac-05', 'Điện Biên Phủ × Nguyễn Hữu Cảnh')
on conflict (junction_id) do update set label = excluded.label;

insert into public.smtf_submit_cameras (camera_id, junction_id, label, sample_path) values
  ('CAM-HX-001', 'HX-C1', 'Cầu vượt Hàng Xanh ∩ Điện Biên Phủ · hướng Điện Biên Phủ', 'sample/CAM-HX-001.jpg'),
  ('CAM-HX-002', 'HX-C5', 'Ngã tư Hàng Xanh ∩ Xô Viết Nghệ Tĩnh · hướng Xô Viết Nghệ Tĩnh', null),
  ('CAM-HX-003', 'HX-C1', 'Cầu vượt Hàng Xanh ∩ Điện Biên Phủ · hướng về cầu Thủ Thiêm', null),
  ('CAM-HX-004', 'HX-C5', 'Ngã tư Hàng Xanh ∩ Xô Viết Nghệ Tĩnh · hướng ra phía Nam đường Hàng Xanh', null),
  ('CAM-HX-005', 'HX-C2', 'Nguyễn Gia Trí ∩ Điện Biên Phủ · hướng về ngã ba Nguyễn Gia Trí', null),
  ('CAM-HX-006', 'HX-C2', 'Nguyễn Gia Trí ∩ Điện Biên Phủ · hướng về phía cầu Sài Gòn', null),
  ('CAM-HX-007', 'HX-C3', 'Bạch Đằng ∩ Đinh Bộ Lĩnh · hướng về Bạch Đằng phía Bắc', null),
  ('CAM-HX-008', 'HX-C3', 'Bạch Đằng ∩ Đinh Bộ Lĩnh · hướng về Đinh Bộ Lĩnh', null),
  ('CAM-HX-009', 'HX-C4', 'Bạch Đằng ∩ Xô Viết Nghệ Tĩnh · hướng về Xô Viết Nghệ Tĩnh', null),
  ('CAM-HX-010', 'HX-C1', 'Đinh Bộ Lĩnh ∩ Điện Biên Phủ · hướng về Điện Biên Phủ phía Nam', null),
  ('CAM-BAC-001', 'Bac-01', 'Phan Đăng Lưu × Lê Quang Định · góc quan sát Bắc', 'sample/CAM-BAC-001.jpg'),
  ('CAM-BAC-002', 'Bac-02', 'Ung Văn Khiêm × Nguyễn Gia Trí · góc quan sát Bắc', 'sample/CAM-BAC-002.jpg'),
  ('CAM-BAC-003', 'Bac-03', 'Ung Văn Khiêm × Nguyễn Văn Thương · góc quan sát Bắc', 'sample/CAM-BAC-003.jpg'),
  ('CAM-BAC-004', 'Bac-04', 'Điện Biên Phủ × Nguyễn Văn Thương · góc quan sát Bắc', 'sample/CAM-BAC-004.jpg'),
  ('CAM-BAC-005', 'Bac-05', 'Điện Biên Phủ × Nguyễn Hữu Cảnh · góc quan sát Bắc', 'sample/CAM-BAC-005.jpg')
on conflict (camera_id) do update set junction_id = excluded.junction_id, label = excluded.label,
  sample_path = excluded.sample_path;

-- demo-v2 (21/11): 8 hồ sơ mẫu đa dạng kèm căn cứ NĐ 168/2024/NĐ-CP đã đối chiếu
-- (nguồn tra cứu đối chiếu ngày 21/11/2026: điểm b khoản 9 Điều 6; điểm c khoản 7 Điều 7;
--  điểm h khoản 2 Điều 7; điểm e khoản 2 Điều 7; điểm a khoản 8 Điều 7; điểm b khoản 6 Điều 7).
-- Mức chưa đối chiếu được ghi rõ 'cần xác minh' — không bịa (quy tắc trung thực DEMO-V2-PLAN mục 2).
insert into public.smtf_submit_records
  (plate, summary, status, occurred_at, violation_code, violation_label, vehicle_class, junction_id, camera_id,
   direction, penalty_amount_min, penalty_amount_max, penalty_points, penalty_source, priority_flag, priority_reason)
values
  ('51K-123.45', 'Vi phạm tín hiệu (mẫu)', 'confirmed', now() - interval '2 hours',
   'RED-LIGHT', 'Vượt đèn đỏ', 'car', 'Bac-02', 'CAM-BAC-002', 'Ung Văn Khiêm → Nguyễn Gia Trí',
   18000000, 20000000, 4, 'NĐ 168/2024/NĐ-CP · điểm b khoản 9 Điều 6 (đã đối chiếu)', false, null),
  ('51G-678.90', 'Vượt đèn đỏ tại cầu vượt Hàng Xanh', 'pending', now() - interval '35 minutes',
   'RED-LIGHT', 'Vượt đèn đỏ', 'car', 'HX-C1', 'CAM-HX-001', 'Điện Biên Phủ → Hàng Xanh',
   18000000, 20000000, 4, 'NĐ 168/2024/NĐ-CP · điểm b khoản 9 Điều 6 (đã đối chiếu)', false, null),
  ('59-X1 234.56', 'Không đội mũ bảo hiểm', 'needs_review', now() - interval '1 hour',
   'NO-HELMET', 'Không đội mũ bảo hiểm', 'motorbike', 'Bac-03', 'CAM-BAC-003', 'Ung Văn Khiêm → Nguyễn Văn Thương',
   400000, 600000, 0, 'NĐ 168/2024/NĐ-CP · điểm h khoản 2 Điều 7 (đã đối chiếu)', false, null),
  ('59-B1 777.77', 'Vượt đèn đỏ tại Hàng Xanh · Xô Viết Nghệ Tĩnh', 'confirmed', now() - interval '3 hours',
   'RED-LIGHT', 'Vượt đèn đỏ', 'motorbike', 'HX-C5', 'CAM-HX-002', 'Xô Viết Nghệ Tĩnh → Hàng Xanh',
   4000000, 6000000, 4, 'NĐ 168/2024/NĐ-CP · điểm c khoản 7 Điều 7 (đã đối chiếu)', false, null),
  ('51L-345.67', 'Dừng xe trên phần đường xe chạy tại nơi giao nhau', 'dismissed', now() - interval '5 hours',
   'BAD-STOP', 'Dừng đỗ sai nơi giao nhau', 'motorbike', 'Bac-04', 'CAM-BAC-004', 'Điện Biên Phủ → Nguyễn Văn Thương',
   400000, 600000, 0, 'NĐ 168/2024/NĐ-CP · điểm e khoản 2 Điều 7 (đã đối chiếu)', false, null),
  ('60C-999.88', 'Chạy quá tốc độ quy định trên 20 km/h', 'pending', now() - interval '20 minutes',
   'SPEED', 'Quá tốc độ trên 20 km/h', 'motorbike', 'Bac-05', 'CAM-BAC-005', 'Điện Biên Phủ → Nguyễn Hữu Cảnh',
   6000000, 8000000, 4, 'NĐ 168/2024/NĐ-CP · điểm a khoản 8 Điều 7 (đã đối chiếu)', false, null),
  ('50H-222.33', 'Vượt đèn đỏ khi nhường xe cứu thương', 'needs_review', now() - interval '50 minutes',
   'RED-LIGHT', 'Vượt đèn đỏ', 'car', 'Bac-01', 'CAM-BAC-001', 'Phan Đăng Lưu → Lê Quang Định',
   18000000, 20000000, 4, 'NĐ 168/2024/NĐ-CP · điểm b khoản 9 Điều 6 (đã đối chiếu)', true, 'Nghi nhường xe ưu tiên — chờ cán bộ xem xét'),
  ('52F-111.22', 'Đi vào khu vực cấm đối với loại xe đang điều khiển', 'confirmed', now() - interval '4 hours',
   'BANNED-ZONE', 'Đi vào khu vực cấm', 'motorbike', 'HX-C2', 'CAM-HX-005', 'Nguyễn Gia Trí → Điện Biên Phủ',
   2000000, 3000000, 2, 'NĐ 168/2024/NĐ-CP · điểm b khoản 6 Điều 7 (đã đối chiếu)', false, null)
on conflict (plate) do update set
  summary = excluded.summary, status = excluded.status, occurred_at = excluded.occurred_at,
  violation_code = excluded.violation_code, violation_label = excluded.violation_label,
  vehicle_class = excluded.vehicle_class, junction_id = excluded.junction_id, camera_id = excluded.camera_id,
  direction = excluded.direction, penalty_amount_min = excluded.penalty_amount_min,
  penalty_amount_max = excluded.penalty_amount_max, penalty_points = excluded.penalty_points,
  penalty_source = excluded.penalty_source, priority_flag = excluded.priority_flag,
  priority_reason = excluded.priority_reason;

-- Bằng chứng ảnh mẫu (path trong bucket riêng tư; upload bằng scripts/vercel/seed-samples.mjs).
insert into public.smtf_submit_evidence (plate, kind, path) values
  ('51K-123.45', 'before', 'evidence/51K-123.45/before.jpg'),
  ('51K-123.45', 'after',  'evidence/51K-123.45/after.jpg'),
  ('51K-123.45', 'plate',  'evidence/51K-123.45/plate.jpg'),
  ('51G-678.90', 'before', 'evidence/51G-678.90/before.jpg'),
  ('51G-678.90', 'after',  'evidence/51G-678.90/after.jpg'),
  ('51G-678.90', 'plate',  'evidence/51G-678.90/plate.jpg'),
  ('59-X1 234.56', 'before', 'evidence/59-X1 234.56/before.jpg'),
  ('59-X1 234.56', 'after',  'evidence/59-X1 234.56/after.jpg'),
  ('59-X1 234.56', 'plate',  'evidence/59-X1 234.56/plate.jpg'),
  ('59-B1 777.77', 'before', 'evidence/59-B1 777.77/before.jpg'),
  ('59-B1 777.77', 'after',  'evidence/59-B1 777.77/after.jpg'),
  ('59-B1 777.77', 'plate',  'evidence/59-B1 777.77/plate.jpg'),
  ('51L-345.67', 'before', 'evidence/51L-345.67/before.jpg'),
  ('51L-345.67', 'after',  'evidence/51L-345.67/after.jpg'),
  ('51L-345.67', 'plate',  'evidence/51L-345.67/plate.jpg'),
  ('60C-999.88', 'before', 'evidence/60C-999.88/before.jpg'),
  ('60C-999.88', 'after',  'evidence/60C-999.88/after.jpg'),
  ('60C-999.88', 'plate',  'evidence/60C-999.88/plate.jpg'),
  ('50H-222.33', 'before', 'evidence/50H-222.33/before.jpg'),
  ('50H-222.33', 'after',  'evidence/50H-222.33/after.jpg'),
  ('50H-222.33', 'plate',  'evidence/50H-222.33/plate.jpg'),
  ('52F-111.22', 'before', 'evidence/52F-111.22/before.jpg'),
  ('52F-111.22', 'after',  'evidence/52F-111.22/after.jpg'),
  ('52F-111.22', 'plate',  'evidence/52F-111.22/plate.jpg')
on conflict (plate, kind) do update set path = excluded.path;

insert into public.smtf_submit_kpi (id, source, wait_avg_s, queue_max, flow_per_node_min)
values (1, 'sample', 18, 9, 24)
on conflict (id) do update set source = excluded.source, wait_avg_s = excluded.wait_avg_s,
  queue_max = excluded.queue_max, flow_per_node_min = excluded.flow_per_node_min;

commit;


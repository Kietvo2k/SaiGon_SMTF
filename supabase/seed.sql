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

insert into public.smtf_submit_records (plate, summary, status)
values ('51K-123.45', 'Vi phạm tín hiệu (mẫu)', 'confirmed')
on conflict (plate) do update set summary = excluded.summary, status = excluded.status;

insert into public.smtf_submit_kpi (id, source, wait_avg_s, queue_max, flow_per_node_min)
values (1, 'sample', 18, 9, 24)
on conflict (id) do update set source = excluded.source, wait_avg_s = excluded.wait_avg_s,
  queue_max = excluded.queue_max, flow_per_node_min = excluded.flow_per_node_min;

commit;

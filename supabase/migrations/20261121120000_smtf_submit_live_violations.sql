begin;

-- demo-v2: vi phạm do trạm 3D phát hiện trong phiên public. Bảng riêng để KHÔNG đụng hồ sơ mẫu
-- (smtf_submit_records, khóa theo biển) và để giữ được nhiều vi phạm của cùng một biển.
create table if not exists public.smtf_submit_live_violations (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  violation_code text not null,
  occurred_at timestamptz not null,
  status text not null default 'new' check (status in ('new', 'needs_review')),
  camera_id text,
  junction_id text,
  direction text,
  vehicle_class text check (vehicle_class is null or vehicle_class in ('car', 'motorbike')),
  speed_kmh numeric,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_path text,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  unique (plate, violation_code, occurred_at)
);

create index if not exists smtf_submit_live_violations_plate_at
  on public.smtf_submit_live_violations (plate, occurred_at desc);
create index if not exists smtf_submit_live_violations_session_at
  on public.smtf_submit_live_violations (session_id, created_at desc);

alter table public.smtf_submit_live_violations enable row level security;
revoke all on public.smtf_submit_live_violations from public, anon, authenticated;
grant select, insert, update, delete on public.smtf_submit_live_violations to service_role;

-- Dọn tay khi cần (không cron): xoá bản ghi cũ hơn 1 ngày.
-- delete from public.smtf_submit_live_violations where created_at < now() - interval '1 day';

commit;

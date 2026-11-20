begin;

-- demo-v2: mở rộng hồ sơ, bằng chứng, duyệt và khiếu nại — chỉ ADD IF NOT EXISTS (ngược tương thích).

alter table public.smtf_submit_records
  add column if not exists occurred_at timestamptz,
  add column if not exists violation_code text,
  add column if not exists violation_label text,
  add column if not exists vehicle_class text check (vehicle_class is null or vehicle_class in ('car', 'motorbike')),
  add column if not exists junction_id text,
  add column if not exists camera_id text,
  add column if not exists direction text,
  add column if not exists penalty_amount_min integer,
  add column if not exists penalty_amount_max integer,
  add column if not exists penalty_points integer,
  add column if not exists penalty_source text,
  add column if not exists priority_flag boolean not null default false,
  add column if not exists priority_reason text;

create table if not exists public.smtf_submit_evidence (
  id integer primary key generated always as identity,
  plate text not null references public.smtf_submit_records,
  kind text not null check (kind in ('before', 'after', 'plate')),
  path text not null,
  unique (plate, kind)
);

alter table public.smtf_submit_evidence enable row level security;
revoke all on public.smtf_submit_evidence from public, anon, authenticated;
grant select, insert, delete on public.smtf_submit_evidence to service_role;

create table if not exists public.smtf_submit_audit (
  id integer primary key generated always as identity,
  plate text not null,
  action text not null check (action in ('confirm', 'dismiss', 'needs_review', 'complaint')),
  note text,
  at timestamptz not null default now()
);

alter table public.smtf_submit_audit enable row level security;
revoke all on public.smtf_submit_audit from public, anon, authenticated;
grant select, insert on public.smtf_submit_audit to service_role;

create table if not exists public.smtf_submit_complaints (
  id integer primary key generated always as identity,
  plate text not null references public.smtf_submit_records,
  kind text not null check (kind in ('priority_yield', 'wrong_plate', 'other')),
  note text,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.smtf_submit_complaints enable row level security;
revoke all on public.smtf_submit_complaints from public, anon, authenticated;
grant select, insert, update on public.smtf_submit_complaints to service_role;

-- Duyệt hồ sơ + khiếu nại: API /api/demo/decision và /api/demo/complaint gọi hai hàm này
-- (hàm trả boolean; API đổi trạng thái + ghi audit trong MỘT bước, không ghi song song ngoài transaction).
create or replace function public.smtf_submit_decision(p_plate text, p_status text, p_action text, p_note text)
returns boolean language plpgsql set search_path = '' as $$
begin
  update public.smtf_submit_records set status = p_status where plate = p_plate;
  if not found then return false; end if;
  insert into public.smtf_submit_audit (plate, action, note) values (p_plate, p_action, p_note);
  return true;
end;
$$;

create or replace function public.smtf_submit_complaint(p_plate text, p_kind text, p_note text)
returns boolean language plpgsql set search_path = '' as $$
begin
  update public.smtf_submit_records set status = 'disputed' where plate = p_plate;
  if not found then return false; end if;
  insert into public.smtf_submit_complaints (plate, kind, note) values (p_plate, p_kind, p_note);
  insert into public.smtf_submit_audit (plate, action, note) values (p_plate, 'complaint', p_note);
  return true;
end;
$$;

revoke all on function public.smtf_submit_decision(text, text, text, text),
  public.smtf_submit_complaint(text, text, text) from public, anon, authenticated;
grant execute on function public.smtf_submit_decision(text, text, text, text),
  public.smtf_submit_complaint(text, text, text) to service_role;

commit;

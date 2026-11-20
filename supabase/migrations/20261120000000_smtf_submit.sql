begin;

create table if not exists public.smtf_submit_junctions (
  junction_id text primary key,
  label text not null
);

create table if not exists public.smtf_submit_cameras (
  camera_id text primary key,
  junction_id text not null references public.smtf_submit_junctions,
  label text not null,
  sample_path text
);

create table if not exists public.smtf_submit_records (
  plate text primary key,
  summary text not null,
  status text not null
);

create table if not exists public.smtf_submit_kpi (
  id integer primary key check (id = 1),
  source text not null check (source = 'sample'),
  wait_avg_s integer not null,
  queue_max integer not null,
  flow_per_node_min integer not null
);

create table if not exists public.smtf_submit_sessions (
  session_id uuid primary key,
  camera_id text references public.smtf_submit_cameras,
  frame_id text,
  captured_at timestamptz,
  slot smallint check (slot in (0, 1)),
  sha256 text,
  claimed_at timestamptz not null,
  claim_id uuid
);

alter table public.smtf_submit_junctions enable row level security;
alter table public.smtf_submit_cameras enable row level security;
alter table public.smtf_submit_records enable row level security;
alter table public.smtf_submit_kpi enable row level security;
alter table public.smtf_submit_sessions enable row level security;

revoke all on public.smtf_submit_junctions, public.smtf_submit_cameras, public.smtf_submit_records,
  public.smtf_submit_kpi, public.smtf_submit_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.smtf_submit_junctions, public.smtf_submit_cameras,
  public.smtf_submit_records, public.smtf_submit_kpi, public.smtf_submit_sessions to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('smtf-submit-20261120', 'smtf-submit-20261120', false, 262144, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Chặn cả policy cũ có phạm vi rộng trong dự án dùng chung.
drop policy if exists smtf_submit_bucket_server_only on storage.objects;
create policy smtf_submit_bucket_server_only on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'smtf-submit-20261120') with check (bucket_id <> 'smtf-submit-20261120');

create or replace function public.smtf_submit_claim_frame(p_session uuid, p_claim uuid)
returns smallint language sql set search_path = '' as $$
  insert into public.smtf_submit_sessions as previous (session_id, claimed_at, claim_id)
  values (p_session, statement_timestamp(), p_claim)
  on conflict (session_id) do update
    set claimed_at = excluded.claimed_at, claim_id = excluded.claim_id
    where previous.claimed_at <= excluded.claimed_at - interval '3 seconds'
      and (previous.claim_id is null or previous.claimed_at <= excluded.claimed_at - interval '20 seconds')
  returning (1 - coalesce(slot, 1))::smallint;
$$;

create or replace function public.smtf_submit_finish_frame(
  p_session uuid, p_claim uuid, p_camera text, p_frame text, p_sha text
) returns boolean language plpgsql set search_path = '' as $$
begin
  if p_sha is null then
    update public.smtf_submit_sessions set claim_id = null
      where session_id = p_session and claim_id = p_claim;
  else
    update public.smtf_submit_sessions
      set claim_id = null, slot = 1 - coalesce(slot, 1), captured_at = claimed_at,
        camera_id = p_camera, frame_id = p_frame, sha256 = p_sha
      where session_id = p_session and claim_id = p_claim
        and claimed_at > statement_timestamp() - interval '10 seconds';
  end if;
  return found;
end;
$$;

revoke all on function public.smtf_submit_claim_frame(uuid, uuid),
  public.smtf_submit_finish_frame(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.smtf_submit_claim_frame(uuid, uuid),
  public.smtf_submit_finish_frame(uuid, uuid, text, text, text) to service_role;

commit;

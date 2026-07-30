create extension if not exists pgcrypto;

create table if not exists public.tracks (
  track_id varchar primary key,
  branch_id uuid,
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  participant_id uuid primary key,
  nickname varchar,
  roulette_joined boolean,
  last_participated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.track_logs (
  log_id uuid primary key default gen_random_uuid(),
  participant_id uuid references public.participants(participant_id),
  track_id varchar references public.tracks(track_id),
  access_time timestamptz not null default now(),
  game_start_count int4 not null default 0,
  share_clicked boolean not null default false
);

insert into public.tracks (track_id, is_shared)
values ('local-dev-track', false)
on conflict (track_id) do nothing;

alter table public.tracks enable row level security;
alter table public.participants enable row level security;
alter table public.track_logs enable row level security;

grant select on public.tracks to anon;
grant insert, update on public.participants to anon;
grant insert on public.track_logs to anon;

create policy "anon select tracks" on public.tracks
  for select to anon using (true);

create policy "anon insert participants" on public.participants
  for insert to anon with check (true);

create policy "anon update participants" on public.participants
  for update to anon using (true) with check (true);

create policy "anon insert track_logs" on public.track_logs
  for insert to anon with check (true);

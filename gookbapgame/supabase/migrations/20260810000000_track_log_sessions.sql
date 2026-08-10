-- LOCAL DEV ONLY — 프로덕션에 db push 하지 말 것.
-- 프로덕션에는 구자건이 이미 적용해 둔 것을 로컬에서 흉내내는 것뿐이다
-- (gookbapanalyze/AGENTS.md "Session Management", 2026-08-10 커밋 a4a6416).
-- anon의 track_logs 직접 INSERT 권한이 삭제되고, 대신 30분 세션 기반의
-- add_track_log / update_track_log_action RPC를 통해서만 로그를 남긴다.

-- 익명 INSERT 경로 제거. 이제 RPC(SECURITY DEFINER)만이 track_logs에 쓴다.
drop policy if exists "anon insert track_logs" on public.track_logs;
revoke insert on public.track_logs from anon;

-- 문서상 track_logs의 participant_id FK는 CASCADE인데 기존 마이그레이션에는 빠져 있었다.
-- participant_sessions가 두 테이블을 모두 CASCADE로 참조하므로 여기서 맞춰준다
-- (안 맞추면 참여자 삭제가 FK 위반으로 막힌다).
alter table public.track_logs drop constraint if exists track_logs_participant_id_fkey;
alter table public.track_logs
  add constraint track_logs_participant_id_fkey
  foreign key (participant_id) references public.participants(participant_id) on delete cascade;

create table if not exists public.participant_sessions (
  participant_id uuid primary key references public.participants(participant_id) on delete cascade,
  current_log_id uuid references public.track_logs(log_id) on delete cascade,
  last_requested_at timestamptz not null default now()
);

-- 프론트엔드에 노출되지 않는 순수 내부 상태 저장소라 RLS도 grant도 없다.
alter table public.participant_sessions enable row level security;

-- 세션 타임아웃 30분. 프로덕션 기본값과 맞춘 값이다.
create or replace function public.add_track_log(
  p_participant_id uuid,
  p_track_id varchar default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  -- 30분 이내 활성 세션이 있으면 새 row를 만들지 않고 기존 log_id를 돌려준다.
  -- 이때 p_track_id가 달라져도 무시한다(세션 중 트랙 변경은 덮어쓰지 않음).
  select current_log_id into v_log_id
  from participant_sessions
  where participant_id = p_participant_id
    and last_requested_at > now() - interval '30 minutes';

  if v_log_id is not null then
    update participant_sessions
    set last_requested_at = now()
    where participant_id = p_participant_id;
    return v_log_id;
  end if;

  insert into track_logs (participant_id, track_id)
  values (p_participant_id, p_track_id)
  returning log_id into v_log_id;

  insert into participant_sessions (participant_id, current_log_id, last_requested_at)
  values (p_participant_id, v_log_id, now())
  on conflict (participant_id) do update
    set current_log_id = excluded.current_log_id,
        last_requested_at = excluded.last_requested_at;

  return v_log_id;
end;
$$;

create or replace function public.update_track_log_action(
  p_participant_id uuid,
  p_action text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  -- 활성 세션이 없거나 만료됐으면 강제로 새 세션을 만든 뒤 액션을 기록한다.
  select current_log_id into v_log_id
  from participant_sessions
  where participant_id = p_participant_id
    and last_requested_at > now() - interval '30 minutes';

  if v_log_id is null then
    v_log_id := add_track_log(p_participant_id, null);
  else
    update participant_sessions
    set last_requested_at = now()
    where participant_id = p_participant_id;
  end if;

  if p_action = 'game_start' then
    update track_logs set game_start_count = game_start_count + 1 where log_id = v_log_id;
  elsif p_action = 'share_click' then
    update track_logs set share_clicked = true where log_id = v_log_id;
  end if;
end;
$$;

grant execute on function public.add_track_log(uuid, varchar) to anon;
grant execute on function public.update_track_log_action(uuid, text) to anon;

-- 초대 링크(문서 5단계)를 로컬에서도 만들어볼 수 있게 하는 시드.
-- 기존 local-dev-track에 지점을 달아주고, 같은 지점의 is_shared=true 트랙을 하나 둔다.
update public.tracks
set branch_id = '00000000-0000-0000-0000-0000000000b1'
where track_id = 'local-dev-track' and branch_id is null;

insert into public.tracks (track_id, branch_id, is_shared)
values ('local-dev-shared', '00000000-0000-0000-0000-0000000000b1', true)
on conflict (track_id) do nothing;

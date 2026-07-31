-- gookbapanalyze(대시보드) 로그인에 필요한 accounts 테이블을 테스트용 Supabase
-- 프로젝트에 재현하는 스크립트. gookbapgame 게임 스키마와는 무관.
-- 대시보드 Table Editor 스크린샷 기준: user_id(uuid, FK->auth.users), account_id(text),
-- permission(int4), created_at(timestamptz), is_setup_completed(bool)

create table accounts (
  user_id uuid primary key references auth.users(id),
  account_id text not null unique,
  permission integer not null default 1,
  created_at timestamptz default now(),
  is_setup_completed boolean default false
);

alter table accounts enable row level security;

-- 로그인한 본인이 자기 행을 읽을 수 있어야 loginUser/createAccount의 권한 체크가 동작한다.
create policy "read own account" on accounts for select
  using (auth.uid() = user_id);

-- 최초 최고 관리자 계정을 만든 뒤 아래 INSERT를 실행할 것 (Authentication > Users에서
-- 만든 유저의 UUID로 'YOUR-USER-UUID-HERE'를 교체):
--
-- insert into accounts (user_id, account_id, permission, is_setup_completed)
-- values ('YOUR-USER-UUID-HERE', 'admin', 0, true);

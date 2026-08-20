-- 테스트용 Supabase(로컬 `supabase start` 스택 또는 별도 테스트 프로젝트)에
-- gookbapgame 스키마를 재현하는 스크립트.
--
-- 이 스크립트는 멱등하다 — 이미 만들어진 스택에 다시 실행해도 안전하고,
-- 예전 버전으로 만들어진 스택을 최신 형태로 고치는 용도로도 쓸 수 있다.
-- 실행: docker exec supabase_db_gookbapgame psql -U postgres -f - < scripts/test-db-schema.sql
--       (또는 Supabase SQL Editor에 붙여넣기)
--
-- ## 프로덕션과의 정합성 (2026-07-31 기준, 이란토가 공유한 ER 다이어그램 확인)
-- 아래 3개 컬럼은 프로덕션에서 **jsonb**다. 언어 코드(국가 코드 없음)를 키로 갖는
-- 다국어 맵이며, gookbapanalyze가 `{ ko: '...' }` 형태로 써넣는다:
--   - part_categories.name
--   - parts.name
--   - base_images.title
-- 이 스크립트의 이전 버전은 셋 다 text로 만들었고, 그 탓에 힌트 기능의 로컬 검증이
-- 전부 폴백 문자열("—")로 나오는 문제가 있었다. 아래 do 블록이 기존 스택을 고쳐준다.
--
-- ## 이 스크립트가 담당하지 않는 것
-- participants / track_logs / tracks 는 supabase/migrations/ 쪽에서 관리한다.

-- ---------------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------------

create table if not exists part_categories (
  id bigint generated always as identity primary key,
  name jsonb not null
);

create table if not exists base_images (
  id bigint generated always as identity primary key,
  title jsonb not null,
  image_url text not null,
  level integer not null default 1,
  created_at timestamptz default now()
);

create table if not exists parts (
  id bigint generated always as identity primary key,
  category_id bigint references part_categories(id),
  name jsonb not null,
  image_url text not null,
  offset_x integer,
  offset_y integer,
  scale real
);

create table if not exists image_slots (
  id bigint generated always as identity primary key,
  base_image_id bigint references base_images(id),
  category_id bigint references part_categories(id),
  x_coordinate integer not null,
  y_coordinate integer not null,
  z_index integer default 1,
  scale real
);

-- gookbapanalyze의 /api/generate-unified 가 합성 결과를 캐시하는 테이블.
-- 이게 없으면 게임이 좌/우 장면 이미지를 아예 못 받아서 "게임 데이터를 불러올 수
-- 없습니다"로 떨어진다. PostgREST 에러는 PGRST205 "Could not find the table".
create table if not exists unified_images (
  id uuid primary key default gen_random_uuid(),
  base_image_id bigint references base_images(id),
  image_slots jsonb not null,
  unified_image_url text not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 2. 예전 버전(text)으로 만들어진 스택 고치기
-- ---------------------------------------------------------------------------

do $$
begin
  if (select data_type from information_schema.columns
      where table_schema='public' and table_name='part_categories' and column_name='name') = 'text' then
    alter table public.part_categories alter column name type jsonb using jsonb_build_object('ko', name);
  end if;

  if (select data_type from information_schema.columns
      where table_schema='public' and table_name='parts' and column_name='name') = 'text' then
    alter table public.parts alter column name type jsonb using jsonb_build_object('ko', name);
  end if;

  if (select data_type from information_schema.columns
      where table_schema='public' and table_name='base_images' and column_name='title') = 'text' then
    alter table public.base_images alter column title type jsonb using jsonb_build_object('ko', title);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. RLS 정책 (프론트엔드는 ANON_KEY만 쓴다)
-- ---------------------------------------------------------------------------

alter table part_categories enable row level security;
alter table base_images     enable row level security;
alter table parts           enable row level security;
alter table image_slots     enable row level security;
alter table unified_images  enable row level security;

drop policy if exists "public read" on part_categories;
drop policy if exists "public read" on base_images;
drop policy if exists "public read" on parts;
drop policy if exists "public read" on image_slots;
drop policy if exists "public read" on unified_images;

create policy "public read" on part_categories for select using (true);
create policy "public read" on base_images     for select using (true);
create policy "public read" on parts           for select using (true);
create policy "public read" on image_slots     for select using (true);
create policy "public read" on unified_images  for select using (true);

-- ---------------------------------------------------------------------------
-- 4. GRANT
-- ---------------------------------------------------------------------------
-- RLS 정책만으로는 부족하다 — Postgres 자체의 테이블 권한이 먼저 있어야 롤이 조회를
-- 시도할 수 있다. 클라우드 Supabase는 스키마 초기화 시 자동 부여하지만, 로컬
-- `supabase start` 스택은 수동으로 줘야 한다(안 주면 "permission denied for table").

-- 게임 클라이언트(gookbapgame)가 쓰는 롤.
grant select on public.part_categories to anon;
grant select on public.base_images     to anon;
grant select on public.parts           to anon;
grant select on public.image_slots     to anon;
grant select on public.unified_images  to anon;

-- 합성 API(gookbapanalyze /api/generate-unified)는 SERVICE_ROLE_KEY로 붙어서
-- unified_images에 INSERT하고 Storage에 업로드한다. 이 GRANT가 없으면
-- 42501 "permission denied for table unified_images"로 500이 난다.
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role, postgres;
grant all on all sequences in schema public to service_role, postgres;

-- ---------------------------------------------------------------------------
-- 5. Storage 버킷
-- ---------------------------------------------------------------------------
-- /api/generate-unified 가 합성 결과 webp를 'game_assets' 버킷에 올리고
-- getPublicUrl로 게임에 돌려준다. 버킷이 없으면 업로드 단계에서 500이 난다.
insert into storage.buckets (id, name, public)
values ('game_assets', 'game_assets', true)
on conflict (id) do update set public = true;

-- ---------------------------------------------------------------------------
-- 6. 설문 / 지원 언어
-- ---------------------------------------------------------------------------
-- 컬럼 구성은 gookbapanalyze/app/main/surveys/page.tsx와 AGENTS.md에서 확인한 것을 따른다.

create table if not exists supported_languages (
  lang_code text primary key,
  lang_name text not null,
  is_active boolean not null default true,
  order_index int not null default 0,
  coupon_use_text jsonb
);

create table if not exists survey_questions (
  question_id bigserial primary key,
  survey_phase int not null,
  question_type int not null,
  question_text jsonb not null,
  options jsonb not null default '[]'::jsonb,
  order_index int not null default 0,
  track_id uuid
);

-- `fetchSurveyQuestions`가 select하는 컬럼이라 없으면 조회가 통째로 실패한다
-- (2026-08-13에 힌트 설문을 붙이면서 실기에서 드러났다 — 로컬에서는 문항 조회가
-- 항상 실패하고, 실패 시 힌트를 그냥 내주는 폴백에 가려 조용히 넘어갔다).
--
-- **`is_active`의 필터는 `= true`가 아니라 "false가 아닌 것"이다** — 그쪽 함정
-- 주석은 actions.ts에 있다. 기본값을 true로 두지만 NULL도 활성으로 취급된다.
alter table survey_questions add column if not exists is_active boolean default true;
alter table survey_questions add column if not exists is_required boolean default true;

-- **`check_pending_survey` RPC는 여기 흉내내지 않는다.** 어떤 문항을 제외하는지
-- (`optional_survey_records`와의 관계, phase 2의 track 경로)를 실물로 확인한 적이
-- 없어서 지어낸 함수가 되고, 그러면 로컬 검증이 허구를 확인하게 된다.
-- 없어도 무해하다 — `fetchPendingSurveyQuestionIds`가 빈 배열로 떨어지고
-- 호출부는 "전체에서 무작위"라는 정상 경로를 탄다(스펙 §3의 4번).

-- 컬럼 구성은 gookbapanalyze/app/main/survey-results/actions.ts:54가 조회하는
-- response_id, question_id, participant_id, answer_data, created_at 그대로다.
create table if not exists survey_responses (
  response_id bigserial primary key,
  participant_id uuid not null,
  question_id bigint not null references survey_questions(question_id),
  answer_data jsonb,
  created_at timestamptz not null default now()
);

-- **GRANT를 위쪽 4번 절에 몰아넣을 수 없다** — 그 절은 이 테이블들보다 앞에 있어서
-- 여기 것을 거기 적으면 "relation does not exist"로 죽는다. 테이블 옆에 두는 편이
-- 새 테이블을 추가할 때 빠뜨리지 않는다.
--
-- 이게 없어서 로컬에서는 설문 조회가 늘 42501로 실패했다(2026-08-13에 힌트 설문을
-- 붙이면서 드러났다). 프로덕션 권한과 무관하게 **조용히** 실패하는 것이 문제였다 —
-- 설문 실패 시 흐름을 그냥 진행시키는 폴백이 양쪽 경로에 다 있어서, 로컬에서
-- 설문 화면을 한 번도 못 봤는데도 아무 신호가 없었다.
grant select on public.survey_questions to anon;
grant insert on public.survey_responses to anon;
grant usage, select on all sequences in schema public to anon;

-- ============================================================
-- 9. 쿠폰 테이블 + get_my_coupons 스텁
-- ============================================================
--
-- **프로덕션의 RPC 본문은 볼 수 없다**(마이그레이션 파일이 없는 프로덕션 전용
-- 함수다 — issuedCoupons.ts:46 주석). 여기 있는 것은 반환 컬럼 모양만 맞춘
-- 스텁이며, 발급 조건·확률·동시성 같은 실제 로직은 하나도 재현하지 않는다.
--
-- 왜 필요한가: 이게 없으면 `fetchMyCoupons`가 늘 빈 배열을 돌려줘서 **내 쿠폰
-- 앨범을 로컬에서 띄울 수 없다.** 2026-08-13에 앨범 격자를 만들면서 실제
-- 컴포넌트를 한 번도 마운트하지 못했고, 그 공백에서 blob 오염 버그가 나왔다
-- (A 열기 → 목록 → B 열기에서 A의 이미지가 B 이름으로 저장되는 버그).
--
-- `valid_from`을 반환에 포함한다 — 프로덕션도 2026-08-13에 주는 것이 확인됐다.
/*
 * 뽑기 횟수 제한 설정. 튜토리얼의 "하루 N회" 고지가 이 값을 읽는다
 * (`fetchGatchaLimit` → `gatchaLimitNotice`).
 *
 * 프로덕션에는 운영자가 대시보드에서 관리하는 테이블이 이미 있고, 여기 있는 것은
 * **로컬에서 흉내낸 것**이다 — 이게 없으면 조회가 `PGRST205`(테이블 없음)로 떨어져
 * 안내 줄이 조용히 사라지고, 그것이 폴백인지 버그인지 화면만 봐서는 구분되지 않는다.
 *
 * `id = 1` 한 줄만 두는 제약도 저쪽과 같다.
 */
create table if not exists gatcha_settings (
  id int primary key check (id = 1),
  limit_type varchar not null default 'days',
  limit_n int not null default 1,
  limit_m int not null default 3
);

-- 프로덕션의 `Everyone: SELECT` 정책에 해당한다. 없으면 `42501`(permission denied)로
-- 떨어지는데, 화면에서는 테이블이 없을 때와 **똑같이** 안내 줄이 사라질 뿐이라
-- 구분되지 않는다 — 실제로 이 순서로 두 번 걸렸다.
grant select on public.gatcha_settings to anon;

create table if not exists coupon_effects (
  coupon_effect_id uuid primary key default gen_random_uuid(),
  coupon_type text not null,
  expire_days int,
  expire_type text,
  expire_date timestamptz
);

create table if not exists issued_coupons (
  coupon_id uuid primary key default gen_random_uuid(),
  participant_id uuid not null,
  coupon_effect_id uuid not null references coupon_effects(coupon_effect_id),
  is_used boolean not null default false,
  issued_at timestamptz not null default now(),
  used_at timestamptz,
  expired_at timestamptz,
  valid_from timestamptz
);

create or replace function get_my_coupons(p_id uuid)
returns table (
  coupon_id uuid,
  coupon_effect_id uuid,
  is_used boolean,
  issued_at timestamptz,
  expired_at timestamptz,
  valid_from timestamptz
)
language sql
security definer
set search_path = public
as $$
  select c.coupon_id, c.coupon_effect_id, c.is_used, c.issued_at, c.expired_at, c.valid_from
  from issued_coupons c
  where c.participant_id = p_id
  order by c.issued_at desc;
$$;

grant select on public.coupon_effects to anon;
grant execute on function get_my_coupons(uuid) to anon;

-- ============================================================
-- 10. ranking_view 스텁
-- ============================================================
--
-- **반환 컬럼 모양만 맞춘 스텁이다.** 프로덕션은 `participants` → `nickname_presets`
-- 조인으로 이 뷰를 만들지만, 로컬에는 그 테이블들이 없거나 형태가 달라 재현하려 하면
-- 시간만 버린다 — 위 `get_my_coupons` 스텁과 같은 방침이다.
--
-- 왜 필요한가: 이게 없으면 랭킹 화면을 로컬에서 **실제 컴포넌트로 띄울 수 없다.**
-- 2026-08-13에 쿠폰 앨범을 손으로 조립한 DOM만 보고 넘겼다가 blob 오염 버그를 놓친
-- 전례가 있다.
--
-- `nickname_number`는 **text**다. 프로덕션 샘플이 `0614`처럼 앞자리 0을 갖고 있어
-- 숫자로 만들면 `0614`와 `614`가 같은 사람으로 합쳐진다(그룹 키가 번호를 포함한다).
create table if not exists ranking_plays (
  play_id bigserial primary key,
  nickname_first jsonb not null,
  nickname_last  jsonb not null,
  nickname_number text,
  best_score int not null default 0,
  gookbap_score int not null default 0,
  joined_time timestamptz not null default now()
);

-- 프로덕션 뷰의 반환 컬럼 그대로: nickname_first / nickname_last / nickname_number /
-- best_score / gookbap_score / joined_time. **`participant_id`는 내보내지 않는다** —
-- 프로덕션 뷰가 그것을 의도적으로 제외했고(노출되면 남의 쿠폰을 가로챌 수 있다),
-- 스텁에 넣으면 클라이언트가 그 컬럼에 의존하는 코드를 쓸 수 있게 된다.
create or replace view ranking_view as
  select nickname_first, nickname_last, nickname_number, best_score, gookbap_score, joined_time
  from ranking_plays;

-- 뷰는 테이블과 별도로 GRANT가 필요하다. **이 GRANT를 위쪽 4번 절로 올리지 말 것** —
-- 그 절은 이 뷰보다 앞에 있어서 "relation does not exist"로 죽는다(같은 파일의
-- survey_questions GRANT 주석과 같은 함정이다).
grant select on public.ranking_view to anon;

-- ============================================================
-- 11. game_score_logs + get_my_score_logs 스텁
-- ============================================================
--
-- **반환 컬럼 모양만 맞춘 스텁이다**(`get_my_coupons`·`ranking_view`와 같은 방침).
-- 프로덕션 RPC 본문은 볼 수 없다.
--
-- 왜 필요한가: 랭킹 화면의 "내 최고점"이 이 RPC로 온다(`fetchMyBestScore`). 없으면
-- 그 줄이 조용히 사라지고 — 기록 없음·조회 실패를 둘 다 "안 띄운다"로 처리하기
-- 때문에 — 로컬에서 **구현이 맞는지 확인할 방법이 없다.**
--
-- `submitGameScore`가 이 테이블에 직접 insert하므로(anon INSERT 허용) 게임을 한 판
-- 돌리면 행이 쌓인다. 즉 시드로 미리 넣지 않아도 실기 확인이 가능하다.
create table if not exists game_score_logs (
  log_id uuid primary key default gen_random_uuid(),
  participant_id uuid not null,
  best_score int not null default 0,
  gookbap_score int not null default 0,
  joined_time timestamptz not null default now()
);

create or replace function get_my_score_logs(p_id uuid)
returns table (
  log_id uuid,
  participant_id uuid,
  best_score int,
  gookbap_score int,
  joined_time timestamptz
)
language sql
security definer
set search_path = public
as $$
  select g.log_id, g.participant_id, g.best_score, g.gookbap_score, g.joined_time
  from game_score_logs g
  where g.participant_id = p_id
  order by g.joined_time desc;
$$;

grant insert on public.game_score_logs to anon;
grant execute on function get_my_score_logs(uuid) to anon;

-- 약관·개인정보처리방침·쿠폰 이용안내 본문(2026-08-20 대시보드 이관).
-- 실물은 `doc_id` varchar PK / `body` jsonb / `updated_at` timestamptz이고 RLS가
-- `Everyone SELECT`다(저쪽 AGENTS.md 16번). 여기서는 anon select 권한만 흉내낸다.
--
-- **없어도 게임은 돈다** — 클라이언트가 조회 실패를 번들 본문으로 덮기 때문이다
-- (`useAgreementBody`). 그래서 이 픽스처가 없으면 **DB 경로가 한 번도 실행되지 않은 채
-- 통과한다.** 폴백만 보고 "붙었다"고 판단하지 말 것.
create table if not exists public.agreements (
  doc_id varchar primary key,
  body jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select on public.agreements to anon;

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

-- gookbapgame 게임 플레이 검증용 테스트 데이터.
-- scripts/test-db-schema.sql로 테이블을 먼저 만든 뒤 실행할 것.
--
-- 실행: docker exec -i supabase_db_gookbapgame psql -U postgres < scripts/test-db-seed.sql
--       (또는 Supabase SQL Editor에 붙여넣기)
--
-- 이 스크립트는 멱등하다 — 관련 테이블을 비우고 id를 1부터 다시 채운다.
-- unified_images(합성 캐시)도 함께 비운다. 파츠/슬롯이 바뀌면 기존 캐시가
-- 무효해지기 때문이다. 캐시는 게임을 한 번 돌리면 자동으로 다시 쌓인다.
--
-- ## 이 데이터의 의도
-- 이미지는 전부 picsum.photos 외부 URL이라 Storage에 아무것도 올릴 필요가 없다.
-- STAGE_CONFIG(app/lib/stageConfig.ts)가 레벨 1~6은 diffCount 5, 레벨 7은 7을
-- 요구하므로, 배경 7장에 각각 그만큼의 슬롯을 배치해 7단계 완주가 가능하게 했다.
--
-- 카테고리가 하나뿐이고 모든 슬롯이 그 카테고리를 쓴다는 점은 의도된 것이다 —
-- 힌트 목록에 같은 카테고리명이 여러 줄 반복되므로, "이름이 겹쳐도 줄을 합치지
-- 않는다"(줄 수 == 차이 슬롯 수)는 요구사항을 로컬에서 그대로 검증할 수 있다.
--
-- name/title은 프로덕션과 같은 jsonb 다국어 맵이다. ko만이 아니라 en/ja도
-- 채워두어 언어 토글 동작까지 로컬에서 확인할 수 있게 했다.

truncate table unified_images, image_slots, parts, base_images, part_categories restart identity cascade;

-- ---------------------------------------------------------------------------
-- 카테고리 (1개)
-- ---------------------------------------------------------------------------
insert into part_categories (name) values
  ('{"ko":"메인 국밥그릇","en":"Main Gukbap Bowl","ja":"メインクッパの器"}'::jsonb);

-- ---------------------------------------------------------------------------
-- 배경 (레벨 1~7, 각 1장)
-- ---------------------------------------------------------------------------
insert into base_images (title, image_url, level) values
  ('{"ko":"테스트 배경"}'::jsonb,     'https://picsum.photos/1200/800',                  1),
  ('{"ko":"테스트 배경 Lv2"}'::jsonb, 'https://picsum.photos/seed/gookbap-lv2/1200/800', 2),
  ('{"ko":"테스트 배경 Lv3"}'::jsonb, 'https://picsum.photos/seed/gookbap-lv3/1200/800', 3),
  ('{"ko":"테스트 배경 Lv4"}'::jsonb, 'https://picsum.photos/seed/gookbap-lv4/1200/800', 4),
  ('{"ko":"테스트 배경 Lv5"}'::jsonb, 'https://picsum.photos/seed/gookbap-lv5/1200/800', 5),
  ('{"ko":"테스트 배경 Lv6"}'::jsonb, 'https://picsum.photos/seed/gookbap-lv6/1200/800', 6),
  ('{"ko":"테스트 배경 Lv7"}'::jsonb, 'https://picsum.photos/seed/gookbap-lv7/1200/800', 7);

-- ---------------------------------------------------------------------------
-- 파츠 (2개)
-- 한 슬롯을 "다른 그림"으로 만들려면 카테고리당 최소 2개가 필요하다 —
-- app/actions.ts의 유효 슬롯 판정이 slotParts.length >= 2 를 요구한다.
-- ---------------------------------------------------------------------------
insert into parts (category_id, name, image_url, offset_x, offset_y, scale) values
  (1, '{"ko":"빨간국밥","en":"Red Gukbap","ja":"赤いクッパ"}'::jsonb,  'https://picsum.photos/seed/red/100/100',  0, 0, 1),
  (1, '{"ko":"파란국밥","en":"Blue Gukbap","ja":"青いクッパ"}'::jsonb, 'https://picsum.photos/seed/blue/100/100', 0, 0, 1);

-- ---------------------------------------------------------------------------
-- 슬롯 (레벨 1~6은 5개씩, 레벨 7은 7개 = 총 37개)
-- 좌표는 1200x800 배경 기준. actions.ts가 (x,y,scale) 조합으로 중복을 제거하므로
-- 같은 배경 안에서는 좌표가 서로 달라야 한다.
-- ---------------------------------------------------------------------------
insert into image_slots (base_image_id, category_id, x_coordinate, y_coordinate, z_index, scale) values
  (1, 1, 500, 300, 1, 1),
  (1, 1, 100, 100, 1, 1),
  (1, 1, 900, 100, 1, 1),
  (1, 1, 100, 600, 1, 1),
  (1, 1, 900, 600, 1, 1),

  (2, 1, 100, 100, 1, 1),
  (2, 1, 500, 100, 1, 1),
  (2, 1, 900, 100, 1, 1),
  (2, 1, 300, 500, 1, 1),
  (2, 1, 700, 500, 1, 1),

  (3, 1, 100, 100, 1, 1),
  (3, 1, 500, 100, 1, 1),
  (3, 1, 900, 100, 1, 1),
  (3, 1, 300, 500, 1, 1),
  (3, 1, 700, 500, 1, 1),

  (4, 1, 100, 100, 1, 1),
  (4, 1, 500, 100, 1, 1),
  (4, 1, 900, 100, 1, 1),
  (4, 1, 300, 500, 1, 1),
  (4, 1, 700, 500, 1, 1),

  (5, 1, 100, 100, 1, 1),
  (5, 1, 500, 100, 1, 1),
  (5, 1, 900, 100, 1, 1),
  (5, 1, 300, 500, 1, 1),
  (5, 1, 700, 500, 1, 1),

  (6, 1, 100, 100, 1, 1),
  (6, 1, 500, 100, 1, 1),
  (6, 1, 900, 100, 1, 1),
  (6, 1, 300, 500, 1, 1),
  (6, 1, 700, 500, 1, 1),

  (7, 1,  100, 100, 1, 1),
  (7, 1,  400, 100, 1, 1),
  (7, 1,  700, 100, 1, 1),
  (7, 1, 1000, 100, 1, 1),
  (7, 1,  250, 550, 1, 1),
  (7, 1,  600, 550, 1, 1),
  (7, 1,  950, 550, 1, 1);

-- ---------------------------------------------------------------------------
-- 지원 언어 / 설문 문항
-- ---------------------------------------------------------------------------
insert into supported_languages (lang_code, lang_name, is_active, order_index, coupon_use_text)
values
  ('ko', '한국어', true, 1, '{"expired_coupon": "만료된 쿠폰입니다. (만료일: {{expired_date}})", "already_used_coupon": "이미 사용된 쿠폰입니다.", "load_error": "쿠폰 정보를 불러오지 못했습니다."}'::jsonb),
  ('en', 'English', true, 2, '{"expired_coupon": "This coupon expired on {{expired_date}}.", "already_used_coupon": "This coupon was already used.", "load_error": "Failed to load coupon."}'::jsonb),
  ('ja', '日本語', true, 3, '{"expired_coupon": "このクーポンは{{expired_date}}に期限切れです。", "already_used_coupon": "使用済みのクーポンです。", "load_error": "クーポン情報を取得できませんでした。"}'::jsonb)
on conflict (lang_code) do nothing;

-- Phase 1 = 쿠폰 받기 전 노출되는 질문. question_id를 고정해 멱등하게 만든다.
insert into survey_questions (question_id, survey_phase, question_type, question_text, options, order_index)
values
  (9001, 1, 0, '{"ko": "국밥을 얼마나 자주 드시나요?", "en": "How often do you eat gookbap?"}'::jsonb,
         '[{"ko": "주 1회", "en": "Once a week"}, {"ko": "주 3회 이상", "en": "3+ times a week"}]'::jsonb, 1),
  (9002, 1, 1, '{"ko": "좋아하는 반찬을 모두 고르세요", "en": "Pick all side dishes you like"}'::jsonb,
         '[{"ko": "깍두기", "en": "Kkakdugi"}, {"ko": "김치", "en": "Kimchi"}, {"ko": "양파", "en": "Onion"}]'::jsonb, 2),
  (9003, 1, 2, '{"ko": "한마디 남겨주세요", "en": "Leave us a comment"}'::jsonb,
         '[{"ko": "자유롭게 적어주세요", "en": "Write freely"}]'::jsonb, 3),
  -- Phase 0 = 게임 중 힌트를 처음 열 때 뜨는 설문(2026-08-13). 전부 단일 선택(type 0)
  -- 이고 필수다.
  --
  -- 9000은 **프로덕션 실제 문항을 그대로 옮긴 것이다**(2026-08-13에 이란토가 뜬 덤프).
  -- 세 번째 선택지에 `en`·`ja`가 없는 것도 실물 그대로다 — resolveLocalizedName의
  -- 한국어 폴백이 실제로 걸리는지 로컬에서 볼 수 있어야 한다. 임의 문구로 바꾸지 말 것.
  --
  -- 9004는 프로덕션에 없는 로컬 전용 추가분이다. 프로덕션이 1건뿐이라 무작위 1건
  -- 선택이 실제로 갈리는지 확인할 수 없어서 둘로 만들었다(2~3건으로 늘 예정이므로
  -- 그 상태를 미리 재현하는 셈이다).
  (9000, 0, 0, '{"ko": "나는 여기에 ", "en": "I came here ", "ja": "私はここに"}'::jsonb,
         '[{"ko": "혼자 왔다", "en": "Alone", "ja": "一人で来た"}, {"ko": "여럿이 왔다", "en": "With companions", "ja": "同行者と一緒に来た"}, {"ko": "온라인 방문이다"}]'::jsonb, 1),
  (9004, 0, 0, '{"ko": "매장에 처음 오셨나요?", "en": "Is this your first visit?", "ja": "初めてのご来店ですか？"}'::jsonb,
         '[{"ko": "처음이에요", "en": "First time", "ja": "初めてです"}, {"ko": "여러 번 왔어요", "en": "Been here before", "ja": "何度も来ました"}]'::jsonb, 2)
on conflict (question_id) do nothing;

-- 쿠폰 — 내 쿠폰 앨범의 남은 일수 표시를 구간마다 확인하기 위한 것이다(2026-08-13).
--
-- **날짜를 고정 문자열로 박지 말 것.** `now()` 기준 상대값이어야 며칠 뒤에 시드를
-- 다시 부어도 같은 구간이 나온다. `expired_at`은 프로덕션과 같이 KST 23:59:59.999로
-- 맞춘다 — 그래야 KST 날짜 경계 계산(`couponRemaining.ts`)이 실물과 같은 값을 본다.
--
-- **participant_id를 미리 알 수 없다.** 그 값은 브라우저 토큰의 해시이고
-- (`actions.ts`의 `resolveParticipantId`), 토큰은 기기마다 새로 발급된다. 그래서
-- 아래 UUID는 자리표시자이며, 이 상태로는 앨범에 아무것도 뜨지 않는다.
--
-- 쓰는 방법: 게임을 한 번 띄운 뒤 실제 participant_id로 갈아끼운다.
--
--   update issued_coupons set participant_id = '<진짜 uuid>'
--   where participant_id = '00000000-0000-4000-8000-000000000001';
--
-- 진짜 uuid는 `select participant_id from participants order by created_at desc limit 1;`
-- 로 얻는다(게임을 띄우면 `ensureParticipant`가 행을 만든다).
-- 뽑기 횟수 제한. 프로덕션 기본값(대시보드 select의 기본)과 같은 'days' / 1일 / 3회다.
-- `limit_type`을 'hours'로 바꾸면 튜토리얼 문구가 "N시간 동안"으로 갈리는 것을
-- 로컬에서 확인할 수 있다(`gatchaLimitNotice`).
insert into gatcha_settings (id, limit_type, limit_n, limit_m)
values (1, 'days', 1, 3)
on conflict (id) do nothing;

insert into coupon_effects (coupon_effect_id, coupon_type)
values
  ('c0000000-0000-4000-8000-000000000001',
   '{"ko": "국밥 한 그릇 무료", "en": "Free bowl of gookbap", "ja": "クッパ1杯無料"}'),
  ('c0000000-0000-4000-8000-000000000002',
   '{"ko": "음료 서비스", "en": "Free drink", "ja": "ドリンクサービス"}'),
  ('c0000000-0000-4000-8000-000000000003',
   '{"ko": "수육 소자 3,000원 할인", "en": "3,000 KRW off boiled pork", "ja": "ゆで豚3,000ウォン割引"}')
on conflict (coupon_effect_id) do nothing;

-- "KST 기준 오늘부터 N일 뒤의 23:59:59.999"를 프로덕션과 같은 형태로 만든다.
--
-- **`current_date at time zone 'Asia/Seoul'`을 쓰지 말 것.** 그것은 date를 timestamp로
-- 올린 뒤 그 값을 KST 지역시각으로 **해석해서** UTC로 환산하므로 UTC 09:00(= KST 18:00)이
-- 되고, 남은 일수가 하루씩 밀린다. 2026-08-13에 실제로 그렇게 넣었다가 DB에서 실측해
-- 잡았다(의도한 0·1·3·4일이 1·2·4·5일로 나왔다). KST 날짜를 먼저 구하고, 그 날짜의
-- 시각을 KST로 **지정**해야 한다 — 아래 함수가 그 순서다.
create or replace function seed_kst_end_of_day(days_from_today int)
returns timestamptz
language sql
stable
as $$
  select (((now() at time zone 'Asia/Seoul')::date + days_from_today + interval '23:59:59.999')
          at time zone 'Asia/Seoul');
$$;

insert into issued_coupons (coupon_id, participant_id, coupon_effect_id, is_used, issued_at, expired_at, valid_from)
values
  -- 오늘까지 (0일 남음 — 강조)
  ('d0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', false, now(),
   seed_kst_end_of_day(0), now() - interval '3 days'),
  -- 1일 남음 (강조)
  ('d0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000002', false, now() - interval '1 hour',
   seed_kst_end_of_day(1), now() - interval '1 day'),
  -- 3일 남음 (강조 경계 안쪽)
  ('d0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000003', false, now() - interval '2 hours',
   seed_kst_end_of_day(3), now()),
  -- 4일 남음 (강조 경계 바깥 — 평범하게 보여야 한다)
  ('d0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', false, now() - interval '3 hours',
   seed_kst_end_of_day(4), now()),
  -- 만료됨 (어제까지였다)
  ('d0000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000002', false, now() - interval '10 days',
   seed_kst_end_of_day(-1), now() - interval '10 days'),
  -- 사용 완료 (만료일이 남아 있어도 '사용 완료'가 먼저다)
  ('d0000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000003', true, now() - interval '5 days',
   seed_kst_end_of_day(10), now() - interval '5 days'),
  -- 만료일 없음 (무기한 — 상태 줄이 아예 없어야 한다). 2026-08-12 이전 발급분이
  -- 실제로 이 상태다(expire_type 컬럼 추가 전에 발급된 8건).
  ('d0000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', false, now() - interval '20 days', null, null)
on conflict (coupon_id) do nothing;

-- ============================================================
-- 랭킹 시드 (ranking_view 스텁의 원본 테이블)
-- ============================================================
--
-- **날짜는 전부 `now()` 기준 상대값이다.** 고정 문자열로 박으면 며칠 뒤 다시 부었을 때
-- daily/weekly/monthly 구간이 달라져 시드가 검증 도구로서 쓸모없어진다.
--
-- KST 자정을 만들 때 `current_date at time zone 'Asia/Seoul'`을 쓰지 말 것 — 하루 밀린다
-- (위 `seed_kst_end_of_day` 주석의 함정과 같다). KST 날짜를 먼저 구하고 그 날짜의 시각을
-- KST로 **지정**하는 순서다.
create or replace function seed_kst_start_of_day(days_from_today int)
returns timestamptz
language sql
stable
as $$
  select (((now() at time zone 'Asia/Seoul')::date + days_from_today)::timestamp
          at time zone 'Asia/Seoul');
$$;

-- 멱등성: bigserial PK라 on conflict를 쓸 수 없으므로 시드 블록을 통째로 지우고 다시 넣는다.
-- 이 테이블은 로컬 픽스처 전용이라 지워도 잃을 것이 없다.
delete from ranking_plays;

insert into ranking_plays (nickname_first, nickname_last, nickname_number, best_score, gookbap_score, joined_time)
values
  -- ── 같은 닉네임의 여러 기록. 최고점(1953) 한 줄로 줄어야 한다 ──
  ('{"ko":"활기찬","en":"Energetic","ja":"活気ある"}'::jsonb,
   '{"ko":"뚝배기","en":"Earthen Pot","ja":"トゥッペギ"}'::jsonb,
   '0614', 0, 1200, seed_kst_start_of_day(0) + interval '9 hours'),
  ('{"ko":"활기찬","en":"Energetic","ja":"活気ある"}'::jsonb,
   '{"ko":"뚝배기","en":"Earthen Pot","ja":"トゥッペギ"}'::jsonb,
   '0614', 0, 1953, seed_kst_start_of_day(0) + interval '10 hours'),
  ('{"ko":"활기찬","en":"Energetic","ja":"活気ある"}'::jsonb,
   '{"ko":"뚝배기","en":"Earthen Pot","ja":"トゥッペギ"}'::jsonb,
   '0614', 0, 800, seed_kst_start_of_day(0) + interval '11 hours'),

  -- ── KST 00:00~09:00 구간. `kstDayStart` 재사용의 9시간 구멍이 정확히 여기를 삼킨다 ──
  -- 이 두 줄이 daily 탭에서 사라지면 경계 계산이 `Z`로 만들어진 것이다.
  ('{"ko":"부지런한","en":"Diligent","ja":"勤勉な"}'::jsonb,
   '{"ko":"국밥","en":"Gookbap","ja":"クッパ"}'::jsonb,
   '0001', 0, 1900, seed_kst_start_of_day(0) + interval '30 minutes'),
  ('{"ko":"새벽의","en":"Dawn","ja":"夜明けの"}'::jsonb,
   '{"ko":"한그릇","en":"One Bowl","ja":"一杯"}'::jsonb,
   '0002', 0, 1850, seed_kst_start_of_day(0) + interval '8 hours'),

  -- ── 동점 + joined_time 차이. 이른 쪽(#0010)이 위여야 한다 ──
  ('{"ko":"성실한","en":"Steady","ja":"誠実な"}'::jsonb,
   '{"ko":"수육","en":"Boiled Pork","ja":"ゆで豚"}'::jsonb,
   '0010', 0, 1500, seed_kst_start_of_day(0) + interval '3 hours'),
  ('{"ko":"성실한","en":"Steady","ja":"誠実な"}'::jsonb,
   '{"ko":"수육","en":"Boiled Pork","ja":"ゆで豚"}'::jsonb,
   '0011', 0, 1500, seed_kst_start_of_day(0) + interval '7 hours'),

  -- ── 번호가 null인 행 2건. **합쳐지지 않아야 한다** ──
  -- 단어 조합까지 같으므로, 번호를 빈 문자열로 취급하는 구현에서는 한 줄로 뭉친다.
  ('{"ko":"무명의","en":"Nameless","ja":"無名の"}'::jsonb,
   '{"ko":"손님","en":"Guest","ja":"お客"}'::jsonb,
   null, 0, 1400, seed_kst_start_of_day(0) + interval '4 hours'),
  ('{"ko":"무명의","en":"Nameless","ja":"無名の"}'::jsonb,
   '{"ko":"손님","en":"Guest","ja":"お客"}'::jsonb,
   null, 0, 1300, seed_kst_start_of_day(0) + interval '5 hours'),

  -- ── 번역이 한국어만 있는 프리셋. `formatNickname`이 통째로 한국어로 떨어지는 경로다 ──
  -- **그래도 ko/en의 그룹 수는 같아야 한다**(키가 로케일과 무관하므로).
  -- 두 사람 모두 en 번역이 없어서, 표시 문자열을 키로 쓰면 이 둘이 합쳐질 수 있다.
  ('{"ko":"수줍은"}'::jsonb, '{"ko":"깍두기"}'::jsonb,
   '0020', 0, 1700, seed_kst_start_of_day(0) + interval '2 hours'),
  ('{"ko":"수줍은"}'::jsonb, '{"ko":"깍두기"}'::jsonb,
   '0021', 0, 1600, seed_kst_start_of_day(0) + interval '6 hours'),

  -- ── 기간 경계에 걸친 행 ──
  -- 어제(daily에는 없고 weekly에는 있다 — 단, 오늘이 월요일이면 weekly에서도 빠진다)
  ('{"ko":"어제의","en":"Yesterday","ja":"昨日の"}'::jsonb,
   '{"ko":"국밥","en":"Gookbap","ja":"クッパ"}'::jsonb,
   '0030', 0, 1990, seed_kst_start_of_day(-1) + interval '12 hours'),
  -- 이번 달 1일 KST 00:30 (monthly 경계 + 9시간 구멍 조합)
  ('{"ko":"월초의","en":"Month Start","ja":"月初の"}'::jsonb,
   '{"ko":"솥밥","en":"Pot Rice","ja":"釜飯"}'::jsonb,
   '0040', 0, 1980,
   ((date_trunc('month', (now() at time zone 'Asia/Seoul')::date::timestamp))::timestamp
    at time zone 'Asia/Seoul') + interval '30 minutes'),
  -- 지난달 (monthly에는 없고 total에만 있다)
  ('{"ko":"지난달의","en":"Last Month","ja":"先月の"}'::jsonb,
   '{"ko":"뚝배기","en":"Earthen Pot","ja":"トゥッペギ"}'::jsonb,
   '0050', 0, 1995, seed_kst_start_of_day(0) - interval '45 days'),
  -- 작년 (total에만 있다). 최고점이라 total 1위여야 한다.
  ('{"ko":"작년의","en":"Last Year","ja":"昨年の"}'::jsonb,
   '{"ko":"한그릇","en":"One Bowl","ja":"一杯"}'::jsonb,
   '0060', 0, 1999, seed_kst_start_of_day(0) - interval '400 days');

-- 약관 3종. **프로덕션의 현재 값과 같은 자리표시자다**(2026-08-20 덤프,
-- `docs/client/20260820_agreements_rows.json`). 저쪽이 아직 본문을 채우지 않았으므로
-- 로컬도 같은 상태로 둔다 — 화면에 "입력해주세요"가 뜨면 DB 경로가 산 것이고,
-- 실제 약관 문장이 뜨면 폴백(번들 본문)이 걸린 것이다. 이 구분이 이 시드의 쓸모다.
insert into public.agreements (doc_id, body) values
  ('terms',   '{"ko": "이용약관 내용을 입력해주세요."}'::jsonb),
  ('privacy', '{"ko": "개인정보처리방침 내용을 입력해주세요."}'::jsonb),
  ('coupon',  '{"ko": "쿠폰 이용 안내 내용을 입력해주세요."}'::jsonb)
on conflict (doc_id) do nothing;

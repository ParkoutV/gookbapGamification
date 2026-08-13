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

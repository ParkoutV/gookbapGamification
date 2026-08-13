-- PostgREST 행 상한 검증용 채움 행. **평소에는 붓지 않는다.**
--
-- 왜 따로 뺐나: 이 1200행은 닉네임 번호가 전부 달라 **1200개의 별개 그룹**이 되고,
-- 그러면 `total` 탭이 늘 '일부만 집계' 안내를 띄운다. 표시 상한·빈 목록 같은 다른
-- 동작을 확인할 때 그 안내가 계속 끼어들어 방해가 된다.
--
-- 상한에 걸리면 **오류 없이 앞부분만 돌아온다.** 닉네임당 최고점을 구하려면 모든 행이
-- 필요하므로 잘린 응답으로 계산한 랭킹은 조용히 틀린다. `fetchRanking`이 `count`와
-- 응답 길이를 비교해 이것을 감지하는데, 그 경로를 실제로 밟으려면 상한을 넘는 행이
-- 필요하다. 그 검증을 할 때만 부을 것:
--
--   docker exec -i supabase_db_gookbapgame psql -U postgres < docs/test-db/ranking-filler.sql
--
-- 되돌리기:
--
--   delete from ranking_plays where nickname_first->>'ko' = '채움';
--
-- 로컬 실측 상한은 1000행이다(컨테이너 env PGRST_DB_MAX_ROWS=1000, 그리고 1215행을
-- 넣고 select=* 호출 시 Content-Range: 0-999/1215 + HTTP 200 + error null).
-- **코드에 1000을 박지 말 것** — `count > rows.length`로 판정한다.
--
-- 점수를 낮게(n % 100), 시각을 아주 과거로 두는 이유: total 탭만 상한에 걸리고
-- (daily/weekly/monthly는 서버 필터가 걸러낸다) 검증용 시드가 상위권에 남는다.

insert into ranking_plays (nickname_first, nickname_last, nickname_number, best_score, gookbap_score, joined_time)
select
  '{"ko":"채움","en":"Filler","ja":"詰め"}'::jsonb,
  '{"ko":"행","en":"Row","ja":"行"}'::jsonb,
  lpad(n::text, 4, '0'),
  0,
  n % 100,
  seed_kst_start_of_day(0) - interval '700 days' - (n || ' seconds')::interval
from generate_series(1, 1200) as n;

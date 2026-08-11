-- LOCAL DEV ONLY — 프로덕션에 db push 하지 말 것.
-- '온라인' 지점(특정 매장이 아닌 광고·입소문 유입을 담는 지점)의 공유 트랙을
-- 로컬에서도 재현해서, FALLBACK_SHARED_TRACK_ID 폴백 경로를 테스트할 수 있게 한다.
--
-- **트랙 id는 로컬 전용 더미다.** 프로덕션의 실제 온라인 트랙 코드를 여기 박지 말 것 —
-- 그 코드는 저쪽에서 바뀔 수 있고(2026-08-10에 실제로 한 번 교체됐다), 죽은 코드가
-- 시드에 남으면 "프로덕션에 있는 트랙"으로 오해하게 된다. 실제 값은 Vercel 환경변수와
-- 각자의 .env.local에만 둔다.
--
-- 로컬에서 이 경로를 테스트하려면 .env.local에
--   FALLBACK_SHARED_TRACK_ID=local-online-shared
-- 를 넣으면 된다.
insert into public.tracks (track_id, branch_id, is_shared)
values ('local-online-shared', '00000000-0000-0000-0000-00000000000e', true)
on conflict (track_id) do nothing;

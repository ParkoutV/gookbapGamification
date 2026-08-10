-- LOCAL DEV ONLY — 프로덕션에 db push 하지 말 것.
-- 프로덕션에 이미 만들어져 있는 '온라인' 지점의 공유 트랙(ujYmSz33)을 로컬에서도
-- 재현한다. FALLBACK_SHARED_TRACK_ID를 프로덕션과 같은 값으로 두고 테스트할 수 있게
-- 하려는 것뿐이다.
--
-- 이 트랙은 특정 매장이 아니라 온라인 광고·입소문 유입을 담는 임시 조치다.
-- 온라인 유입의 KPI 수집은 저쪽에서 아직 설계된 바 없어서(2026-08-10 담당자 확인),
-- 정식 방침이 나오면 이 시드와 FALLBACK_SHARED_TRACK_ID 처리도 함께 재검토할 것.
insert into public.tracks (track_id, branch_id, is_shared)
values ('ujYmSz33', '00000000-0000-0000-0000-00000000000e', true)
on conflict (track_id) do nothing;

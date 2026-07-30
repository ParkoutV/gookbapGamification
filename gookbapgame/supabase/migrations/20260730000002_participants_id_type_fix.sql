-- participant_id를 UUID에서 varchar로 변경
-- hashToken()이 반환하는 SHA256 hex 문자열(64자)을 저장할 수 있도록 변경

-- 1. track_logs의 외래키 제약 제거
alter table public.track_logs drop constraint track_logs_participant_id_fkey;

-- 2. participants의 participant_id 타입 변경
alter table public.participants alter column participant_id type varchar;

-- 3. track_logs의 participant_id 타입도 변경
alter table public.track_logs alter column participant_id type varchar;

-- 4. 외래키 제약 재생성
alter table public.track_logs add constraint track_logs_participant_id_fkey
  foreign key (participant_id) references public.participants(participant_id);

-- RLS 정책 재생성 (INSERT with check가 제대로 작동하도록)
drop policy if exists "anon insert participants" on public.participants;

create policy "anon insert participants" on public.participants
  for insert to anon with check (true);

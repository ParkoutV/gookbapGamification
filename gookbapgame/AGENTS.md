<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Script Files Policy
All custom Node.js utility and database scripts (e.g. `.mjs` files) should be placed in the `/scripts/` directory and should be excluded from version control. 
*(Note: Framework configuration files like `eslint.config.mjs` and `postcss.config.mjs` must remain in the project root.)*

# Participant Identity (`app/lib/participantToken.ts`, `app/actions.ts`)
게임 클라이언트가 익명 참여자를 식별하는 방식.

- **쿠키 토큰**: `gookbapgame_token`(httpOnly, 만료 2년). `getOrIssueToken()`이 없으면 발급, 있으면 그대로 사용.
- **participant_id 산출**: `hashToken(token)`으로 SHA-256(64자 hex)을 만든 뒤, `resolveParticipantId()`가 앞 32자를 잘라 `8-4-4-4-12` 하이픈 형태(uuid 문자열 형식)로 재배열해서 `participant_id`로 씀. `participants.participant_id`는 프로덕션 기준 실제 `uuid` 타입 컬럼이라 이 포맷팅이 필요함.
- **`ensureParticipant(trackId)`**: `participants`에 `INSERT`(uuid PK 충돌 시 `23505`는 "이미 존재하는 참여자"로 정상 처리, `ON CONFLICT`는 안 씀 — RLS가 걸린 테이블에서 `ON CONFLICT`는 SELECT 정책을 요구해서 실패하기 때문). **신규 참여자일 때만** `track_logs`에 접속 로그를 남김(재방문/새로고침마다 로그가 계속 쌓이는 것을 방지 — `game_start_count` UPDATE가 `(participant_id, track_id)`당 row 1개를 가정하기 때문).
- **`NICKNAME_ASSIGN_API_URL`**: `gookbapanalyze`의 `/api/nickname/assign`을 가리키는 환경변수. 미설정이거나 실패 시 `generateNickname()`으로 로컬 폴백(형용사+명사 조합)하며 `nicknameSynced: false`를 반환 — 이 상태에서는 방문할 때마다 닉네임이 랜덤하게 바뀜(서버에 저장되지 않으므로 정상 동작).
- **로컬 마이그레이션 주의**: `supabase/migrations/`의 `tracks`/`participants`/`track_logs` 관련 마이그레이션은 이란토가 공유한 ER 다이어그램 스크린샷과 산문 설명을 근거로 재구성한 로컬 전용 스키마이며, 실제 프로덕션 Supabase의 RLS 정책을 직접 확인한 적이 없음. 로컬에서 통과했다고 프로덕션에서도 동일하게 동작함이 보장되지 않으므로 **프로덕션에 `db push` 하지 말 것**. 배포 전 구자건에게 `participants`/`track_logs` 실제 RLS 정책 확인 필요.

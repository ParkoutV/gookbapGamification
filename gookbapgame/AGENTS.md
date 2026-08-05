<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 게임을 실제로 띄워서 확인해야 할 때
`docs/local-test-setup.md`를 먼저 읽을 것. 단위 테스트(`npm test`)만 돌릴 거면 필요 없다.

핵심만: 게임 화면까지 가려면 **서버가 두 개** 떠야 한다. `gookbapgame`은 좌/우 장면을
스스로 합성하지 않고 `GENERATE_UNIFIED_API_URL`(= `gookbapanalyze`의 `/api/generate-unified`)로
POST해서 받아온다. 하나라도 빠지면 시작 화면에서 "N단계 게임 데이터를 불러올 수 없습니다"가
뜨는데, 이 메시지는 원인을 구분해주지 않으므로 반드시 양쪽 서버 콘솔 로그를 볼 것.

테스트 DB 픽스처는 `docs/test-db/{schema,seed,accounts}.sql`에 있다(멱등).
`scripts/`가 아니라 여기 있는 이유는 그 문서에 적어뒀다 — 요약하면 `scripts/`는 gitignore라
사라지고, `supabase/migrations/`는 프로덕션에 push될 위험이 있어서다.

# Script Files Policy
All custom Node.js utility and database scripts (e.g. `.mjs` files) should be placed in the `/scripts/` directory and should be excluded from version control. 
*(Note: Framework configuration files like `eslint.config.mjs` and `postcss.config.mjs` must remain in the project root.)*

# Participant Identity (`app/lib/participantToken.ts`, `app/actions.ts`)
게임 클라이언트가 익명 참여자를 식별하는 방식.

- **쿠키 토큰**: `gookbapgame_token`(httpOnly, 만료 2년). `getOrIssueToken()`이 없으면 발급, 있으면 그대로 사용.
- **participant_id 산출**: `hashToken(token)`으로 SHA-256(64자 hex)을 만든 뒤, `resolveParticipantId()`가 앞 32자를 잘라 `8-4-4-4-12` 하이픈 형태(uuid 문자열 형식)로 재배열해서 `participant_id`로 씀. `participants.participant_id`는 프로덕션 기준 실제 `uuid` 타입 컬럼이라 이 포맷팅이 필요함.
- **`ensureParticipant(trackId)`**: `participants`에 `INSERT`(uuid PK 충돌 시 `23505`는 "이미 존재하는 참여자"로 정상 처리, `ON CONFLICT`는 안 씀 — RLS가 걸린 테이블에서 `ON CONFLICT`는 SELECT 정책을 요구해서 실패하기 때문). **신규 참여자일 때만** `track_logs`에 접속 로그를 남김(재방문/새로고침마다 로그가 계속 쌓이는 것을 방지 — `game_start_count` UPDATE가 `(participant_id, track_id)`당 row 1개를 가정하기 때문).
- **재방문자에게는 닉네임을 재배정하지 않는다.** `assign_random_nickname` RPC는 **멱등하지 않다** — 이미 닉네임이 있는 participant_id로 호출해도 새로 뽑아서 덮어쓴다(2026-08-05 실제 배포에서 확인, 새로고침마다 닉네임이 바뀐다는 제보로 드러남). 그래서 `ensureParticipant`는 `isNewParticipant`가 false면 `lookupExistingNickname()`(→ `get_participant` RPC)으로 저장된 닉네임을 **읽기만** 한다. 조회가 실패하거나 아직 닉네임이 없을 때만 배정으로 넘어간다. `participants` 직접 SELECT는 RLS로 막혀 있어 RPC가 필수다.
  - `reassignNickname()`은 예외다. 사용자가 "닉네임 다시 뽑기"를 눌렀거나 `nicknameSynced: false` 복구가 필요한 경우라 **의도적인** 재배정이며, 그대로 배정 API를 호출한다.
- **`NICKNAME_ASSIGN_API_URL`**: `gookbapanalyze`의 `/api/nickname/assign`을 가리키는 환경변수. 미설정이거나 실패 시 `generateNickname()`으로 로컬 폴백(형용사+명사 조합)하며 `nicknameSynced: false`를 반환 — 이 상태에서는 방문할 때마다 닉네임이 랜덤하게 바뀜(서버에 저장되지 않으므로 정상 동작).
- **로컬 마이그레이션 주의**: `supabase/migrations/`의 `tracks`/`participants`/`track_logs` 관련 마이그레이션은 이란토가 공유한 ER 다이어그램 스크린샷과 산문 설명을 근거로 재구성한 로컬 전용 스키마이며, 실제 프로덕션 Supabase의 RLS 정책을 직접 확인한 적이 없음. 로컬에서 통과했다고 프로덕션에서도 동일하게 동작함이 보장되지 않으므로 **프로덕션에 `db push` 하지 말 것**. 배포 전 구자건에게 `participants`/`track_logs` 실제 RLS 정책 확인 필요.

# 설문 · 쿠폰 (`app/hooks/useCouponFlow.ts`, `app/actions.ts`)

게임 종료 후 흐름: `gameResult → surveyIntro → survey → wheel → dailyResult`.
`dailyResult`에서 `myCoupons`로 진입한다.

- **`GATCHA_DRAW_API_URL`**: `gookbapanalyze`의 `/api/gatcha/draw`. **로컬 폴백이 없다** —
  닉네임과 달리 쿠폰은 서버가 DB에 INSERT해야만 유효하고, 클라이언트가 지어낸 쿠폰은
  매장 스캐너에서 인식되지 않는다. 폴백을 추가하지 말 것.
- **draw 응답에 `coupon_id`가 없다.** 그 API는 insert에 `.select()`를 붙이지 않는다.
  발급 성공 후 `get_my_coupons` RPC로 최신 쿠폰을 다시 읽어 id를 얻는다.
- **draw는 룰렛 진입당 1회.** `useCouponFlow`의 `drawStartedRef`가 중복 호출을 막는다.
  두 번 호출되면 두 번째는 쿨타임 403을 받아 사용자에게 없던 실패로 보인다.
- **쿨타임 403은 에러가 아니라 복구 신호다.** 대부분 룰렛 도중 새로고침이며,
  이때는 `fetchMyCoupons()`의 최신 쿠폰을 그대로 보여준다.
- **QR 페이로드**: `` `<coupon_id>?<locale>` ``. 스캐너는 `?` 앞이 UUID 정규식을 통과하지
  못하면 **조용히 무시**한다(에러 표시 없음). `app/lib/couponPayload.ts`가 이 형식을 고정한다.
- **Phase 1 문항이 0개면** 설문 화면을 건너뛰고 곧장 룰렛으로 간다.
- **접속 실패 시 재시도 버튼을 두지 않는다.** 안내 문구만 띄우고 흐름을 진행시킨 뒤,
  `pendingDraw` 표시를 남겨 다음 방문 시작 화면에 뽑기 진입 버튼을 노출한다. 이 표시는
  UI 힌트일 뿐이며 발급 자격은 언제나 서버가 판정한다.
- **`game_score_logs` INSERT는 쿠폰 시스템의 전제다.** 점수 기록이 없으면 draw API가 찾는
  최고 점수가 0이 되어 모든 플레이어가 최저 gatcha_cases 구간으로 뽑힌다.
- **`issued_coupons` 직접 SELECT 금지** — RLS로 막혀 있다. `get_my_coupons` RPC 필수
  (`gookbapanalyze/AGENTS.md`).

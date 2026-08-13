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
- **`ensureParticipant(trackId)`**: `participants`에 `INSERT`(uuid PK 충돌 시 `23505`는 "이미 존재하는 참여자"로 정상 처리, `ON CONFLICT`는 안 씀 — RLS가 걸린 테이블에서 `ON CONFLICT`는 SELECT 정책을 요구해서 실패하기 때문). 그다음 **`add_track_log` RPC**로 접속 로그를 남김.
  - **`track_logs`에 직접 `INSERT`하지 말 것.** anon의 INSERT 권한이 삭제됐다(2026-08-10, `gookbapanalyze` 커밋 a4a6416). 직접 넣으면 실패하는데, best-effort라 로그만 찍고 조용히 넘어가서 **방문자 수 KPI가 아무 신호 없이 0이 된다.**
  - **중복 집계 방지는 서버가 한다.** 30분 이내 활성 세션이 있으면 새 row를 만들지 않고 기존 `log_id`를 돌려준다(`participant_sessions` 테이블). 그래서 여기서 "신규 참여자일 때만" 같은 조건을 걸 필요가 없다 — 새로고침 연타로 방문자 수가 부풀지 않는다.
  - `trackId`가 `null`이어도 호출한다(문서 7번이 "없으면 null"을 명시). 부작용으로 `?q=` 없는 개발/QA 직접 접속도 방문자 수에 잡힌다.
  - **반환되는 `log_id`는 쓰지 않는다.** `update_track_log_action`이 `participant_id`만 받도록 바뀌어서(예전엔 `p_log_id`) 클라이언트가 `log_id`를 들고 있을 이유가 없다. 저장하는 코드를 되살리지 말 것.
  - **연속성·최초 방문 판별을 `track_logs`로 하지 말 것.** 그건 `participants`가 담당한다(쿠키 해시 기반 `participant_id` + PK 충돌 `23505`). `participant_id`는 매 접속마다 새로 생기지 않는다 — 같은 기기면 계속 동일하다.
- **KPI 액션 기록 (`recordGameStart` / `recordShareClick`)**: `update_track_log_action` RPC를 부르는 서버 액션. `participant_id`가 httpOnly 쿠키에서 나오므로 클라이언트에서 직접 못 부른다. 둘 다 실패를 삼킨다 — KPI 집계 실패가 게임 진행을 막아서는 안 된다.
  - **`game_start`는 `startGame`이 아니라 `phase`가 `"playing"`이 되는 전이에 걸려 있다**(`useGameProgress`의 `wasPlayingRef`). `startGame`은 튜토리얼 진입도 포함해 불리므로 거기 걸면 **튜토리얼에서 이탈한 사람까지 게임 시작자로 잡혀 시작률이 부풀어 오른다.** 또 진입 경로가 여럿이라(프리로드 완료, 튜토리얼 완주, 재시작) 호출부마다 흩어 배선하면 언젠가 하나가 빠진다 — 전이 감지 한 곳으로 유지할 것.
    - **카운트다운(3-2-1-START)이 끼어 있어도 기록 시점은 그 전이 그대로다.** 오버레이가 뜬 시점에 이미 게임 화면에 진입했으므로(게임판이 뒤에 보인다) 거기가 "게임 시작"이다. 카운트다운이 **끝난 뒤**로 미루면 3.2초 안에 이탈한 사람이 빠져 시작자가 아니라 **완주 의향자를 세게 된다** — 코드가 KPI 정의를 조용히 바꾸면 대시보드 수치가 이유 없이 떨어지고 원인을 추적할 수 없다(2026-08-11, 이란토).
  - `share_click`은 시작 화면의 '친구 초대하기'가 부른다(아래 참고).
- **재방문자에게는 닉네임을 재배정하지 않는다.** `assign_random_nickname` RPC는 **멱등하지 않다** — 이미 닉네임이 있는 participant_id로 호출해도 새로 뽑아서 덮어쓴다(2026-08-05 실제 배포에서 확인, 새로고침마다 닉네임이 바뀐다는 제보로 드러남). 그래서 `ensureParticipant`는 `isNewParticipant`가 false면 `lookupExistingNickname()`(→ `get_participant` RPC)으로 저장된 닉네임을 **읽기만** 한다. 조회가 실패하거나 아직 닉네임이 없을 때만 배정으로 넘어간다. `participants` 직접 SELECT는 RLS로 막혀 있어 RPC가 필수다.
  - **번호(`nickname_number`)를 빠뜨리지 말 것.** 배정 직후에는 `든든한 국밥 #0023`인데 다시 접속하면 `든든한 국밥`으로 떠서 **같은 사람인데 이름이 달라 보인다**(2026-08-10 제보 — "닉네임 다시 뽑기가 안 먹는 것 같다"는 증상으로 드러났다). 조립은 `formatNickname` 한 곳에서만 하므로 두 경로가 갈릴 수 없다 — **거기로 모으는 구조를 흩지 말 것.** `#` 앞은 non-breaking space(`gookbapanalyze`의 CouponScanner와 같은 규칙), 단어 사이는 일반 공백이다. `nickname_number`는 nullable이라 없으면 붙이지 않으며, 빈 문자열·공백도 없는 것으로 치는 정규화(`normalizeNicknameNumber`)를 두 경로가 공유한다.
- **배정 API도 2026-08-12부터 다국어 맵을 준다**(`d2f86e2`, 요청서 `docs/client/20260812-nickname-locale.md`). 이전에는 `"든든한 국밥 #0023"` 한국어 문자열 하나뿐이라 첫 방문자가 어떤 언어를 골랐든 한국어 닉네임을 받았다.
  - **필드명이 조회 경로와 다르다.** 배정은 `first_nickname`/`last_nickname`, 조회(`get_participant`)는 `nickname_first`/`nickname_last`다. 요청서는 조회와 맞춰 달라고 했으나 실제 응답은 반대 순서로 왔다 — 한쪽 파서를 다른 쪽에 복사해 오지 말 것.
  - **번역 폴백은 단어별이 아니라 닉네임 전체 단위다**(`formatNickname`). 앞말·뒷말이 각자 `resolveLocalizedName`을 타면 한쪽만 번역된 프리셋에서 `Hearty 국밥`처럼 한 이름 안에 두 언어가 섞인다 — "판교 사투리"로 놀림거리가 되는 그 형태라 어색하다. **두 단어 모두 해당 로케일 값이 있을 때만** 그 언어를 쓰고, 하나라도 비면 통째로 한국어로 떨어뜨린다(2026-08-12, 이란토). `nickname_presets.text`의 `en`·`ja`가 아직 부분적으로만 채워져 있어 실제로 자주 걸리는 경로이며, 번역이 채워지면 자동으로 해당 언어가 나온다. **단어별 폴백으로 되돌리지 말 것** — 그게 "번역된 건 최대한 보여준다"는 점에서 그럴듯해 보이지만, 사람 이름은 통째로 한 언어여야 한다.
  - **하위 호환용 `nickname` 문자열은 사라졌다.** 요청서에서 유지를 부탁했지만 실제로는 빠졌다. 그래서 맵이 없는 응답은 폴백 없이 `ok: false`가 되고, 호출부는 `localFallback()`(`nicknameSynced: false`)으로 떨어져 방문할 때마다 닉네임이 바뀐다. 저쪽이 응답 형식을 되돌리면 이 증상으로 먼저 드러난다.
  - `reassignNickname()`은 예외다. 사용자가 "닉네임 다시 뽑기"를 눌렀거나 `nicknameSynced: false` 복구가 필요한 경우라 **의도적인** 재배정이며, 그대로 배정 API를 호출한다.
- **`NICKNAME_ASSIGN_API_URL`**: `gookbapanalyze`의 `/api/nickname/assign`을 가리키는 환경변수. 미설정이거나 실패 시 `generateNickname()`으로 로컬 폴백(형용사+명사 조합)하며 `nicknameSynced: false`를 반환 — 이 상태에서는 방문할 때마다 닉네임이 랜덤하게 바뀜(서버에 저장되지 않으므로 정상 동작).

# 친구 초대하기 (`app/components/StartScreen.tsx`, `app/lib/inviteLink.ts`)

시작 화면의 '친구 초대하기' 버튼. 클립보드에 홍보 문구 + 초대 링크를 복사하고 `share_click`을 기록한다(KPI 4·5단계).

- **현재 URL을 그대로 복사하면 안 된다.** 초대 링크는 새 트랙을 만드는 게 아니라, 현재 접속한 트랙의 **같은 지점(`branch_id`)에 이미 `is_shared = true`로 등록돼 있는 트랙**을 `?q=`에 실어 보낸다(`fetchSharedTrackId`). 매장 QR로 들어온 사람의 주소창에는 `is_shared=false`인 매장 트랙이 붙어 있어서, 그걸 복사하면 유입이 **공유 유입으로 분류되지 않는다.** `buildInviteUrl`이 기존 쿼리·해시를 지우는 이유다.
  - `is_shared=true` 트랙이 여러 개면 `created_at` 오름차순 첫 번째로 고정한다. 안 그러면 호출할 때마다 링크가 달라진다.
  - **지점을 특정할 수 없으면 '온라인' 지점으로 떨어진다**(`FALLBACK_SHARED_TRACK_ID`). `?q=` 없는 기본 URL, 온라인 광고 유입, 등록되지 않은 트랙, 아직 공유 트랙을 안 만든 지점이 전부 여기로 온다. 온라인 광고는 애초에 특정 지점을 참조하지 않으므로 이게 정상 경로다.
  - **현재 URL로 폴백하지 말 것.** 위 이유로 KPI가 틀어진다. 폴백까지 없으면(환경변수 미설정) 버튼을 렌더하지 않는다 — 그 경로의 공유 유입을 포기하는 것이므로 프로덕션에는 반드시 설정할 것.
  - `tracks`는 RLS가 `Everyone: SELECT`라 anon이 직접 읽을 수 있다(RPC 불필요).
- **초대 문구는 마운트 시 미리 만들어 state에 들고 있는다.** 클릭 핸들러 안에서 트랙을 조회한 뒤 `clipboard.writeText`를 부르면 iOS Safari가 사용자 제스처와 끊긴 것으로 보고 거부한다 — `useCardImageSave`의 `navigator.share`와 똑같은 제약이다. 핸들러는 `await` 없이 복사만 해야 한다.

- **로컬 마이그레이션 주의**: `supabase/migrations/`의 `tracks`/`participants`/`track_logs` 관련 마이그레이션은 이란토가 공유한 ER 다이어그램 스크린샷과 산문 설명을 근거로 재구성한 로컬 전용 스키마이며, 실제 프로덕션 Supabase의 RLS 정책을 직접 확인한 적이 없음. 로컬에서 통과했다고 프로덕션에서도 동일하게 동작함이 보장되지 않으므로 **프로덕션에 `db push` 하지 말 것**. 배포 전 구자건에게 `participants`/`track_logs` 실제 RLS 정책 확인 필요.
  - `20260810000000_track_log_sessions.sql`은 프로덕션에 이미 적용돼 있는 것(anon INSERT 회수 + `participant_sessions` + `add_track_log`/`update_track_log_action`)을 **로컬에서 흉내낸 것**이다. 이게 없으면 로컬에서 RPC 호출이 `PGRST202`(함수 없음)로 떨어진다. 초대 링크 테스트용 `is_shared=true` 트랙 시드도 여기 있다.

# 설문 · 쿠폰 (`app/hooks/useCouponFlow.ts`, `app/actions.ts`)

게임 종료 후 흐름: `gameResult → surveyIntro → survey → wheel → dailyResult`.
`dailyResult`에서 `myCoupons`로 진입한다.

- **`GATCHA_DRAW_API_URL`**: `gookbapanalyze`의 `/api/gatcha/draw`. **로컬 폴백이 없다** —
  닉네임과 달리 쿠폰은 서버가 DB에 INSERT해야만 유효하고, 클라이언트가 지어낸 쿠폰은
  매장 스캐너에서 인식되지 않는다. 폴백을 추가하지 말 것.
- **`get_my_coupons`는 상품명을 돌려주지 않는다.** 반환 컬럼은 `coupon_id` /
  `participant_id` / `coupon_effect_id` / `is_used` / `issued_at` / `expired_at`뿐이다
  (`gookbapanalyze/AGENTS.md`의 반환 예시, 2026-08-07 저쪽 담당자 확인). 이름은
  `coupon_effect_id`로 `coupon_effects`를 **따로 읽어야** 나온다 —
  `fetchMyCoupons`의 `fetchCouponNames`가 그 조회다. `coupon_effects`는 RLS가
  `Everyone: SELECT`라 anon도 직접 읽을 수 있다(RPC 불필요, 프로덕션 정책 실물 확인).
  - **`row.coupon_type`을 기대하지 말 것.** 그 컬럼은 응답에 없어서 `undefined`가 되고,
    **에러 없이** 상품명이 "—"로 코너 이모지가 기본값으로 떨어진다(2026-08-07 배포에서
    실제로 났다). 두 증상이 **동시에** 나면 이 경우다.
  - **이걸 파싱 문제로 오진하지 말 것.** `parseCouponType`은 파싱에 실패해도
    `{ ko: 원본문자열 }`로 폴백하므로, 파싱이 빠졌다면 화면에 "—"가 아니라
    `{"ko":...}` JSON이 통째로 뜬다. 증상이 다르다 — 2026-08-07에 실제로 이
    구분 때문에 원인 진단이 한 번 갈렸다.
- **`coupon_effects.coupon_type`은 jsonb가 아니라 `text`다** — 다국어 이름 맵이 JSON
  **문자열**로 들어 있어 Supabase가 파싱해주지 않는다(그쪽 코드도 전부 `JSON.parse`한다).
  `app/lib/couponType.ts`의 `parseCouponType`이 `fetchCouponNames` 경계에서 편다.
  설문의 `question_text`도 같은 형태이며 이미 같은 처리를 한다.
- **발급 시각 컬럼은 `created_at`이 아니라 `issued_at`이다.** `sortByIssuedAt`이
  최신순을 강제하는데(RPC의 정렬 순서를 신뢰할 수 없다), 컬럼명을 틀리면 `every()`가
  false가 되어 정렬이 **통째로 건너뛰어진다**. `drawCoupon()`이 `[0]`을 "방금 발급된
  쿠폰"으로 쓰기 때문에, 그러면 오래된 쿠폰의 QR이 새 당첨 상품으로 조용히 나간다.
- **draw 응답에 `coupon_id`가 없다.** 그 API는 insert에 `.select()`를 붙이지 않는다.
  발급 성공 후 `get_my_coupons` RPC로 최신 쿠폰을 다시 읽어 id를 얻는다.
- **draw는 룰렛 진입당 1회.** `useCouponFlow`의 `drawStartedRef`가 중복 호출을 막는다.
  두 번 호출되면 두 번째는 쿨타임 403을 받아 사용자에게 없던 실패로 보인다.
- **거절(4xx)은 에러가 아니라 복구 신호다.** 대부분 룰렛 도중 새로고침이며,
  이때는 `fetchMyCoupons()`의 최신 쿠폰(`[0]`)을 그대로 보여준다.
  - **단, "방금 발급된 것"일 때만이다**(`isFreshlyIssued`, `issuedCoupons.ts`).
    서버 제한이 1일 1회에서 **1일 3회**로 바뀌면서, 예전의 "쓸 수 있는 쿠폰 아무거나"
    (`find(!isCouponUnusable)`)가 실제 버그로 드러났다 — 며칠 전 안 쓴 쿠폰이 매번
    새로 당첨된 것처럼 나왔다(카드 뒤집기 연출·당첨 효과음까지, 실제 제보).
    **이 분기를 통째로 지우지도, `find`로 되돌리지도 말 것.** 지우면 방금 발급받고
    새로고침한 사람이 쿠폰 대신 거절 문구를 본다.
  - `issued_at`이 없거나 파싱되지 않으면 **최근이 아닌 것으로 친다**(fail closed).
    오래된 쿠폰을 새 당첨으로 보여주는 쪽이 훨씬 나쁘다.
- **거절 사유 코드는 전달만 하고 아직 아무도 읽지 않는다.** 서버는 세 가지를 보낸다 —
  `LIMIT_EXCEEDED`(기간 내 횟수 초과), `PLAY_LIMIT_EXCEEDED`(누적 뽑기 ≥ 누적 플레이,
  2026-08-11 `4a5cf27`로 추가), `SURVEY_REQUIRED`. `gatchaApi.ts`가 `code`로 실어
  `DrawCouponResult`까지 나르지만 화면은 셋 모두 `t("wheel.rejected")` 하나로 떨어진다.
  - **문구를 사유별로 가르는 것은 쿨타임 조건이 확정된 뒤로 미뤘다**(2026-08-11, 이란토).
    "게임을 한 판 더 하면 됩니다" 같은 문구는 **쓰지 말 것** — 기간 제한(3단계)과 플레이
    제한(3.4단계)은 AND라서, 그 순간에는 맞아도 사용자가 일반 규칙으로 오해한다.
    확정되면 "N시간 후 다시 가능" 형태로 붙인다.
  - `code`는 옵셔널이고 **없으면 키 자체를 넣지 않는다.** `code: undefined`를 실으면
    값 없는 키가 생겨 호출부의 `deepEqual` 비교가 어긋난다(실제로 테스트 2건이 깨졌다).
  - 서버 `error` 문자열(한국어 하드코딩)을 화면에 그대로 띄우지 말 것 —
    영어·일본어 사용자에게 한글이 노출된다.
- **오늘의 결과의 '설문하고 쿠폰 받기' 재진입 버튼은 설문 안내를 거절한 사람 전용이다**
  (`page.tsx`의 `declinedSurvey`, 설계 문서 `2026-08-04-coupon-qr-design.md`).
  조건 없이 항상 넘기면 설문·뽑기를 이미 마친 사람에게도 떠서, 누르면
  `hasSurveySubmitted()`로 설문을 건너뛰고 뽑기를 한 번 더 태운다(3회 제한 안에서 실제로 더 뽑힌다).
  - 플래그는 **거절 지점(`onDecline`)에서만 켜고 `enterSurveyFlow` 진입 시 끈다** —
    버튼은 한 번 쓰면 소진된다. `leaveDrawFlow`는 `WheelScreen`의 '다음'과 공유하므로
    그 안에서 켜면 뽑기를 끝낸 사람에게도 버튼이 살아난다.
  - 세션 state다. **localStorage에 남기지 말 것** — 거절은 그 판 안에서만 유효하다.
  - **접속 실패(`error`)한 사람의 복구 경로는 이 버튼이 아니다.** `markPendingDraw()`가
    남긴 표시로 **시작 화면**에 뽑기 진입 버튼이 뜬다.
- **QR 페이로드**: `` `<coupon_id>?<locale>` ``. 스캐너는 `?` 앞이 UUID 정규식을 통과하지
  못하면 **조용히 무시**한다(에러 표시 없음). `app/lib/couponPayload.ts`가 이 형식을 고정한다.
- **QR의 흰 배경과 quiet zone은 SVG 안에서 만든다**(`marginSize={4}`, 2026-08-07).
  바깥 div의 `padding` + `bg-white`로 여백을 만들면, 강제 다크모드 확장이 div 배경만
  뒤집고 SVG 내부 경로는 그대로 둬서 **quiet zone이 어두워진다** — 스캐너가 코드를
  못 읽는다. `marginSize`를 주면 배경 `<path>`가 여백까지 덮어 함께 살아남는다
  (실측: viewBox 29→37, 배경 path도 `h37v37`로 커짐).
  - `cardImage.ts`도 이에 맞춰 흰 사각형을 **그리지 않는다**. 양쪽이 여백을 각자
    만들면 화면과 저장본의 QR 크기가 조용히 어긋난다.
- **Phase 1 문항이 0개면** 설문 화면을 건너뛰고 곧장 룰렛으로 간다.
- **접속 실패 시 재시도 버튼을 두지 않는다.** 안내 문구만 띄우고 흐름을 진행시킨 뒤,
  `pendingDraw` 표시를 남겨 다음 방문 시작 화면에 뽑기 진입 버튼을 노출한다. 이 표시는
  UI 힌트일 뿐이며 발급 자격은 언제나 서버가 판정한다.
- **`game_score_logs` INSERT는 쿠폰 시스템의 전제다.** 점수 기록이 없으면 draw API가 찾는
  최고 점수가 0이 되어 모든 플레이어가 최저 gatcha_cases 구간으로 뽑힌다.
- **`issued_coupons` 직접 SELECT 금지** — RLS로 막혀 있다. `get_my_coupons` RPC 필수
  (`gookbapanalyze/AGENTS.md`).
- **`wheel` 단계의 연출은 룰렛이 아니라 카드 뒤집기다**(2026-08-07). 키 이름과 단계
  이름만 `wheel`로 남아 있다 — 이름만 보고 룰렛으로 되돌리지 말 것.
  - draw는 `WheelScreen` 마운트 시 1회. **탭은 API를 부르지 않는다.** 이미 받아둔
    결과를 보여줄 뿐이다. 탭으로 옮기면 `drawStartedRef`가 막아주던 중복 호출이 되살아난다.
  - 카드를 쓰는 결과는 `won`/`miss` 둘뿐. `wonButHidden`은 앞면에 올릴 payload가 없고
    (`{ status: "wonButHidden" }`이 전부), `rejected`/`error`는 뽑기가 소진되지 않은
    상태라 뒤집으면 소비한 것처럼 보인다.
  - 앞면(`card-front.webp`)은 **밝은** 애셋이다. 글자색은 테마 변수가 아니라
    `GatchaCard`의 `CARD_FACE_INK` 상수를 쓴다 — `cardImage.ts`가 canvas에 같은 글자를
    그릴 때 CSS 변수를 읽을 수 없어 리터럴이 필요하고, 두 곳이 반드시 같은 값이어야
    화면과 저장본이 어긋나지 않기 때문이다. **테마가 밝아졌다고 이 상수를 지우고
    `--ink`로 되돌리지 말 것**(2026-08-11 기준 두 값이 같지만, 테마가 다시 어두워지면
    `--ink`만 밝아지고 이 값은 어두운 채로 남아야 한다).
    `CouponQR`의 `onLightFace`가 이 "밝은 면 위" 상황을 가리키는 플래그다.
  - **카드 앞면 안쪽 색(#F2F2F2)이 패널 배경(`--surface` #F2F4F6)과 사실상 같다**
    (2026-08-11 실측). 지금은 앞면 테두리(#848484)가 있어 형체가 유지되지만,
    `WheelScreen`의 배경을 더 밝게 바꾸면 카드가 통째로 묻힌다. 이 화면은 뽑기
    연출용으로 따로 꾸밀 예정이라 그때 함께 해결하기로 했다 — 임시로 배경을
    낮추는 처리를 넣었다가 뺐으니 되살리지 말 것.
  - **앞면 레이아웃을 바꾸면 `app/lib/cardImage.ts`도 같이 고쳐야 한다.** 저장 이미지는
    DOM 캡처가 아니라 같은 구성을 canvas에 다시 그린 것이라, 두 곳이 같은 좌표(13%/11%
    inset, 노치 크기, 코너 마크 위치, QR 비율)를 각각 들고 있다. 한쪽만 고치면 화면과
    저장본이 조용히 달라진다(실제로 한 번 어긋났다 — 화면엔 노치, 저장본엔 민무늬 사각형).
  - **카드 앞면의 날짜는 발급일·시작일·사용기한 3줄이다**(2026-08-12, 기획 요청).
    조립은 `app/lib/couponDates.ts`의 `couponDateLines` **한 곳**에서 하고 화면과
    저장 이미지가 같은 배열을 받는다 — 양쪽이 각자 날짜를 만들면 위와 같은 이유로
    조용히 어긋난다. 줄을 추가·변경할 일이 있으면 그 헬퍼만 고칠 것.
    - **날짜는 `Asia/Seoul` 고정이다.** `expired_at`이 KST 23:59:59.999로 저장되므로
      (`couponUsability.ts`) 기기 시간대로 렌더하면 한국보다 서쪽 기기에서 만료일이
      **하루 앞당겨** 보인다. 발급일도 매장에서 "카드에 찍힌 날짜"로 이야기하므로
      기기마다 달라지면 안 된다. `toLocaleDateString`에서 `timeZone`을 빼지 말 것.
      **`MyCouponsScreen`(내 쿠폰 목록)도 같은 헬퍼를 쓴다** — 한쪽만 KST로 두면 같은
      쿠폰의 사용기한이 화면마다 하루 다르게 뜬다. 날짜를 새로 그리는 화면이 생기면
      직접 `toLocaleDateString`을 부르지 말고 `couponDateLines`를 거칠 것.
    - **`valid_from`(시작일)은 `get_my_coupons`가 실제로 준다**(2026-08-13 실기 확인).
      `gookbapanalyze/AGENTS.md`의 반환 예시에는 없어서 2026-08-12에는 "안 온다, 저쪽에
      요청해야 할 남은 절반"으로 적어뒀는데, 실기에서 시작일 줄이 떠서 뒤집혔다 —
      **문서가 반환 컬럼을 다 적고 있지 않다.** 저쪽 문서를 반환 컬럼의 완전한 목록으로
      신뢰하지 말 것.
    - **`expired_at`은 null로 올 수 있다.** 그러면 사용기한 줄만 빠져서 발급일·시작일
      2줄이 뜬다 — 2026-08-13에 이 증상을 "3줄이 카드에서 잘렸다"로 오진할 뻔했다.
      원인은 서버에 있었다: draw API가 `expire_type === 'days' && expire_days != null`을
      요구하는데(`5956cd2`, 2026-08-12 17:59) 그 이전에 등록된 `coupon_effects`에는
      `expire_type` 값이 없어 조건이 false로 떨어졌다. 지금은 값이 채워져 정상이지만
      **그 사이에 발급된 쿠폰은 DB에 `expired_at: null`로 남아 영구히 만료되지 않는다**
      (`isCouponExpired`가 `expiredAt !== null`을 보므로 클라이언트는 "만료 안 됨"으로 
      처리한다 — 의도된 동작이다).
      - **카드에서 날짜 줄이 하나 안 보일 때 레이아웃부터 의심하지 말 것.** 앞면 내부는
        `overflow-hidden` + `justify-center`라 넘치면 **위아래가 같이** 잘린다. 마지막
        줄만 사라지는 증상은 clipping으로 나올 수 없다 — 데이터가 없는 것이다.
        실측으로도 3줄이 다 들어간다(390px에서 QR 149 + 날짜 60, 프레임 362, 넘침 0).
      - **draw 응답의 `valid_from`을 끌어다 쓰지 말 것.** 화면에 뜨는 쿠폰은 당첨
        직후에도 `get_my_coupons`를 다시 읽은 결과다(draw 응답에 `coupon_id`가 없어서).
        거절 복구 경로도 마찬가지라, draw에서만 받아오면 그 경로에서 줄이 사라져
        같은 쿠폰이 화면마다 다르게 보인다 — `gatchaApi.ts`가 경고하는 "두 번째 진실"이다.
    - 날짜 줄들은 화면에서 **하나의 블록**으로 묶여 있다(`GatchaCard`의 감싼 `div`).
      형제로 늘어놓으면 바깥 `gap-3`가 줄 사이마다 들어가는데 `cardImage.ts`는 블록
      앞에 `GAP`을 한 번만 붙이므로 저장본만 아래로 늘어진다. 묶음을 풀지 말 것.
    - 날짜가 늘어난 만큼 상품명이 쓸 수 있는 높이가 줄어, 긴 이름은 자동 축소 루프의
      30px 바닥에 더 빨리 닿는다. 잘림이 문제가 되면 날짜 폰트를 줄이는 쪽을 먼저 볼 것.
  - **카드 크기는 `vw`/`vh`가 아니라 컨테이너 폭(`100%`)을 상한으로 잡는다**(2026-08-07).
    카드는 `max-w-sm` 패널 안에 들어가는데 예전엔 뷰포트만 봐서, 390px 폰에서도
    패널 안쪽(283px)보다 카드(312px)가 커져 넘쳤다(당시엔 `pixel-frame`에 걸려 있던
    clip-path가 양옆을 잘라내서 드러났다 — 그 clip-path는 지금 없지만 넘치는 것
    자체는 그대로 문제다). **넓은 화면만의 문제가 아니다.**
    - 폭만 지정하고 높이는 `aspect-ratio`에 맡길 것. 두 축을 다 지정하면 비율이 깨져
      `object-contain`이 레터박스를 만들고 앞뒤 면 크기가 달라 보인다. 세로 상한이
      필요하면 비율로 나눠 폭으로 환산해서 건다.
    - 그 `100%`가 기준을 가지려면 `items-center` 아래의 래퍼들에 `w-full`이 있어야
      한다(`GatchaCard` 루트, `WheelScreen`의 카드 래퍼). 빠지면 shrink-to-fit이 되어
      다시 넘친다.
    - 카드 **안쪽** 요소도 `vw`를 쓰면 안 된다. 카드는 컨테이너에 갇혀 뷰포트와 따로
      노므로, QR은 `cqw`(카드 폭 기준)를 쓴다 — `.gatcha-card`의 `container-type:
      inline-size`가 그 기준을 연다. `44cqw`는 `cardImage.ts`의 `CARD_W * 0.44`와
      같은 값이다 — 다만 **QR 코드 자체만** 일치한다. 흰 여백은 화면이 `p-3`(12px 고정),
      canvas가 `qrSize * 0.08`(카드에 비례)이라 카드 크기에 따라 갈린다.
  - **이모지는 흑백 서브셋 폰트를 쓴다**(`public/fonts/NotoEmoji-subset.woff2`, 21KB).
    시스템 이모지는 대부분 컬러라 회색 크롬으로 정리된 화면에서 튀고 기기마다
    모양도 다르다. `globals.css`의 `font-family`에서 **본문 폰트보다 앞에** 둬야
    이모지를 가로챈다(서브셋이라 한글·라틴은 자연히 다음 폰트로 넘어간다).
    - **`couponEmoji.ts`에 이모지를 추가하면 폰트를 다시 만들어야 한다.** 서브셋에
      없는 글자는 에러 없이 두부(􏿽)로 보인다 — `python3 docs/check-emoji-font.py`로
      검사하고, `bash docs/build-emoji-font.sh`로 다시 만든다. 여유분을 넣어둬서
      (63자 수록, 29자 사용) 웬만한 추가는 바로 된다.
    - **이모지에 VS16(U+FE0F)을 붙이지 말 것**(2026-08-07, 실측으로 확인). 서브셋의
      cmap에 U+FE0F가 들어 있어도 소용없다 — `build-emoji-font.sh`가 `--layout-features=''`로
      GSUB을 비우기 때문에 VS16 클러스터가 합쳐지지 않고, 브라우저는 그래핌 전체를
      못 그린다고 판단해 **시스템 컬러 이모지로 넘어간다**. 실제로 `DEFAULT_COUPON_EMOJI`가
      `"🍽️"`(U+1F37D + U+FE0F)여서 카드 코너 마크만 컬러로 떴다. `"\u{1F37D}"`처럼
      VS16 없이 쓴다. 어차피 VS16은 "컬러로 그려달라"는 요청이라 흑백 서브셋과 정반대다.
      - `docs/check-emoji-font.py`는 코드포인트를 낱개로 보므로 이걸 **잡지 못한다**.
        대신 `couponEmoji.test.ts`가 소스를 훑어 VS16을 막는데, 검사 범위는
        `couponEmoji.ts` **한 파일뿐이다** — 컴포넌트에 직접 박은 이모지(SoundToggle의
        🔇/🔊 등)에 VS16을 붙이면 아무도 못 잡는다.
    - canvas(`cardImage.ts`)도 같은 폰트를 쓴다. `--font-emoji` 변수에는 폰트가 **두 개**
      들어 있는데(`"notoEmoji", "notoEmoji Fallback"`), 뒤엣것은 next/font의 로컬 메트릭
      폰트(`local(Arial)`)라 네트워크에서 받을 수 없다 — 목록째로 `document.fonts.load()`에
      넘기면 NetworkError가 난다. 첫 항목만 떼어 쓸 것.
      - 같은 이유로 `globals.css`의 `font-family`도 `var(--font-emoji)`가 아니라
        `notoEmoji`를 직접 적는다. Arial이 실제로 있는 환경(iOS·Windows)에서는 그
        Fallback이 로드에 성공해 본문 폰트에 닿기 전에 이모지를 가로챌 수 있다.
        이름은 next/font가 파일명에서 만든 것이라 **폰트 파일을 옮기거나 이름을 바꾸면
        여기도 같이 고쳐야 한다.**
  - **강제 다크모드(Darkreader 등)는 페이지 전체에서 끈다** — `layout.tsx` metadata의
    `<meta name="darkreader-lock">`(2026-08-07). 이 게임은 90s 데스크톱을 흉내낸
    **밝은** 테마라(회색 크롬 + 흰 문서 영역 + 2색 베벨) 색이 뒤집히면 컨셉이 통째로
    무너진다 — 어두운 테마 시절보다 이 잠금이 오히려 더 중요해졌다(밝은 사이트야말로
    확장이 노리는 대상이다). 특히 카드 앞면은 **밝은** 애셋 위에 어두운 글자를 올리는
    구조라 글자색만 뒤집히면 내용이 통째로 사라진다
    (우드톤 시절 실측: `#3A2E24` → `#C9C3B8`. 색만 바뀌었을 뿐 구조가 같아 증상도 같다).
    - **서브트리만 제외하는 방법은 없다.** 흔히 언급되는 `data-darkreader-ignore`
      속성은 Darkreader 4.9.128 코드에 **존재하지 않고**, `color-scheme: only light`도
      무시된다 — 둘 다 실물로 확인했다. 이 meta가 유일하게 동작한다.
    - **content 값을 비우지 말 것.** Darkreader는 값을 보지 않지만, Next가 값 없는
      metadata 항목을 태그째 버려서 meta가 렌더되지 않는다.
    - `globals.css`의 `.card-face-fixed-colors`는 별개다 — 그쪽은 OS 고대비 모드
      (`forced-color-adjust`)를 막는다.
  - **뒤집은 뒤의 주 행동은 '이미지로 저장'이다.** 그 버튼이 하단 전체 폭을 차지하고,
    **한 번 누른 뒤에야** 옆에 '다음'(화살표)이 들어온다(2026-08-07, 이란토).
    처음부터 둘 다 띄우면 저장하려던 사람이 '다음'을 눌러 넘어가고, 그 카드는
    이 화면에서 다시 볼 수 없다.
    - 판정은 **저장 성공이 아니라 시도**다. 공유 시트는 앨범에 저장했는지 전송했는지
      알려주지 않고 다운로드도 브라우저에 넘긴 시점까지만 알 수 있어서, "저장 완료"는
      애초에 감지할 수 없다. 취소·실패해도 화살표는 유지한다 — 숨기면 "눌렀는데 왜
      안 생기지"가 된다.
    - 그래서 저장 로직은 `useCardImageSave` 훅에 있다. 버튼은 `WheelScreen`(하단),
      그림 소재인 QR `<svg>`는 `GatchaCard` 안이라 한쪽에 둘 수 없다.
  - **저장 이미지는 카드가 뒤집힐 때 미리 굽는다.** 버튼을 누른 뒤에 굽기 시작하면 안 된다 —
    iOS Safari는 `navigator.share`를 사용자 제스처가 유효한 동안에만 허용하는데, 탭과
    호출 사이에 이미지 로드·직렬화가 끼면 `NotAllowedError`로 거부되고 공유 시트 대신
    조용히 파일 다운로드로 떨어진다.

# 게임 화면 (`app/components/GameScreen.tsx`)

- **정답·오답 표시를 히트 영역 안에 넣지 말 것.** 히트 영역은 파트 실루엣 모양대로
  `clip-path`를 쓰는데, clip-path는 **서브트리 전체**에 적용되고 자식이 취소할 수 없다
  (`[clip-path:none]`을 걸어도 소용없다). 안에 넣으면 마커가 실루엣 밖으로 나가는 만큼
  잘려 나가고, 슬롯마다 크기가 달라 보인다(2026-08-07까지 실제로 그랬다).
  두 마커 모두 씬 컨테이너의 **직속 자식**으로 두고 좌표로 배치한다 —
  `renderFoundMarks`/`renderWrongMarks`가 같은 구조다. `globals.css`의
  `card-corner-layer`도 같은 이유로 형제 레이어다.

- **문항 인디케이터는 실제 문항 수만큼만 그린다**(2026-08-13). 예전에는 `INDICATOR_SLOT_CAP`
  (9)만큼 항상 그리고 초과분을 `opacity: 0`으로 감췄다 — 단계마다 인디케이터 폭이 출렁이는
  것을 막으려는 것이었다. 그런데 감춘 칸이 **자리를 그대로 차지**하는데 컨테이너에
  `justify-content`가 없어(flex-start) 5문항 단계에서 보이는 5칸이 **왼쪽으로 쏠렸다**
  (이란토가 스크린샷에서 발견). 당시 주석은 "가운데 정렬"이라고 적혀 있었지만 코드에는
  없었다 — 주석과 코드가 어긋난 채로 유지돼 온 것이다.
  - **여분 칸을 되살리지 말 것.** 폭 출렁임과 쏠림 중 후자가 실제로 눈에 걸렸고,
    `justify-center`면 중심이 고정이라 단계가 바뀔 때 좌우로 균등하게 자란다.
    `hudIndicators.test.ts`의 "칸 수는 문항 수와 같다"가 이 회귀를 잡는다.
  - `opacity: 0`으로 자리를 남기는 기법 자체가 함정이다 — `display: none`과 달리 레이아웃에
    남으므로, 정렬이 flex-start면 그 여백이 전부 한쪽에 몰린다.

# 화면 높이 — `vh`를 쓰지 말 것

모바일 웹 게임이라 브라우저 툴바가 화면 높이를 좌우한다. **`100vh`는 툴바가 없는
상태의 높이로 고정**되므로, 하단 툴바가 두꺼운 브라우저에서는 딱 그만큼 화면이 넘친다 —
iOS Firefox 실기에서 게임판이 잘려 **위아래로 스크롤하며 플레이**해야 했다
(2026-08-12 제보). 안드로이드는 제조사마다 기본 브라우저와 디스플레이 규격이 달라
개별 대응이 불가능하므로, 브라우저가 실제 가시 높이를 알려주는 `dvh`를 쓴다.

- 화면 루트는 **`min-h-dvh`**(Tailwind v4 기본 제공, 설정 불필요). `min-h-screen`으로
  되돌리지 말 것 — Tailwind의 `screen`이 곧 `100vh`다.
- **`GameScreen`만 `min-`이 없는 `h-dvh`다.** 게임 중에는 페이지가 스크롤되면 안 된다.
  `min-h-dvh`는 내용이 길어지면 늘어나서 `main`의 `overflow-auto`가 무의미해진다 —
  루트를 `h-dvh`로 묶어야 `flex-1`인 main이 함께 묶이고, 넘치는 내용이 페이지가 아니라
  **main 안에서만** 스크롤된다(헤더·게이지는 제자리에 남는다).
- **`env(safe-area-inset-*)`(`--safe-top`/`--safe-bottom` 류)로는 못 고친다.** 그건 OS
  노치·홈 인디케이터용이고 브라우저 툴바와 무관하다. 일반 브라우저 탭에서는 OS 인셋이
  이미 뷰포트에서 빠져 있어 `viewport-fit=cover` 없이는 **0으로 계산된다** — 넣어도
  코드만 늘고 화면은 바뀌지 않는다. (cover는 콘텐츠를 홈 인디케이터 **아래로** 밀어넣는
  별개의 큰 변경이라 전면 재패딩이 필요하다. 하게 되면 Next 15+ 기준 `metadata`가 아니라
  `export const viewport: Viewport`이며, 문서를 먼저 읽을 것.)
- `globals.css`의 카드·클립보드 크기 상한(`.hint-clipboard`, `.gatcha-card`)도 같은
  이유로 `dvh`다. **`vw`는 그대로 둔다** — 가로 폭은 툴바의 영향을 받지 않는다.
- **데스크톱 브라우저와 Playwright로는 검증할 수 없다.** 툴바 두께를 에뮬레이션할
  수단이 없어서, 창 크기를 줄여도 이 버그는 재현되지 않는다. 실기 확인이 유일한 검증이다.

# 연출 글자 (`.game-cue` — 카운트다운 / 종료 화면)

3-2-1-START(`CountdownOverlay`)와 GAME OVER·CLEAR!(`GameEndScreen`)가 같은 클래스를
쓴다. 둘 다 팝업 창(`PixelPanel`) 안에 든다.

- **font-size는 CSS가 라벨별로 갖는다**(2026-08-13). `.game-cue`(START 기준) /
  `.game-cue--wide`(CLEAR!) / `.game-cue--long`(GAME OVER) 세 단계이며 상한 84px을
  공유한다. `gameCue.test.ts`가 창 높이와의 일치, 상한 공유, 계수 순서를 검사한다.
  - **`useFitText`로 되돌리지 말 것.** 2026-08-12에 브라우저에 렌더 폭을 묻는 훅을 넣었다가
    2026-08-13에 걷어냈다. 그 훅의 마지막 두 줄이 버그였다:

    ```js
    el.style.fontSize = "";   // React 밖에서 DOM을 직접 지운다
    setFontSize(next);        // next가 현재 state와 같으면 React는 커밋을 건너뛴다
    ```

    초기 state가 `useState(maxPx)`(84)인데 **상한에 걸리는 라벨은 `next`가 정확히 84**라
    같은 값을 set하는 셈이 된다 → 리렌더가 없으니 방금 수동으로 지운 인라인 스타일이
    복원되지 않고, 글자가 **16px(상속 기본값)로 뜬다.** 390px 화면 실측:

    | 라벨 | `next` | 상한과 같은가 | 결과 |
    |---|---|---|---|
    | 3 / 2 / 1 / START | 84 | 같음 | 16px로 깨짐 |
    | CLEAR! | 83.25 | 다름 | 정상 |
    | GAME OVER | 51.18 | 다름 | 정상 |

    이란토 제보가 "CLEAR!만 멀쩡하고 나머지는 작다"였던 것이 정확히 이 표다 —
    **예외가 아니라 버그의 서명이었다.**
    - "간헐적"으로 보인 것도 이 때문이다. 창이 좁아지면 START의 `next`가 84 미만이 되어
      정상 동작하므로 화면 폭에 따라 갈린다. `<span key={step}>`이 의심스러워 보이지만
      원인이 아니다 — 카운트다운은 라벨이 전부 상한에 걸리는 것들이라 통째로 깨졌을 뿐이다.
    - **교훈은 좁게 기록한다: React 밖에서 DOM 속성을 지운 뒤 state set으로 복원하려 하지
      말 것.** 값이 같으면 커밋이 없고, 커밋이 없으면 복원도 없다.
    - 라벨이 6종 고정이고 i18n을 타지 않으므로(아래) 사람이 한 번 재서 박는 편이 맞다.
      브라우저에 묻는 방식은 "무슨 글자가 올지 모를 때" 필요한 것이다.
  - **`cqw` 자체가 틀렸던 게 아니다.** 예전 `clamp(2.5rem, 19cqw, 5rem)`이 실패한 것은
    그 `19`가 "Galmuri11 라틴 대문자는 약 0.5em"이라는 **틀린 가정**에서 역산됐기 때문이다.
    실제로는 글자마다 0.333~0.833em이고 GAME OVER는 가정(4.5em)보다 31% 넓은 5.917em이라,
    모든 기기에서 창 밖으로 41~55px 넘쳤다(2026-08-12, iOS 제보로 드러났지만 **폰트 메트릭
    문제라 플랫폼 무관**이고 데스크톱에서 창을 좁혀도 재현된다). 지금 계수는 폰트에서 직접
    잰 값이다(기울임 tan8° 포함): START 3.391em → 28cqw / CLEAR! 3.721em → 25.5cqw /
    GAME OVER 6.061em → 15.5cqw.
  - **`min(84px, Ncqw)`에서 `cqw` 항을 빼고 px 고정으로 가지 말 것.** 처음에 그렇게 했다가
    **320px 화면에서 START 25px·CLEAR! 53px·GAME OVER 77px씩 잘리는 것**을 실측으로 발견해
    되돌렸다. `max-width: 100%` + `overflow: hidden`이 창을 뚫는 것만 막을 뿐 잘림은 막지
    못하며, 조용히 잘리므로 눈치채기 어렵다.
  - **라벨을 추가·변경하면 폭을 다시 재서 계수를 잡을 것.** 자동으로 맞지 않는다.
- **`.game-cue-window`의 `height`는 창이 흔들리지 않게 하는 몫이다.** 라벨마다 font-size가
  달라지면서 `line-height: 1`인 글자 높이가 따라 변해 팝업 창이 위아래로 움직였다
  (2026-08-12, 이란토). 폭을 `width: 100%`로 고정한 것과 같은 이유다.
  이 값은 `.game-cue`의 font-size **상한**과 같아야 한다 — 두 규칙에 px 리터럴로 나뉘어
  있어 한쪽만 고치기 쉽지만 `gameCue.test.ts`가 잡는다.
- **상한 84px이 없으면 카운트다운의 `3` 한 글자가 창 폭을 꽉 채워 거대해진다.**
  **낮추면 카운트다운 연출도 같이 작아진다.**
- **GAME OVER는 두 줄로 쌓는다**(`GAME` / `OVER`, 2026-08-13). 한 줄로 두면 9자라 폭
  제약이 먼저 걸려 넓은 화면에서도 53px에 머물렀고, 창을 92% 채우므로 계수를 올려도
  해결되지 않았다 — CLEAR!(84px) 옆에서 눈에 띄게 작았다(이란토 제보). 두 줄이면 각 줄이
  4자라 상한까지 커진다. 창 높이는 `--two-line`이 160px로 따로 갖는다.
  **"작아 보인다"는 제보에 계수나 상한을 건드리는 것은 잘못된 처방이다.**
  - 두 줄은 좌우로 1em씩 어긋나고 `margin-top: -0.12em`으로 맞물린다(`--stack`).
    어긋남 방향은 기울임(`skewX(-8deg)`)과 **같은 왼→오**다 — 반대로 하면 기울기와 싸우는
    모양이 된다(다섯 가지 안을 실물로 비교해 고른 것이다).
  - **어긋남 margin이 폭을 먹으므로 계수에 포함된다**: GAME 2.83em + 기울임 0.14 +
    어긋남 1.0 = 3.97em → 25cqw. 어긋남을 바꾸면 계수와 창 높이를 함께 다시 잡을 것.
  - 창 높이 160px은 `84 * 2`가 아니다 — 맞물린 겹침만큼 뺀 값이며 실측 내용 높이가
    158px이다. `gameCue.test.ts`가 "한 줄보다 크고 두 배보다 작다"를 검사한다.
- **줄 쌓기에 부모 `display: flex`를 쓰지 말 것 — Lightning CSS가 규칙째로 지운다.**
  `.game-cue`가 이미 `display: inline-block`이라, 뒤에서 `.game-cue--stack { display: flex }`를
  선언하면 Tailwind v4의 번들러가 중복으로 판단해 **그 규칙 블록을 통째로 없앤다.**
  소스에는 있는데 빌드된 CSS에는 없고, 브라우저는 두 줄을 나란히 늘어놓아 `OVER`가 패널
  밖으로 나간다(2026-08-13에 실제로 겪었다 — 같은 파일의 `--wide`·`--two-line`은 정상
  적용돼서 캐시 문제로 오진하기 쉽다). 자식을 `display: block`으로 만들면 부모가
  inline-block이어도 줄이 나뉘므로 flex가 필요 없다.
  - 진단법: `curl`로 `/_next/static/chunks/*.css`를 받아 해당 선택자를 grep한다.
    `document.styleSheets`로 보는 것보다 확실하다(캐시와 무관하다).
- **라벨은 i18n을 타지 않는다**(2026-08-12). `GAME OVER` / `CLEAR!` / `START` 모두
  로케일 3종(ko/en/ja)이 같은 영문 리터럴이어서 키를 지우고 하드코딩했다. 번역 대상
  문구가 아니라 로고성 표시이며, 로케일 파일에 두면 "번역해야 할 것"으로 보여 언젠가
  누가 번역해 넣는다. `gameEnd.nextButton`은 로케일마다 다르므로 **그건 남겨 둘 것.**
  - 이제 크기가 라벨별 CSS 클래스에 묶여 있어, 번역된 라벨이 들어오면 **잘린다**(예전에는
    `useFitText`가 줄여줬다). 번역 경로를 되살릴 근거가 하나 더 없어진 셈이다.
- 이 건은 **로컬에서 검증된다** — 폰트 메트릭과 컨테이너 폭 문제라 실기가 필요 없다.
  320~768px에서 라벨 4종의 잘림이 0이고 채움률이 79~92%로 균일한 것을 실측으로 확인했다.
  단, 위 16px 버그처럼 **타이밍에 걸린 것은 로컬에서 안 나온다** — 그게 훅을 걷어낸 이유다.

# 효과음 (`app/lib/sfx.ts`)

- **포맷은 m4a(AAC) 하나로 통일한다.** 원본은 opus인데 **iOS Safari가 .ogg 컨테이너를
  재생하지 못한다** — 모바일 웹 게임이라 그쪽에서 안 들리면 의미가 없다.
  원본은 기획 폴더에 있고 리포에는 변환본만 둔다(`bash docs/build-sfx.sh`).
- **HTMLAudioElement가 아니라 Web Audio API를 쓴다**(2026-08-12 전환, iOS 실기 제보).
  예전 구현은 iOS Safari에서 두 가지가 깨졌고, **데스크톱에서는 둘 다 재현되지 않는다** —
  크롬에서 확인하고 고쳤다고 판단하지 말 것.
  - **`unlockSfx()`는 삭제했다. 되살리지 말 것.** `volume = 0`으로 6개 파일을 무음
    재생해 잠금을 푸는 함수였는데, **iOS의 `HTMLMediaElement.volume`은 읽기 전용이라
    대입이 조용히 무시된다.** 무음이 아니라 효과음 6개가 제 볼륨으로 동시에 울렸다
    (긴 파일 coupon_lose·coupon·coindrop만 귀에 걸려 "무작위로 2~3개"로 보였다).
    이제 `playSfx` 앞의 `ctx.resume()`이 그 역할을 대신하므로 잠금 해제 함수 자체가
    필요 없다. `handleStart`에 다시 배선하지 말 것.
  - **음량 제어는 GainNode로만 한다.** `gain.gain`은 iOS에서도 정상적으로 쓰인다 —
    읽기 전용인 건 `HTMLMediaElement.volume`뿐이다. 음소거는 게인을 0으로 두는 것이라
    이미 재생 중인 소리까지 같이 멎는다(예전 `pauseAll`이 하던 일).
  - **버튼 클릭음 지연도 여기서 왔다.** `currentTime = 0` → `play()`가 매번 디코더를
    다시 태워 일정한 딜레이가 붙었다. 미리 디코드한 AudioBuffer를 `start()`하면 없다.
- **프리로드는 `useButtonClickSfx`의 마운트 시점에 건다**(`preloadSfx()`). 시작 버튼에
  걸면 늦다 — **첫 pointerdown이 시작 버튼이라는 보장이 없다**(언어 선택, 약관 팝업,
  소리 토글, 친구 초대하기가 모두 앞선다). `decodeAudioData`가 비동기라 버퍼가 없는
  재생은 조용히 건너뛰어지므로, 늦게 걸면 그 앞의 버튼들이 첫 소리를 잃는다.
- **AudioContext를 모듈 최상위에서 만들지 말 것.** 서버 렌더와 node 테스트에는
  window도 AudioContext도 없어서 import 시점에 던진다 — `sfx.test.ts`가 통째로 죽는다.
  `getCtx()`가 지연 생성한다. 제스처 밖에서 만들어도 되며(suspended로 생기고
  `decodeAudioData`는 그 상태에서도 동작한다), 재생 직전 `resume()`이 깨운다.
- **음소거 검사는 `getCtx()`보다 먼저 온다.** 소리를 끈 사람에게 오디오 하드웨어를
  깨울 이유가 없다. 순서가 뒤집히면 `sfx.test.ts`의 "음소거 상태면 AudioContext를
  만들지도 않는다"가 잡는다.
- **재생 실패는 절대 던지지 않는다.** 소리는 게임 진행에 필수가 아니고, 제스처 전
  자동재생 차단은 정상 동작이다. `playSfx`는 모든 실패를 삼킨다.
- 같은 소리가 연달아·겹쳐 나야 한다(정답 연속). BufferSource는 일회용이라 재생마다
  새로 만들고, 디코드된 버퍼만 이름당 하나 캐시한다.
- 결과 소리(당첨/꽝)는 **카드가 돌아간 뒤에** 낸다(`GatchaCard`의 450ms 지연).
  탭하자마자 내면 앞면이 보이기도 전에 결과가 소리로 새어나간다.
- 결과표의 `coindrop`은 **점수와 무관하게 항상 난다.** 만점자 전용 연출이 아니라
  "결과가 나왔다"는 신호다(2026-08-07, 이란토). 만점자 이펙트를 붙일 때 이걸
  조건부로 바꾸지 말 것 — 만점자 소리는 별도로 얹는다.
- 음소거 상태는 `localStorage`에 남긴다. 매장·공공장소에서 소리를 못 켜는 상황이 흔하다.
- **카운트다운과 종료 화면에도 소리가 있다**(2026-08-12 추가). 3·2·1은 `count_ready`,
  START는 `count_start`, CLEAR!는 `game_clear`, GAME OVER는 `game_over`다.
  - 카운트다운 소리는 `step`을 보는 **별도 이펙트**에 있다. 진행을 모는 타이머 이펙트
    안에 넣으면 `setTimeout` 콜백 시점, 즉 그 칸이 **끝날 때** 울려서 한 칸씩 밀린다.
  - 종료 멜로디는 `playedRef` 가드가 있다. 빈 의존성 이펙트는 StrictMode에서 두 번
    돌고, 1~3초짜리 멜로디는 겹치면 바로 들린다(짧은 효과음과 다르다).

# 픽셀 폰트 서브셋 (`docs/build-pixel-font.sh`)

`public/fonts/Galmuri11.woff2`는 **서브셋본**이다(2012자, 77KB). 원본은 20965자 505KB로
첫 방문 전송량의 절반 이상을 차지했다.

- **원본은 `docs/fonts-src/Galmuri11.woff2`에 있다.** 서브셋본을 다시 서브셋하면 글자가
  계속 줄어들므로 빌드는 반드시 원본을 입력으로 쓴다. 스크립트가 원본이 없으면 실패한다.
- **로케일 문구를 고치면 다시 돌릴 것** — 특히 새 언어를 추가했을 때. 서브셋에 없는
  글자는 에러 없이 두부(􏿽)로 보인다(이모지 폰트와 같은 함정).
- **문자 집합은 넉넉하게 잡는다.** ASCII 전부 + 로케일 3종의 모든 문자 + 소스에
  하드코딩된 리터럴(`GAME OVER`/`CLEAR!`/`START`) + 일본어 여유분 1529자.
  - **"어떤 키가 픽셀 폰트에 걸리는지" 추적해서 좁히지 말 것.** 실제로 그렇게 92자를
    뽑았다가 하드코딩 리터럴의 `A·C·L·O·V·!`가 통째로 빠진 세트를 만들 뻔했다
    (그 문구들이 i18n을 떠났기 때문). 한글·한자는 어차피 필요한 것만 남아서
    넉넉하게 잡아도 몇 KB 차이다.
  - 일본어 여유분(`docs/kanji-subset.txt`)은 **빈도 상위 1500자 + 상용한자에 있으나
    JIS 제1수준에 없는 글자**다. 표준 하나만으로는 부족하다 — 문학 빈도 상위 1200자를
    넣어도 지금 쓰는 174자 중 15자가 빠지고(匿·営·秒·豚·膳 등 UI/도메인 어휘),
    JIS 제1수준은 1978년 제정이라 `丼`(덮밥) 같은 현대 어휘가 없다.
    근거는 `~/.agents/common-rag/일본어_웹폰트_서브셋_한자범위_결정.md`.
- **`--layout-features=''`를 쓰지 말 것.** 이모지 폰트 스크립트에는 있지만, 거기서
  GSUB을 비운 탓에 VS16 클러스터가 깨진 사고가 있었다. 텍스트 폰트는 위험도가 다르다.
- **파일명을 바꾸지 말 것.** `globals.css`가 next/font가 만든 family 이름(`galmuri`)을
  하드코딩하고 있어서 파일을 옮기거나 이름을 바꾸면 같이 고쳐야 한다.
- 빌드 스크립트에 검증이 들어 있다 — 필수 문자열이 cmap에 없으면 실패한다.
  **DB에서 오는 문자열(닉네임·설문 문항)은 서브셋으로 방어할 수 없으므로 픽셀 폰트
  요소에 넣지 말 것.** 지금은 닉네임이 `text-ink`(본문 폰트)라 안전하다.

# BGM (`app/lib/bgm.ts`)

메인 BGM은 모든 화면에서, 게임 BGM은 `playing` 동안 재생된다(`useBgm`이 phase만 보고
갈아끼운다). `gameEnd`는 메인으로 돌아간다 — 거기서 결과 멜로디가 울리므로 게임 BGM이
이어지면 겹친다.

- **BGM은 `sfx.ts` 경로를 타지 않는다. `SFX`에 넣지 말 것.** `preloadSfx`가
  `decodeAudioData`로 압축을 풀어 상주시키는데, 효과음은 전부 합쳐 166KB지만 BGM은
  58초·64초짜리라 디코드하면 **각각 20MB·21MB의 PCM**이 된다. 이름 하나만 넣어도
  마운트에서 500KB를 받고 41MB를 물고 있게 된다 — 데스크톱에서는 티가 나지 않는다.
  `sfx.test.ts`의 가드 2개("SFX 목록에 BGM이 섞여 있지 않다", "preloadSfx: BGM 파일은
  요청하지 않는다")가 이 회귀를 잡는다.
- **`<audio>`를 쓰는 것은 2026-08-12의 Web Audio 전환(`2858766`)에 대한 되돌림이 아니다.**
  그 커밋이 `<audio>`를 버린 이유는 (1) `volume` 대입이 iOS에서 무시된다,
  (2) 재생마다 디코더를 다시 태워 지연이 붙는다 — 둘 다 **짧은 효과음을 반복 재생**할
  때의 문제다. BGM은 한 번 틀어놓고 두는 것이라 지연이 의미 없고, 음량은 에셋에 굽는다.
  **`sfx.ts`를 `<audio>`로 되돌리는 것은 여전히 금지다.**
- **음량은 코드가 아니라 에셋에 있다.** `audio.volume` 대입은 iOS에서 조용히 무시되므로
  쓰지 말 것. `docs/build-sfx.sh`의 필터 체인이 담당하며, 조정하려면 스크립트를 다시 돌린다.
  - 처음엔 `volume=0.5` 한 줄이었는데 실기에서 여전히 시끄러웠다. **`volume`은 전체를
    균일하게 줄여 평균만 낮추고 순간 피크는 그대로 남기기 때문이다**(당시 평균 -18.8 LUFS,
    피크 -1.2 dBFS로 사실상 최대치). 지금은 EQ + 컴프레서로 다이내믹을 정리한 뒤 볼륨을
    건다 — 폰 기준 -28 LUFS, 피크 -8.3 dBFS.
  - **`volume`은 체인의 맨 마지막이어야 한다.** 리미터/컴프레서를 그 뒤에 두면 게인을
    도로 끌어올려 0 dBFS를 넘어 클리핑된다(실측 +1.9 dBFS).
  - **폰에서 시끄러운 원인은 저역이 아니라 1~4kHz 중고역이다.** 각자의 스마트폰에서
    재생되므로 폰 스피커가 재생하지 못하는 초저역은 애초에 들리지 않는다 — 저역을
    깎는 근거를 "스피커에서 웅웅거린다"로 적지 말 것. 실측으로도 폰 스피커 응답을
    통과시키면 저역이 빠지면서 5dB 낮게 나온다.
  - 효과음 중 가장 조용한 `coindrop`(-29.0 LUFS)과 비슷한 수준으로 맞췄다. BGM은 계속
    깔리는 소리라 그보다 크면 효과음이 묻힌다.
- **음소거는 `setSfxMuted` 한 곳에서 처리한다.** BGM은 마스터 GainNode를 거치지 않으므로
  (`<audio>`가 그래프 밖이다) 게인 조작만으로는 멎지 않는다 — `setSfxMuted`가
  `applyBgmMuted`를 부른다. **컴포넌트에 흩지 말 것**: 토글이 여러 화면에 있어서 한 곳만
  빠져도 BGM이 남는다.
- **자동재생 정책 때문에 마운트만으로는 시작되지 않는다.** `useButtonClickSfx`가 첫
  pointerdown에서 `resumeBgm`을 부른다. **버튼 판정 바깥**에 걸려 있다 — 화면 아무 데나
  눌러도 시작되어야 하고, 첫 조작이 버튼이라는 보장이 없다(`preloadSfx`를 거기 둔 것과
  같은 이유). `resumeBgm`은 멱등이라 매번 불려도 곡이 처음으로 돌아가지 않는다.
- `<audio>` 요소는 **하나만 만들어 돌려쓴다.** 곡마다 만들면 게임이 끝나고 메인이
  돌아올 때 이전 요소가 살아남아 두 곡이 겹친다.
- **`audio.load()`를 부르지 말 것.** `preload = "none"`을 무효화해서, 자동재생이 막혀
  아직 틀지도 못한 곡을 첫 화면에서 통째로 받아버린다(실측: `bgm_main` 240KB).
  `src`만 걸어두면 실제 `play()` 시점에 받는다.
- 곡이 바뀌면 **처음부터** 재생한다(이어듣기 아님, 2026-08-12 이란토).

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
  - `share_click`은 시작 화면의 '친구 초대하기'가 부른다(아래 참고).
- **재방문자에게는 닉네임을 재배정하지 않는다.** `assign_random_nickname` RPC는 **멱등하지 않다** — 이미 닉네임이 있는 participant_id로 호출해도 새로 뽑아서 덮어쓴다(2026-08-05 실제 배포에서 확인, 새로고침마다 닉네임이 바뀐다는 제보로 드러남). 그래서 `ensureParticipant`는 `isNewParticipant`가 false면 `lookupExistingNickname()`(→ `get_participant` RPC)으로 저장된 닉네임을 **읽기만** 한다. 조회가 실패하거나 아직 닉네임이 없을 때만 배정으로 넘어간다. `participants` 직접 SELECT는 RLS로 막혀 있어 RPC가 필수다.
  - **재방문 경로도 `nickname_number`를 붙여야 한다.** `nicknameFromParticipantRows`가 `nickname_first`/`nickname_last`만 조합하고 번호를 빠뜨리면, 배정 직후에는 `든든한 국밥 #0023`인데 다시 접속하면 `든든한 국밥`으로 떠서 **같은 사람인데 이름이 달라 보인다**(2026-08-10 제보 — "닉네임 다시 뽑기가 안 먹는 것 같다"는 증상으로 드러났다). 배정 API는 DB가 조립한 문자열을 그대로 쓰므로 번호가 이미 들어 있고, 조회 경로만 직접 붙여야 한다. `#` 앞은 non-breaking space(`gookbapanalyze`의 CouponScanner와 같은 규칙), 단어 사이는 일반 공백이다. `nickname_number`는 nullable이라 없으면 붙이지 않는다.
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
- **쿨타임 403은 에러가 아니라 복구 신호다.** 대부분 룰렛 도중 새로고침이며,
  이때는 `fetchMyCoupons()`의 최신 쿠폰을 그대로 보여준다.
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
  - **카드 앞면 안쪽 색(#F2F2F2)이 패널 배경(`--surface` #F2F4F6)과 사실상 같다.**
    그대로 두면 카드가 배경에 녹아 테두리만 남는다 — `WheelScreen`의 카드 자리에
    `.gatcha-well`(배경 한 톤 낮춤 + 안쪽으로 뒤집은 베벨)을 두는 이유다(2026-08-11 실측).
  - **앞면 레이아웃을 바꾸면 `app/lib/cardImage.ts`도 같이 고쳐야 한다.** 저장 이미지는
    DOM 캡처가 아니라 같은 구성을 canvas에 다시 그린 것이라, 두 곳이 같은 좌표(13%/11%
    inset, 노치 크기, 코너 마크 위치, QR 비율)를 각각 들고 있다. 한쪽만 고치면 화면과
    저장본이 조용히 달라진다(실제로 한 번 어긋났다 — 화면엔 노치, 저장본엔 민무늬 사각형).
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

# 효과음 (`app/lib/sfx.ts`)

- **포맷은 m4a(AAC) 하나로 통일한다.** 원본은 opus인데 **iOS Safari가 .ogg 컨테이너를
  재생하지 못한다** — 모바일 웹 게임이라 그쪽에서 안 들리면 의미가 없다.
  원본은 기획 폴더에 있고 리포에는 변환본만 둔다(`bash docs/build-sfx.sh`).
- **첫 재생은 사용자 제스처 안에서 일어나야 한다.** iOS·Android는 제스처 없는 재생을
  막는다. 시작 버튼(`page.tsx`의 `handleStart`)에서 `unlockSfx()`로 무음 재생을 한 번
  돌려 잠금을 풀어둔다 — 이걸 빼면 게임 안에서 정답 소리가 첫 번째만 안 난다.
- **재생 실패는 절대 던지지 않는다.** 소리는 게임 진행에 필수가 아니고, 제스처 전
  자동재생 차단(NotAllowedError)은 정상 동작이다. `playSfx`는 모든 실패를 삼킨다.
- 같은 소리를 연달아 내야 하므로(정답 연속) 재생 중이면 `currentTime = 0`으로 되감는다.
  엘리먼트는 이름당 하나만 만들어 캐시한다.
- 결과 소리(당첨/꽝)는 **카드가 돌아간 뒤에** 낸다(`GatchaCard`의 450ms 지연).
  탭하자마자 내면 앞면이 보이기도 전에 결과가 소리로 새어나간다.
- 결과표의 `coindrop`은 **점수와 무관하게 항상 난다.** 만점자 전용 연출이 아니라
  "결과가 나왔다"는 신호다(2026-08-07, 이란토). 만점자 이펙트를 붙일 때 이걸
  조건부로 바꾸지 말 것 — 만점자 소리는 별도로 얹는다.
- 음소거 상태는 `localStorage`에 남긴다. 매장·공공장소에서 소리를 못 켜는 상황이 흔하다.

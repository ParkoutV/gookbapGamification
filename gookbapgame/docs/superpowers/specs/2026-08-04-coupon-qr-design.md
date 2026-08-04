# QR 코드 기반 쿠폰 발급 설계

## 배경 / 문제

`gookbapanalyze`(대시보드) 쪽에 협업자(구자건)가 2026-07-30 ~ 08-03 사이 쿠폰 시스템의 **발급 서버와 매장 스캐너**를 이미 구현·배포했다.

- `7519a6d` 쿠폰 발급 API(`POST /api/gatcha/draw`) 생성
- `01c546f` `/coupon` QR 스캐너 페이지 신설(`html5-qrcode`), `CouponScanner`/`CouponHistoryModal`/`CouponSettingsModal`
- `d14452b` draw API에 쿨타임·Phase1 설문 완료 검증 추가
- `e9aaee3` 쿠폰 만료일(`expired_at`), 10분 내 사용 롤백(`undo_coupon` RPC)
- `560f574` 지점 관리자(User) 권한 오류 수정

반면 `gookbapgame`(게임 클라이언트)에는 쿠폰 개념이 전혀 없다. `app/components/WheelScreen.tsx`는 🎡 이모지와 "준비 중" 문구만 있는 29줄짜리 플레이스홀더이고, `/api/gatcha/draw`를 호출하는 코드도, 설문 화면도 없다. 즉 **유저가 쿠폰을 받고 매장에 QR로 제시할 경로가 없다.**

이 스펙의 범위는 그 빈 구간을 잇는 것이다: Phase1 설문 → 룰렛(가챠 발급) → 보유 쿠폰 QR 표시.

## QR 페이로드 규격 (기결정, 변경 불가)

매장 스캐너가 이미 파싱하고 있는 형식을 그대로 따른다. `components/coupon/CouponScanner.tsx`의 `handleScan()` 기준:

```
<coupon_id>?<lang_code>
예) 3f2504e0-4f89-41d3-9a0c-0305e82c3301?ko
```

- `coupon_id`는 정규식 `^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`를 통과해야 한다. 통과 못 하면 스캐너가 **조용히 무시**한다(다른 QR로 간주).
- `?` 뒤가 없으면 스캐너는 `ko`로 간주한다.
- `lang_code`는 스캐너가 `supported_languages.coupon_use_text`에서 안내문·에러 메시지를 고르는 데 쓴다.

## 게임 → DB 접근 방식 — 대안 비교

- **서버 액션 중심 (채택)**: 설문 조회/응답 저장, draw 호출, 쿠폰 목록 조회를 전부 `app/actions.ts`의 `"use server"` 액션으로 처리한다. `participant_id`는 클라이언트가 넘기지 않고 서버가 쿠키 토큰에서 `resolveParticipantId()`로 산출한다 — 남의 participant_id로 쿠폰을 뽑거나 조회하는 위조가 원천 차단된다. 기존 `ensureParticipant`/`fetchGameData`와 동일한 패턴이고, `app/lib/db.ts`의 anon 클라이언트가 서버에만 존재한다는 현재 구조를 유지한다.
- **클라이언트에서 `supabase-js` 직접 호출 (채택 안 함)**: `gookbapanalyze/AGENTS.md`의 RPC 예시가 이 형태이긴 하나, 게임에 `NEXT_PUBLIC_SUPABASE_*`를 새로 노출해야 하고 `participant_id`가 클라이언트 파라미터가 되어 위조가 가능해진다.
- **`gookbapanalyze`에 게임 전용 API 라우트 신설 (채택 안 함)**: draw 하나 때문에 이미 그쪽을 쓰고 있으나, 설문·쿠폰 조회까지 넘기면 환경변수와 크로스 오리진 경계만 늘고 이득이 없다.

## 화면 플로우

```
gameResult ──▶ surveyIntro ──┬─(참여)──▶ survey ──▶ wheel ──▶ dailyResult
                             └─(거절)──────────────────────────▶ dailyResult
                                                                   │
                                                   [설문하고 쿠폰 받기] 재진입
```

- **`surveyIntro`**: "설문에 답하면 쿠폰 룰렛을 돌릴 수 있어요"를 명시한다. 선택지는 두 개지만 **시각적 위계를 분명히 둔다** — '참여하기'는 기존 `pixel-mask-btn-solid` 스타일의 메인 버튼으로, 거절('다음에 할게요')은 그 아래에 테두리 없는 작은 일반 텍스트 링크로 배치한다. 두 개의 동등한 버튼을 나란히 두면 거절이 실제보다 매력적인 선택으로 보인다. `survey_questions`에 `survey_phase = 1` 문항이 **0개면 이 화면과 `survey`를 모두 건너뛰고 곧장 `wheel`로 간다**(문항을 등록하지 않은 운영 상태에서도 쿠폰 발급은 동작해야 하므로).
- **거절 경로**: `wheel`을 건너뛰고 바로 `dailyResult`로 간다. draw API가 Phase1 응답 없이는 403을 반환하므로 룰렛에 참여시킬 수 없다. `dailyResult`에 재진입 버튼을 남겨 마음이 바뀌면 `surveyIntro`로 되돌아갈 수 있게 한다.
- **`wheel`**: 진입 시 `drawCoupon()`을 **1회** 호출한다.
- **`myCoupons`**: 보유 쿠폰 목록. 항목을 탭하면 QR을 띄운다. `dailyResult`에서 진입한다.

## 아키텍처

```
app/page.tsx (client)
  └─ useGameProgress(trackId)        // 기존 훅: 타이머·점수·참여자 식별
      └─ useCouponFlow()             // 신규 훅: 설문·룰렛·쿠폰 상태
          ├─ loadSurvey()   → fetchSurveyQuestions(locale)
          ├─ submit()       → submitSurveyResponses(answers)
          ├─ spin()         → drawCoupon()
          └─ loadCoupons()  → fetchMyCoupons()

app/actions.ts ("use server")  — 전부 쿠키에서 resolveParticipantId()
  ├─ fetchSurveyQuestions(locale)
  ├─ submitSurveyResponses(answers)
  ├─ drawCoupon()
  └─ fetchMyCoupons()
```

`useGameProgress.ts`는 이미 타이머·점수·오답/콤보·참여자 식별을 들고 있어 충분히 크다. 쿠폰 흐름 상태는 **별도 훅 `app/hooks/useCouponFlow.ts`로 분리**한다. 두 훅의 결합은 phase 전환 콜백 하나뿐이다.

### 서버 액션 명세

| 액션 | DB 접근 | 비고 |
|---|---|---|
| `fetchSurveyQuestions(locale)` | `survey_questions` where `survey_phase = 1` 직접 SELECT | `survey_questions`는 Everyone SELECT 허용. 다국어 필드는 기존 `resolveLocalizedName()`으로 해석 |
| `submitSurveyResponses(answers)` | `survey_responses` INSERT | Everyone INSERT 허용. `participant_id`는 서버 산출값 사용 |
| `drawCoupon()` | `GATCHA_DRAW_API_URL` POST → 성공 시 `get_my_coupons` RPC | 반환: `{ status: 'won' \| 'miss' \| 'cooldown' \| 'error', coupon?: Coupon }` |
| `fetchMyCoupons()` | `get_my_coupons` RPC | 목록 화면과 draw 복구 경로가 공용 |

`issued_coupons` 직접 SELECT는 RLS로 차단되어 있다(`gookbapanalyze/AGENTS.md`). 반드시 `get_my_coupons` RPC를 쓴다.

### `drawCoupon()`이 coupon_id를 얻는 방법

`/api/gatcha/draw`는 `issued_coupons` INSERT에 `.select()`를 붙이지 않아 **응답에 `coupon_id`가 없다**(`{ success, coupon_type, score_used }`만 반환). 2026-08-04 기준 `upstream/main`(`560f574`)과 로컬 HEAD의 diff가 0인 것으로 확인했다.

따라서 draw 성공 후 `get_my_coupons`를 호출해 가장 최근 발급분을 읽어 `coupon_id`를 얻는다. 이 경로는 "내 쿠폰 목록" 화면이 어차피 필요로 하는 것과 동일하므로 데이터 경로가 하나로 합쳐진다.

### 컴포넌트

`app/components/` 아래:

- `SurveyIntroScreen.tsx` — 참여/거절 2버튼
- `SurveyScreen.tsx` — 문항 렌더링. `question_type` 0(단일 선택) / 1(다중 선택) / 2(주관식, `options[0]`에 다국어 placeholder) 세 종류 지원
- `WheelScreen.tsx` — 기존 플레이스홀더를 룰렛 연출 + 당첨/꽝 결과 표시로 교체
- `CouponQR.tsx` — `qrcode.react`로 페이로드 렌더
- `MyCouponsScreen.tsx` — 보유 쿠폰 목록, 항목 탭 시 `CouponQR`

`useGameProgress.ts`의 phase 유니온에 `surveyIntro | survey | myCoupons`를 추가한다.

### 의존성

`qrcode.react` — `gookbapanalyze`가 이미 `^4.2.0`을 쓰고 있으므로 동일 버전을 쓴다. `html5-qrcode`는 게임에 불필요하다(스캔은 매장 직원이 한다).

### 환경변수

`GATCHA_DRAW_API_URL` — `gookbapanalyze`의 `/api/gatcha/draw`를 가리킨다. 기존 `GENERATE_UNIFIED_API_URL`/`NICKNAME_ASSIGN_API_URL`과 같은 패턴이다.

**닉네임과 달리 로컬 폴백이 존재하지 않는다.** 쿠폰은 서버가 DB에 INSERT해야만 유효하므로 클라이언트가 가짜 쿠폰을 지어낼 수 없다. 미설정이거나 호출이 실패하면 반드시 에러로 노출한다. 이후 누가 폴백을 추가하지 않도록 코드 주석에도 남긴다.

## 언어 코드

게임은 자신의 로케일 코드(`app/lib/i18n/types.ts`의 `"ko" | "en" | "ja"`)를 **변환 없이 그대로** QR 페이로드에 싣는다. 순수 언어 코드만 사용하는 것이 원칙이고, 매핑 함수를 두어 다른 쪽의 오기입을 영구화하지 않는다.

주의: `supported_languages.lang_code`는 `gookbapanalyze`의 `/main/languages` 자유 입력창에서 관리자가 직접 타이핑하는 값이며(`toLowerCase()`만 적용), 코드상 허용 목록이 없다. 한편 `CouponScanner.tsx`의 `localeMap`은 일본어를 **`jp`**로 하드코딩하고 있다. 아래 "미해결 항목" 참고.

## 에러 · 엣지케이스

| 상황 | 처리 |
|---|---|
| 꽝 (`coupon_type: null`) | 룰렛 연출 후 "아쉽네요" 화면. 꽝에도 `roulette_joined`가 갱신되어 쿨타임이 소모되므로, 다음 도전 가능 시각을 안내한다 |
| 룰렛 도중 새로고침 | draw가 쿨타임 403 → 에러 대신 `fetchMyCoupons()`의 최신 쿠폰을 표시한다. **draw는 일회성 이벤트이고 쿠폰 목록이 영속적 진실이다** |
| draw 403 | 설문은 게임이 선행 완료시키므로 남는 403은 사실상 쿨타임뿐이다. 재도전 안내를 띄운다. (draw API의 403은 기계 판독용 `code` 없이 한국어 문자열만 반환하므로 문자열 매칭은 하지 않는다) |
| `GATCHA_DRAW_API_URL` 미설정 / 네트워크 실패 | 로컬 폴백 금지. "지금은 접속이 원활하지 않습니다. 잠시 후 다시 시도해 주세요."를 띄우고 **그대로 다음 화면으로 진행**한다. 발급도 쿨타임 갱신도 일어나지 않았으므로 기회는 살아 있다 — `pendingDraw` 표시를 남겨 다음 방문 시작 화면에 뽑기 진입 버튼을 노출한다. 전용 재시도 버튼은 두지 않는다(하루 한 번뿐인 기능에 과한 장치) |
| `get_my_coupons` 호출 실패/권한 없음 | 발급은 되었으나 QR을 그릴 수 없는 상태. "쿠폰은 발급되었으나 지금 표시할 수 없어요 — 잠시 후 다시 확인해주세요"로 안내하고 목록 화면에서 재조회를 유도한다 |
| 만료 / 사용완료 쿠폰 | 목록에 흐리게 표시하고 QR 탭을 비활성화한다. 만료 판정은 `expired_at`(KST 23:59:59.999 기준) |
| 설문 중복 제출 | 제출 버튼 disable + 서버 액션에서 기존 응답이 있으면 INSERT를 건너뛴다 |

## 테스트

기존 `node --test` 패턴을 따른다.

- `drawCoupon()` — 성공 / 꽝 / 쿨타임 403 / 네트워크 실패 4경로 (fetch 스텁)
- 설문 응답 payload 조립 — `question_type` 0 / 1 / 2 세 타입
- QR 페이로드 문자열이 스캐너의 UUID 정규식과 `?lang` 분리 로직을 통과하는지
- Phase1 문항 0개일 때 `surveyIntro`/`survey`를 건너뛰는 분기

수동 확인은 `docs/local-test-setup.md`대로 서버 2개를 띄운 뒤 진행한다. 테스트 DB seed에는 `survey_questions`/`supported_languages`가 없으므로 픽스처 추가가 필요하다.

## 미해결 항목 (구자건 확인 필요)

1. **`get_my_coupons` RPC의 anon 실행 권한** — 이 RPC는 어떤 마이그레이션 파일에도 없고 `AGENTS.md` 문서에만 존재한다(프로덕션 전용). 게임의 anon 키로 실행 가능한지(`SECURITY DEFINER` + `GRANT EXECUTE TO anon`) 확인이 필요하다. 열리지 않으면 `/api/gatcha/draw`의 INSERT에 `.select('coupon_id').single()`을 추가해 응답에 `coupon_id`를 실어달라고 요청한다.
   - **(2026-08-04 구현 후 갱신) 여전히 미해결.** 로컬 Supabase 인스턴스에는 이 프로젝트의 RPC(`get_my_coupons`, `get_participant`, `get_my_score_logs`, `undo_coupon`, `get_coupon_info_for_scan`)가 하나도 없다 — 전부 프로덕션에만 존재하고 리포지토리 어디에도 마이그레이션 파일이 없다. 코드는 응답 컬럼이 `coupon_id`/`coupon_type`/`is_used`/`expired_at`라고 가정하며, RPC의 정렬 순서를 신뢰할 수 없어 `created_at` 컬럼이 있으면 방어적으로 재정렬한다. `drawCoupon()`은 배열의 `[0]`을 방금 발급된 쿠폰으로 취급하므로, 정렬이 예상과 다르면 에러 없이 예전 쿠폰의 QR을 새 당첨 쿠폰인 것처럼 보여줄 수 있다 — 쿠폰을 2개 이상 보유한 참여자로 반드시 검증할 것.
2. **`supported_languages.lang_code`의 실제 일본어 코드** — DB에 `ja`가 들어 있다면 `CouponScanner.tsx`의 `localeMap`이 `jp`로 잘못 하드코딩된 것이므로 그쪽을 고쳐야 한다. DB에 `jp`가 들어 있다면 DB 값을 `ja`로 정정한다. 어느 쪽이든 게임은 `ja`를 보낸다.
   - **(2026-08-04 구현 후 갱신) 여전히 미해결.** 게임은 자체 로케일 코드를 변환 없이 그대로 보낸다. 로컬 픽스처는 `ja`로 시딩했지만, 매장 스캐너 앱은 `localeMap`에 `jp`를 하드코딩하고 있고, 프로덕션 `supported_languages`의 실제 값은 확인하지 못했다.
3. **`game_score_logs`의 컬럼 구성** — 코드로 확인된 것은 `participant_id`, `gookbap_score`, `joined_time` 셋뿐이다. `ranking_view`는 `best_score`와 `gookbap_score`를 서로 다른 값으로 노출하는데(커밋 `6af1458`의 내부 0~100 비율 / 표시 1953 환산 분리), `best_score`가 이 테이블에 있고 NOT NULL이라면 무엇을 넣어야 하는지 확인이 필요하다.
   - **(2026-08-04 구현 후 갱신) 여전히 미해결이며, 이제 실사용에 직결된다.** 이 테이블도 로컬에는 존재하지 않는다. INSERT는 프로덕션 draw API 자체의 쿼리에서 그대로 읽어낸 `participant_id`/`gookbap_score`/`joined_time`을 사용한다. 만약 이 INSERT가 빠뜨린 NOT NULL 컬럼이 있다면(`best_score`가 유력 용의자) 점수 기록이 조용히 실패하고, gatcha 확률 구간이 모든 플레이어에 대해 최저 구간으로 붕괴한다.
4. **draw API 403의 사유 구분** — 현재 쿨타임과 설문 미완료가 모두 `code` 없는 한국어 문자열 403이다. 게임이 사유를 구분해 다국어로 안내하려면 `code` 필드가 필요하다. 이번 스펙에서는 설문을 선행 완료시켜 우회하므로 차단 요인은 아니다.
   - **(2026-08-04 구현 후 갱신) 변동 없음.** 여전히 기계 판별 불가능한 한국어 문자열뿐이다. 게임은 draw 전에 설문을 완료시켜 우회하므로 여전히 차단 요인은 아니다.

## 함께 포함하는 것 — 게임 점수 제출

`gookbapgame`은 현재 `game_score_logs`에 아무것도 쓰지 않는다(2026-07-30 참여자 식별 스펙에서 후속으로 분리된 뒤 미구현). draw API는 집계 시간 내 최고 점수로 `gatcha_cases` 구간을 고르므로, 기록이 없으면 `bestScore`가 항상 0이 되어 **모든 플레이어가 최저 구간 확률 풀로만 뽑는다.** 점수 구간별 확률 설계가 통째로 무력화되므로 이번 스펙에 포함한다.

게임 완주 시 `game_score_logs`에 INSERT한다(Anon INSERT 허용). 이 기록은 KPI의 게임 완주율에도 함께 쓰인다.

## 범위 밖

- Phase 0(힌트 질문) / Phase 2(지점 특화) 설문
- 매장 스캐너 쪽 변경 (`gookbapanalyze/components/coupon/*`)
- 쿠폰 사용 취소(`undo_coupon`) — 매장 직원용 기능이며 게임에 노출하지 않는다
- 가챠 확률·구간(`gatcha_cases`) 편집 — 대시보드 기능

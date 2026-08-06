# 첫 진입 시퀀스 설계 (TERM · 튜토리얼 · 백그라운드 프리로드)

작성일: 2026-08-06
관련: `docs/client/ROADMAP.md` C1 단계, `docs/client/20260805.md`

## 목표

최초 접속자에게 다음 흐름을 제공한다.

```
접속 → [TERM 팝업] → 시작 화면 → '게임 시작' → [튜토리얼] → 게임
                                                  ↑
                                    이 사이 프리로드가 백그라운드로 진행
```

재방문자는 TERM도 튜토리얼도 뜨지 않고 기존과 동일하게 `시작 화면 → 로딩 → 게임`으로
간다. 튜토리얼은 최초 실행 이후에도 시작 화면의 상시 버튼으로 언제든 다시 볼 수 있다.

게임 최초 로딩이 이 앱에서 가장 오래 걸리는 구간이므로, 최초 실행자가 튜토리얼을 읽는
시간을 프리로드 시간으로 덮는 것이 이 설계의 핵심 이득이다.

## 배경: 지금 구조와 무엇이 충돌하는가

`app/hooks/useGameProgress.ts`의 `runPreload()`는 마지막에 `setPhase("playing")`을 직접
호출한다. 즉 **프리로드 완료가 곧 화면 전환**이다. 이 상태로 튜토리얼을 병렬로 띄우면
프리로드가 끝나는 순간 튜토리얼을 읽던 사용자가 게임으로 튕겨나간다.

따라서 이 기능의 전제는 "프리로드 완료"와 "게임 진입"을 분리하는 것이다.

## 1. 상태 구조

`useGameProgress`에 프리로드 상태를 독립된 값으로 추가한다.

```
preloadStatus: "idle" | "loading" | "ready" | "error"
```

- `runPreload()`는 `sessions` / `loadNonce` / `preloadStatus` / `loadError`만 갱신한다.
  **`setPhase`를 호출하지 않는다.**
- 자동 진입은 효과 하나가 담당한다:
  `phase === "loading" && preloadStatus === "ready"` → `setPhase("playing")`.
  (튜토리얼을 건너뛰는 재방문자 경로가 기존과 똑같이 동작한다.)
- 튜토리얼 마지막 페이지의 `시작하기` 버튼은 `disabled = preloadStatus !== "ready"`이고,
  클릭 시 `setPhase("playing")`.

부수 효과로 `retryPreload`가 `PreloadScreen`과 튜토리얼 에러 상태 양쪽에서 동일하게
동작한다 — 그냥 다시 돌리고, 보고 있는 화면이 `preloadStatus`에 반응한다.

### 준비 완료를 `sessions`에서 유도하지 말 것

`preloadStatus`를 `sessions.length > 0` 같은 파생값으로 대체하면 안 된다. `startGame()`은
`sessions`를 비우지 않고, `page.tsx`의 `leaveDrawFlow`는 `sessions`를 든 채로 `start`
phase로 돌아올 수 있다. 뽑기 흐름을 거쳐 두 번째 게임을 시작하는 사용자는 파생 플래그가
즉시 `ready`가 되어 **직전 판의 스테이지 데이터로 게임이 시작된다.**

→ `preloadStatus`를 `"loading"`으로 되돌리는 책임은 **`runPreload()`의 첫 문장**이
가진다. `startGame()`에 두지 않는 이유는 `retryPreload()`를 포함한 모든 호출자가 자동으로
같은 보장을 받게 하기 위해서다 — 호출자마다 리셋을 기억해야 하는 구조면 언젠가 빠진다.

이 배치는 경합도 만들지 않는다. `startGame()`은 `setPhase("loading")`을 호출한 뒤 곧바로
`runPreload()`를 부르고, `runPreload()`는 첫 `await` 이전에 `setPreloadStatus("loading")`을
실행한다. 두 setState가 같은 React 배치에 들어가므로 `phase === "loading" &&
preloadStatus === "ready"`인 중간 렌더가 존재하지 않는다.

## 2. 화면 배치

- **튜토리얼은 `GamePhase`에 추가한다** (`"tutorial"`). `"loading"`이 이미 그렇듯 흐름의
  한 단계이기 때문이다.
- **TERM은 phase가 아니라 `page.tsx`의 오버레이로 렌더한다.** 시작 화면 위에 뜨는 모달일
  뿐인데 phase로 만들면 `GamePhase` union과 `resetToStart`까지 건드려야 한다.

## 3. 로컬 상태(쿠키)

TERM은 보관해야 할 계약 동의가 아니라 **의무 고지**다. "확인을 누르면 약관에 동의한
것으로 간주"하는 일반적인 게임 패턴을 따르며, 민감정보를 다루지 않으므로 동의 이력을
서버에 남기지 않는다. **서버 통신·DB 기록을 추가하는 방향으로 확장하지 말 것.**

새 파일 `app/lib/firstRunFlags.ts`에 모은다(`app/lib/pendingDraw.ts`와 같은 모양).

| 쿠키 | 기록 시점 |
|---|---|
| `gookbapgame_term_ack` | 확인 버튼 클릭 시 |
| `gookbapgame_tutorial_seen` | 튜토리얼 완주(`시작하기` 클릭) 시 |

공통 속성: `path=/`, `SameSite=Lax`, 만료 2년(기존 `gookbapgame_token`과 동일),
httpOnly 아님 — 서버가 읽을 이유가 없다.

**기록 시점을 "표시할 때"가 아니라 "끝냈을 때"로 잡은 이유**: 도중에 새로고침한 사용자는
아직 읽지 않은 것이므로 다시 보여주는 쪽이 맞다. 같은 이유로 **프리로드 실패로 게임에
진입하지 못한 경우에도 튜토리얼 쿠키는 써지지 않는다**(의도된 동작).

기존 로컬 플래그(`pendingDraw`, `surveySubmitted`)는 localStorage를 쓴다. 여기서 쿠키를
쓰는 것은 만료가 있기 때문이다 — 고지가 2년 뒤 다시 노출되는 것은 방어 가능한 동작인
반면 localStorage는 만료되지 않는다.

**하이드레이션**: 두 쿠키 모두 렌더 중이 아니라 `useEffect`에서 읽는다.
`page.tsx`의 `showDrawEntry`(`useState` + `useEffect`)와 같은 패턴이며, 그 자리의 주석이
이유를 설명한다. `useState(() => hasSeenTerm())` 형태는 서버 렌더와 어긋난다.

## 4. 튜토리얼 컴포넌트

컴포넌트는 하나, `mode` prop 하나로 두 용도를 가른다.

| | `onboarding` (최초 게임 시작) | `review` (시작 화면 버튼) |
|---|---|---|
| 진입 | `startGame()` 시 튜토리얼 미시청이면 | 시작 화면의 상시 버튼 |
| 마지막 버튼 | `시작하기` — `preloadStatus === "ready"`일 때만 활성 | `닫기` — 게이트 없음 |
| 프리로드 | 병렬로 진행 | 진행하지 않음 |
| 닫으면 | `playing` | `start` |
| 쿠키 기록 | 완주 시 씀 | 쓰지 않음 |
| 좌상단 X | 있음 → `start` 복귀, 쿠키 안 씀 | 있음 → `start` 복귀 |

**불변 조건: `review` 모드는 절대로 `runPreload()`를 호출하지 않는다.** 자동 전환 효과가
`phase === "loading"`을 조건으로 걸고 있어 `review`(phase는 `"tutorial"`) 중에는 무해하지만,
누군가 "미리 받아두면 빠르겠지" 하고 `review`에서 프리로드를 붙이면 그 순간 게임 진입
경로가 열린다. 선제적 프리로드를 추가하지 말 것.

`onboarding`에도 X를 두는 이유는 프리로드가 계속 실패할 때 사용자가 갇히지 않게 하기
위해서다. X로 나가도 `preloadStatus`는 되돌리지 않으므로, 이미 `ready`면 다시 시작할 때
곧바로 게임에 들어간다.

### 대기·실패 표시

마지막 페이지의 버튼 자리 하나가 세 가지 상태를 표현한다. 별도 화면 전환은 없다.

| `preloadStatus` | 버튼 자리 |
|---|---|
| `loading` | `준비 중...` + 스피너, 비활성 |
| `ready` | `시작하기`, 활성 |
| `error` | 에러 문구 + `다시 시도` (`PreloadScreen`의 에러 UI와 동일한 내용) |

## 5. 튜토리얼 문구

이미지 자리는 빈 슬롯으로 남기고, 로드맵 A단계(디자인 톤·아이콘)가 끝난 뒤 채운다.
문구는 `app/lib/stageConfig.ts`의 실제 상수에서 도출한 것이다.

| 페이지 | 내용 | 근거 상수 |
|---|---|---|
| 1/3 무엇을 | 좌우 두 그림에서 다른 곳을 찾아 터치. 총 7단계, 단계마다 5곳(7단계만 7곳) | `STAGE_CONFIG` |
| 2/3 제한 | 전체 제한시간 300초(단계별이 아닌 통짜). 한 단계에서 3번 틀리면 그 단계 종료 후 다음 단계로. 오답마다 -10점 | `GLOBAL_TIME_LIMIT_SEC`, `WRONG_TOUCH_LIMIT_PER_LEVEL`, `WRONG_TOUCH_PENALTY` |
| 3/3 점수 | 빨리 끝낼수록 시간 보너스, 연속 정답 시 콤보 보너스. 종료 후 국밥 등급과 쿠폰 뽑기로 이어짐 | `calcTimeBonus`, `calcComboBonusForStreak` |

ko / en / ja 세 로케일 모두에 **같은 커밋에서** 추가한다(`app/lib/i18n/locales/`).
`Dictionary`는 `Record<string, string>`이고 키 정합성을 검사하는 테스트도 없다 —
`translateWith`가 ja→en→ko로 폴백하므로 ko만 추가해도 `npm test`는 통과하지만 영어·일본어
사용자에게 한국어 문구가 그대로 노출된다. 컴파일러도 테스트도 이걸 잡아주지 않는다.

## 6. 전제 (Assumption)

`useGameProgress`는 마운트 즉시 `ensureParticipant(trackId)`를 호출한다. 즉 토큰 쿠키
발급, `participants` row 생성, `track_logs` 기록이 **TERM 고지가 렌더되기 전에** 일어난다.

TERM을 동의 게이트가 아닌 의무 고지로 규정했고 민감정보를 수집하지 않으므로 현재
정책에서는 문제가 없다. 다만 향후 "고지 이전 수집 금지"로 정책이 바뀌면 이 순서를
뒤집어야 한다.

## 7. 테스트

이 저장소는 `app/lib/*.test.ts` 순수 함수 테스트 위주이며 컴포넌트 테스트가 없다. 그
관례를 유지한다.

- `app/lib/firstRunFlags.test.ts`
  - 쿠키 읽기/쓰기 왕복
  - `document`가 없는 환경(SSR)에서 `false` 반환, 쓰기는 무시
  - 만료 속성이 붙은 쿠키 문자열 형식
- 튜토리얼 컴포넌트 자체는 표시 로직뿐이므로 테스트하지 않는다(관례).

`preloadStatus` 전이는 **자동 테스트하지 않는다.** 이 저장소에는 React 컴포넌트/훅을
렌더할 테스트 인프라가 없고(러너는 `node --test`, testing-library 없음), 이 하나를 위해
의존성을 들이는 것은 과하다. 대신 두 가지로 대체한다.

1. **구조적 보장**: 리셋을 `runPreload()`의 첫 문장에 두어 호출자가 잊을 수 없게 한다(§1).
2. **수동 검증**: 아래 경로를 실제로 밟아 두 번째 판이 직전 판의 스테이지가 아닌지 확인한다.
   `docs/local-test-setup.md`대로 서버 두 개를 띄운 상태여야 한다.

   ```
   게임 1판 완주 → 게임 결과 → 설문 → 룰렛 → 오늘의 결과
     → '처음으로' → '게임 시작'
     → 2판의 스테이지가 1판과 다른 그림인지 확인
   ```

**테스트 파일을 추가할 때 주의**: `package.json`의 `test` 스크립트가 테스트 파일 경로를
하나씩 나열하는 방식이다(글롭이 아니다). 목록에 추가하지 않으면 `npm test`가 그 파일을
아예 실행하지 않고 조용히 통과한다.

## 8. 범위 밖

로드맵의 다른 단계에서 다룬다.

- 로딩 화면 디자인 개선, 튜토리얼 일러스트 — A단계(디자인 톤·아이콘·레퍼런스 이미지)
- 사운드·룰렛 그래픽·만점자 이펙트 — B단계
- 랭킹 페이지 — C2단계

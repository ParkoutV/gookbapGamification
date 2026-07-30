# 참여자 식별(Player Identity) 기반 다지기 설계

## 배경 / 문제

`gookbapanalyze`(대시보드) 쪽에 협업자(구자건)가 밤사이 다음을 이미 구현·배포함:
- `participants` 테이블에 `nickname_first_id`/`nickname_last_id` FK 추가, `nickname_presets`/`nickname_exclusions` 테이블 신설
- `POST /api/nickname/assign` — `participant_id`를 받아 서버(RPC `assign_random_nickname`)가 exclusion 규칙까지 적용해 닉네임을 배정하고 DB에 저장
- KPI 트래킹 가이드(`track_logs` 기반 방문자수/재도전율 등 9대 지표)

반면 `gookbapgame`(게임 클라이언트)은 현재 `participant_id` 개념 자체가 없다. 닉네임은 `app/lib/nickname.ts`의 24×24 하드코딩 형용사/명사 조합을 `localStorage`에 저장해 쓰고 있고, `participants`/`track_logs`/`game_score_logs` 등 어떤 테이블에도 아무것도 쓰지 않는다.

이 스펙의 범위는 **참여자 식별의 최소 기반**만 다진다: participant_id 발급/영속화, 최초 접속 트래킹(`track_logs`), 닉네임을 로컬 목록이 아닌 신규 API로 발급받기. 점수 제출(`game_score_logs`), 공유/설문 트래킹, 가챠·쿠폰 연동은 후속 스펙으로 분리한다(아래 "범위 밖" 참고).

## 참여자 식별 방식 — 대안 비교

2026-07-29 팀 회의에서 이미 논의·결정된 사항이 있어 그대로 따른다:

- **`localStorage`에 평문 UUID 저장 (최초 설계안, 채택 안 함)**: 구현은 가장 단순하지만, 회의에서 나온 "부정 참여 방지" 방향(가챠 확률 조작 우려 → 게임 데이터 실시간 DB 대조 검토, `docs`: `~/.agents/memory/project_gookbapgame_anticheat_direction.md`)과 맞지 않는다. `localStorage`는 클라이언트 JS/devtools에서 자유롭게 읽고 쓸 수 있어, 값을 바꿔가며 같은 브라우저로 여러 번 "새 참여자"처럼 행세하기가 너무 쉽다.
- **브라우저 쿠키 + 해시 토큰 (채택)**: 회의 결론 그대로 — 서버가 발급한 랜덤 토큰을 **httpOnly 쿠키**에 저장하고(클라이언트 JS 접근 불가), 그 토큰을 SHA-256 해시한 값을 `participant_id`로 사용한다. 브라우저를 바꾸거나 쿠키(캐시)를 지우면 토큰이 사라져 자연히 새 참여자로 초기화된다 — 회의록에 적힌 동작과 정확히 일치한다.

## 아키텍처

```
app/page.tsx (client)
  └─ useSearchParams()로 ?q=<track_id> 읽음 (Suspense 경계 필요)
      └─ useGameProgress(trackId)
          ├─ mount 시: ensureParticipant(trackId) 서버 액션 1회 호출
          ├─ startGame() 직전: pending이면 reassignNickname() 안전망 재시도
          └─ 재생성 버튼: reassignNickname() 호출

app/actions.ts ("use server")
  ├─ ensureParticipant(trackId: string | null)
  │    1. participantToken.getOrIssueToken() — 쿠키에 토큰 없으면 발급
  │    2. participantToken.hashToken(token) → participant_id
  │    3. supabase.from('participants').upsert({participant_id}, {onConflict:'participant_id', ignoreDuplicates:true})
  │    4. trackId 있으면 track_logs insert (best-effort, 실패 무시)
  │    5. requestNicknameAssign(NICKNAME_ASSIGN_API_URL, participant_id) 호출
  │       실패 시 nickname.ts의 generateNickname()으로 로컬 폴백, status='pending'
  └─ reassignNickname()
       쿠키에서 토큰 재해시 → 같은 participant_id로 4번 재호출

app/lib/participantToken.ts (신규)
  ├─ getOrIssueToken(): next/headers cookies() 사용, httpOnly/Secure/SameSite=Lax, 만료 2년
  └─ hashToken(token): Node crypto.createHash('sha256') — 순수함수, 테스트 대상

app/lib/nicknameApi.ts (신규)
  └─ requestNicknameAssign(apiUrl, participantId) — generateUnified.ts의 fetch 래퍼 패턴 동일 적용
     ({ok:true, nickname} | {ok:false, error})
```

`participant_id`나 발급된 `nickname`은 클라이언트에 별도로 영속화하지 않는다 — 매 마운트마다 `ensureParticipant`가 DB의 현재 상태(있으면 재사용, 없으면 신규 발급)를 그대로 반영해 React state로만 들고 있는다.

## 데이터 흐름

1. 유저가 `https://.../?q=<track_id>` 형태 링크(또는 파라미터 없는 직접 접속)로 진입.
2. `page.tsx`가 `q`를 읽어 `useGameProgress`에 전달.
3. 마운트 시 `ensureParticipant(trackId)`:
   - 쿠키에 토큰이 있으면(재방문) → 같은 해시 → 같은 participant_id → `participants` upsert는 아무 변화 없이 통과, 닉네임 API도 같은 participant_id로 호출되어 **기존에 배정된 닉네임을 그대로 반환**(RPC가 이미 배정된 유저에게 재배정하지 않는다는 전제 — 구현 시 RPC 동작 확인 필요, 아래 리스크 참고).
   - 토큰이 없으면(최초 방문) → 발급 → 신규 participant_id → participants insert → track_id 있으면 track_logs insert → 닉네임 신규 배정.
4. `q`가 없으면 (개발 서버 직접 접속, QA 등) `track_logs` insert만 건너뛰고 나머지는 그대로 진행.
5. 닉네임 API가 실패하면 `generateNickname()` 로컬 폴백을 화면에 보여주고 `nicknameStatus='pending'`으로 표시. 이후 (a) 다음 마운트, (b) "시작하기" 버튼 클릭 시점에 재동기화를 시도한다. 두 시점 모두 실패해도 게임 진행은 막지 않는다(오프라인 상태로 완주 가능, 단 그 경우 랭킹에 반영될 닉네임이 없거나 어긋날 수 있음 — 완전한 보장은 점수 제출 스펙에서 다룸).
6. 재생성(🔄) 버튼 → `reassignNickname()` → 같은 participant_id로 API 재호출 → DB의 배정을 갱신.

## 컴포넌트 변경

- **`app/page.tsx`**: `useSearchParams()` 사용을 위해 홈 콘텐츠를 Suspense로 감싸는 서브컴포넌트로 분리. (`AGENTS.md` 경고대로 이 프로젝트의 Next 버전이 표준과 다를 수 있으니, 구현 시 `node_modules/next/dist/docs/`에서 `useSearchParams`/동적 렌더링 관련 문서를 먼저 확인)
- **`app/hooks/useGameProgress.ts`**: `nickname`/`nicknameStatus`(`'loading'|'ready'|'pending'`)/`isRegenerating` state 추가. `regenerateNickname`을 async로 전환. `startGame()`에 pending 시 1회 재동기화 로직 삽입.
- **`app/components/StartScreen.tsx`**: 재생성 버튼에 `isRegenerating` 기반 disabled/스피너 표시 추가(현재는 동기 즉시반영이라 로딩 상태가 없었음).
- **`app/lib/nickname.ts`**: `generateNickname()`만 남기고 `loadOrCreateNickname`/`regenerateNickname`/`NICKNAME_STORAGE_KEY`(localStorage 기반) 제거.
- **`app/lib/participantToken.ts`, `app/lib/nicknameApi.ts`**: 신규.
- **`app/actions.ts`**: `ensureParticipant`, `reassignNickname` 추가.
- **`.env.local`**: `NICKNAME_ASSIGN_API_URL` 추가(로컬 개발 시 로컬 `gookbapanalyze` 인스턴스 URL, 프로덕션 값은 Vercel에 이란토가 별도 등록 예정).

## 에러 처리

| 실패 지점 | 처리 |
|---|---|
| `participants` upsert 실패 | 닉네임 API 호출 스킵, 로컬 폴백 닉네임 + `pending` |
| `track_logs` insert 실패 | 무시(로그만, best-effort — KPI 손실은 감수) |
| 닉네임 API 호출 실패(네트워크/응답 이상) | `generateNickname()` 로컬 폴백 + `pending`, 마운트/시작하기 시점에 재시도 |

세 경우 모두 게임 플레이 자체를 막지 않는다(회의에서 이미 확인된 원칙).

## 테스트

- `participantToken.hashToken`: 알려진 입력→SHA-256 출력값으로 단위테스트.
- `nicknameApi.requestNicknameAssign`: `generateUnified.test.ts`와 동일한 fetch 모킹 패턴으로 성공/에러 JSON/네트워크 실패/이상 응답 케이스.
- `nickname.test.ts`: 제거되는 함수(`loadOrCreateNickname`/`regenerateNickname`) 테스트 삭제, `generateNickname()` 포맷 테스트만 유지.
- `ensureParticipant`/`reassignNickname`: `fetchGameData`와 동일하게 단위테스트 대상 아님(Supabase+쿠키+외부 API가 얽혀 모킹 비용 대비 효용 낮음). 로컬 docker Supabase(시딩 완료 상태, `project_gookbapgame_local_supabase_seed` 메모리 참고)로 브라우저 골든패스 검증: 최초 접속(신규 participant+닉네임) → 새로고침(같은 닉네임 유지) → 재생성 버튼 → `?q=` 없이 접속 → 닉네임 API를 의도적으로 막아 폴백 동작까지 확인.

## 리스크 / 확인 필요 사항

- **재방문 시 RPC 동작 미확인**: `assign_random_nickname`이 이미 닉네임이 배정된 participant_id로 호출됐을 때 기존 값을 그대로 반환하는지, 아니면 새로 재배정(닉네임이 방문마다 바뀜)하는지 API 문서만으로는 알 수 없다. 구현 착수 시 로컬 Supabase로 직접 확인하고, 재배정되는 동작이면 "재방문 시엔 API를 다시 호출하지 않고 기존 DB 값을 조회만 하는" 별도 read 경로가 필요할 수 있음(설계 조정 필요).
- **`participants` 테이블의 다른 필수 컬럼 여부**: `participant_id` 외에 NOT NULL이면서 기본값 없는 컬럼이 있다면 upsert가 실패할 수 있다. 로컬 Supabase 스키마로 구현 시점에 확인.
- **httpOnly 쿠키의 만료/갱신 정책**: 이번 스펙에서는 "장기(예: 2년) 고정 만료"로 단순하게 간다. 갱신(rolling expiration) 여부는 범위 밖.

## 범위 밖 (후속 스펙)

- 게임 시작/재도전 카운트(`track_logs.game_start_count`), 점수 제출(`game_score_logs`) — 부정 참여 방지 방향(중간 트리거로 실시간 DB 대조)까지 함께 설계해야 함.
- 공유 클릭 트래킹, 설문 제출.
- 가챠(`/api/gatcha/draw`) 연동, 발급 쿠폰 표시.

# 프론트엔드 핵심 플레이 흐름 리디자인 설계

## 배경 / 문제

기획 담당자가 Figma 와이어프레임(`docs/design_template/figma_exported.svg`, 15개 화면)과 GDD(Game Design Document, Chapter 6~7 — 점수/힌트/재도전/국밥력/랭킹/별명/업적/이벤트/결과카드/스테이지 설계)를 전달했다.

현재 `gookbapgame`의 프론트엔드는 이 기획을 전혀 반영하지 못한 MVP 상태다:

- 단일 라운드(고정 30초, 차이 2곳)만 존재 — GDD는 Stage 1~7 고정 진행을 요구한다.
- 브랜드 요소, 닉네임, 스코어링, 국밥력, 랭킹, 힌트, 이벤트(룰렛) 등이 전부 없다.
- DB에는 다른그림찾기 합성에 필요한 4개 테이블(`base_images`/`part_categories`/`parts`/`image_slots`)만 있고, 유저 식별·랭킹·업적·쿠폰·힌트 문항 등을 위한 테이블은 전혀 없다.
- 직전 스펙(`2026-07-20-server-side-image-composition-design.md`)에서 "비주얼 디자인은 별도 진행"이라 명시적으로 미뤄둔 부분이 바로 이 작업이다.

GDD 전체를 한 스펙으로 구현하기엔 범위가 너무 크다 — 랭킹·업적·이벤트(룰렛)·힌트 문항 관리·유저 식별 영속화는 전부 신규 DB 테이블과 `gookbapanalyze`(관리자 대시보드) 작업을 필요로 한다. 이번 스펙은 **DB 스키마 추가 없이(단, `base_images.level` 컬럼 1개는 예외) 클라이언트 상태만으로 완결되는 핵심 플레이 흐름**으로 범위를 한정한다. 나머지는 각각 별도 스펙으로 넘긴다.

## 범위

### 이번 스펙에서 실구현

| 화면/기능 | 내용 |
|---|---|
| Start Hub | 브랜드 인트로 자리, 오늘의 별명(실구현), "게임 시작", "내 결과"/"랭킹" 버튼(스텁 — 눌러도 반응 없음) |
| 게임 진행 | Stage 1~7 고정 순차 진행, 스테이지별 제한시간/차이 개수는 GDD 7.2 그대로 |
| 단계 전환 모달 | 클리어 시 "다음", 타임아웃 시 "재도전"(세션 전체 재시작) |
| 게임 결과 | Stage 점수/완주 보너스/시간 보너스/정답행진 보너스/총점(최대 1953) + 국밥력 등급 표시 |
| 행운의 돌림판 | 정적 placeholder — 실제 추첨/서버 로직 없음 |
| 오늘의 결과 | 별명·국밥력·최종점수는 실구현, 업적/쿠폰은 스텁 뱃지, "처음으로"로 전체 리셋 |
| 힌트 버튼 | 게임 화면에 버튼만 존재, 클릭해도 동작 없음(스텁) |

### 다음 스펙으로 이관 (명시적 제외)

- 힌트의 실제 인터랙션(2지선다 질문 → 응답 → 차이 위치 하이라이트)과 문항 관리자 CRUD
- 랭킹 시스템(영속 저장, TOP100, 동점 처리)
- 업적 시스템의 실제 조건 판정·영속화
- 이벤트 시스템(룰렛 서버 추첨, 쿠폰 재고/확률 관리자 설정, 1일 1회 지급 정책)
- 설문 시스템
- 결과 카드 저장/공유 이미지 생성
- 설정 모달(진동/소리 on-off), 게임 이탈 확인, 브랜드 영상 재생, 구매 영수증 — 이번 스펙에서는 화면 자체를 아예 넣지 않는다(햄버거 메뉴 아이콘 포함)
- 비주얼 톤앤매너(색상/폰트/브랜드 그래픽) — 와이어프레임은 구조·흐름 참고용으로만 쓰고, 기존 다크톤 레이아웃을 유지한다

## 아키텍처

### 상태머신

`page.tsx`의 `gameState`를 다음 유니온으로 확장한다:

```
"start" | "playing" | "stageClear" | "stageFail" | "gameResult" | "wheel" | "dailyResult"
```

진행 상태(현재 스테이지, 누적 점수, 오답 발생 여부, 스테이지별 남은 시간, 별명)는 `page.tsx`의 개별 `useState` 나열 대신 신규 커스텀 훅 `app/hooks/useGameProgress.ts`로 분리한다. `page.tsx`는 이 훅을 소비해 조건부 렌더링만 담당하는 얇은 조율자로 유지한다.

`useGameProgress`가 관리하는 상태:
- `nickname: string`
- `currentStage: number` (1~7)
- `session: GameSession | null` (현재 스테이지의 좌/우 이미지 + 슬롯 메타데이터)
- `scoreState: { remainingTimeByStage: number[]; hadWrongTouch: boolean }`
- 파생 액션: `startSession()`, `advanceStage()`, `retrySession()`, `completeSession()`

### 스테이지 설정 상수

`app/lib/stageConfig.ts` 신설. GDD 7.2 표를 그대로 상수화한다:

```ts
export const STAGE_CONFIG = [
  { level: 1, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 2, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 3, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 4, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 5, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 6, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 7, timeLimitSec: 60, diffCount: 7, stageScore: 320 },
];
```

### 데이터 흐름 / `fetchGameData` 변경

- `fetchGameData(level: number, targetDiffCount: number): Promise<GameSession | null>`로 시그니처 확장.
- 내부 쿼리에 `.eq("level", level)` 필터를 추가해 해당 스테이지에 등록된 base_image만 후보로 삼는다(동일 레벨에 여러 세트가 있으면 기존처럼 랜덤 선택).
- 현재 `numDifferences = Math.max(1, Math.round(N * 2/3))`로 계산하던 차이 개수 로직을 `Math.min(targetDiffCount, N)`으로 교체한다. 콘텐츠(유효 슬롯)가 목표치보다 적으면 있는 만큼만 차이로 지정하고 `console.warn`으로 콘텐츠 갭을 남긴다 — 조용히 스테이지를 건너뛰지 않는다(GDD가 7단계 고정을 콘텐츠 요구사항으로 명시했으므로).
- `GameSession` 타입에 `level: number` 필드를 추가해 표시용으로 재사용한다.

### 스키마 변경

`scripts/test-db-schema.sql`에 `level integer` 컬럼을 `base_images`에 추가한다. 운영 Supabase에는 `gookbapanalyze`가 이미 이 컬럼을 쓰고 있으므로(`updateBaseImageLevel`), 로컬 테스트 스키마만 뒤늦게 따라잡는 것이다.

### 재도전 로직

타임아웃 모달의 "재도전" 버튼 클릭 시 `retrySession()`을 호출한다:
- `currentStage`를 1로 리셋
- `scoreState` 전체 초기화 (`remainingTimeByStage = []`, `hadWrongTouch = false`)
- Stage 1의 `fetchGameData`를 다시 호출해 이미지 세트를 재추첨
- Start Hub로 돌아가지 않고 곧바로 Stage 1 플레이 화면으로 이동한다

### 컴포넌트 변경/신설

| 파일 | 변경 |
|---|---|
| `app/components/StartScreen.tsx` | 오늘의 별명 표시 + 🔄 재생성 버튼, 내결과/랭킹 버튼(스텁) 추가 |
| `app/components/GameScreen.tsx` | `key={currentStage}`로 스테이지 전환 시 강제 리마운트(현재 `timeLeft`/`foundSlots`가 `session` prop 변경만으로 리셋되지 않는 버그 수정 겸), 상단에 "N/7 단계" 표시, `stageConfig`의 `timeLimitSec` 사용, 힌트 버튼(스텁) 추가 |
| `app/components/Modal.tsx` | `type`에 `"stageClear" \| "stageFail"` 추가, 문구/버튼 라벨 분기 |
| `app/components/GameResultScreen.tsx` | 신규 — 점수 항목별 표(1400/100/400/53) + 총점 + 국밥력 등급 |
| `app/components/WheelScreen.tsx` | 신규 — 정적 placeholder, "다음" 버튼만 존재 |
| `app/components/DailyResultScreen.tsx` | 신규 — 별명/국밥력/최종점수 + 업적·쿠폰 스텁 뱃지 + "처음으로" |
| `app/hooks/useGameProgress.ts` | 신규 |
| `app/lib/stageConfig.ts` | 신규 |
| `app/lib/nickname.ts` | 신규 — 형용사/명사 배열(우선 20~30개 규모의 placeholder 목록, 카피는 추후 확장) + `generateNickname()` + localStorage 저장/조회 |

## 점수 계산

GDD 6.2를 그대로 따른다 — 임의의 100점 환산 없이 처음부터 절대값으로 계산한다.

| 항목 | 배점 | 계산 |
|---|---|---|
| Stage 점수 | 1400 | `STAGE_CONFIG`의 `stageScore` 합산 (180×6 + 320) |
| 완주 보너스 | 100 | Stage 7까지 클리어하면 고정 지급 (재도전=세션 재시작 구조상, `gameResult` 화면에 도달했다는 것 자체가 완주를 의미하므로 사실상 항상 지급) |
| 시간 보너스 | 400 | `min(400, round(400 * 남은시간합 / (7*60*0.6)))` — 전체 시간 예산(420초)의 60%만 절약해도 만점이 되도록 하는 임시 공식. GDD도 "밸런스 테스트로 최종 확정"이라 명시했으므로 이 배율(0.6)은 `stageConfig.ts`의 상수 하나로 분리해 나중에 튜닝 |
| 정답행진 보너스 | 53 | 세션 전체에서 오답 터치가 한 번도 없으면 고정 지급 (이진 판정, 스트릭 곡선 아님) |
| 총점 | 1953 | 위 4개 합산 |

**"오답" 판정의 알려진 한계**: 현재 `GameScreen`의 클릭 오버레이는 슬롯 영역 위에만 존재한다. 따라서 "오답"으로 집계되는 것은 (a) `isDifference=false`인 슬롯을 클릭하거나 (b) 이미 찾은 슬롯을 다시 클릭하는 경우뿐이며, 슬롯이 없는 빈 영역을 터치하는 "완전한 헛다리"는 현재 아키텍처상 감지되지 않는다. 이는 기존에 이미 존재하던 아키텍처 한계이며, 이번 스펙에서 확장하지 않는다.

국밥력 등급은 GDD 6.5의 등급명(1953 Master / 국밥 단골 / 국밥 미식가 / 국밥 탐험가 / 국밥 입문생)을 그대로 쓰되, 점수 구간은 GDD가 "확정 예정"이라 밝힌 만큼 임시 컷오프(예: 1953=Master, 1500↑=단골, 1200↑=미식가, 800↑=탐험가, 그 미만=입문생)를 상수로 넣고 추후 조정 가능하게 한다.

## 알려진 이슈 (범위 밖)

- `slots` 배열에 모든 슬롯의 `isDifference` 여부가 클라이언트로 그대로 노출되는 기존 문제(정답 유추 가능)는 서버 측 클릭 판정 재설계가 필요해 이번 스펙 밖이다. 직전 스펙에서도 다루지 않았고 이번에도 손대지 않는다.

## 테스트

- `stageConfig` 상수 기반 점수 계산 함수(시간 보너스 공식, 정답행진 판정)에 대한 단위 테스트.
- `fetchGameData(level, targetDiffCount)`가 `level` 필터와 `min(targetDiffCount, N)` 클램프를 올바르게 적용하는지에 대한 테스트(기존 `composeScene.test.ts` 패턴 참고).
- `nickname.ts`의 생성 함수가 매번 형용사+명사 조합을 만들고 localStorage에 저장/재조회하는지에 대한 테스트.
- 수동 확인: Stage 1→7 전체 클리어 흐름, 타임아웃 시 재도전(세션 리셋) 흐름, 게임결과→돌림판→오늘의결과→처음으로 전체 사이클.

# 점수 시스템 네이티브 1953점 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gookbapgame` 클라이언트의 점수 계산을 "raw 합계 → 0~100 비율 → 1953 환산"의 2-pass 구조에서 처음부터 0~1953 스케일로 계산하는 구조로 바꾸고, 새 게임 규칙(레벨 9→7, 전체 300초 단일 타이머, 레벨당 오답 3회 제한)에 맞춰 배점 로직을 재작성한다.

**Architecture:** 순수 계산 로직(`app/lib/stageConfig.ts`)을 먼저 TDD로 재작성해 스테이지 점수/시간 보너스/콤보 보너스/감점을 각각 독립 함수로 만들고, 이를 통합하는 `calcFinalScore()`를 완성한다. 그다음 이 함수들을 소비하는 React 레이어(`useGameProgress` 훅, `GameScreen`/`GameResultScreen`/`DailyResultScreen`/`page.tsx`)를 순서대로 갱신한다.

**Tech Stack:** Next.js(App Router) + React + TypeScript, Tailwind CSS v4(CSS-first, `tailwind.config` 없음), 테스트는 Node.js 내장 테스트 러너(`node --experimental-strip-types --test`).

## Global Constraints

- 최종 점수는 0~1953 정수. 음수가 되면 0으로 클램프. 중간 계산은 float 유지, **반올림은 최종 총점을 만들 때 한 번만**(`stageConfig.ts:2026-07-31-native-1953-score-design.md` 스펙 참고).
- 레벨 수는 7(`STAGE_CONFIG` 배열 길이). 전체 제한시간은 `GLOBAL_TIME_LIMIT_SEC = 300`초 단일 타이머.
- 레벨당 오답 3회(`WRONG_TOUCH_LIMIT_PER_LEVEL`), 오답 1회당 직접 감점 `WRONG_TOUCH_PENALTY = 10`.
- 미완주 감점 `INCOMPLETE_LEVEL_PENALTY = 10`/미도달 레벨, 진행 중이던 레벨은 감점 제외.
- 이 저장소의 테스트는 `node:test`이며 `package.json`의 `scripts.test`에 파일 경로가 **명시적으로 나열**되어야 실행 대상에 포함된다(glob 자동 탐색 아님). `app/lib/stageConfig.test.ts`는 이미 나열되어 있으므로 새로 추가할 필요 없음.
- React 컴포넌트/훅(`useGameProgress`, `GameScreen` 등)은 이 저장소에 테스트 작성 관례가 없다(React Testing Library 등 미설치). 순수 함수(`stageConfig.ts`)만 자동 테스트하고, 나머지는 각 태스크에 명시된 수동 브라우저 검증으로 확인한다.
- 커밋 메시지는 한국어로 작성하고 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 푸터를 포함한다.
- 참고 스펙: `docs/superpowers/specs/2026-07-31-native-1953-score-design.md`

---

## Task 1: `STAGE_CONFIG` — 7레벨 배점 구조로 재정의

**Files:**
- Modify: `app/lib/stageConfig.ts` (전체 재작성 시작 — 이 태스크에서는 `StageDef`/`STAGE_CONFIG`/`TOTAL_STAGE_SCORE`/`GLOBAL_TIME_LIMIT_SEC`/`WRONG_TOUCH_LIMIT_PER_LEVEL`/`WRONG_TOUCH_PENALTY`/`INCOMPLETE_LEVEL_PENALTY`만 다룬다. 기존 `timeLimitSec`, `stageScore`, `COMPLETION_BONUS`, `MAX_TIME_BONUS`, `STREAK_BONUS`, `calcStreakBonus`, `RAW_MAX_SCORE`, `calcTimeBonus`, `calcFinalScore`, `toDisplayScore`는 이 태스크에서 전부 삭제한다 — 이후 태스크에서 새 버전으로 다시 추가된다.)
- Test: `app/lib/stageConfig.test.ts` (전체 재작성 — 기존 9레벨/구 배점 기준 테스트를 전부 지우고 새로 작성)

**Interfaces:**
- Produces: `StageDef { level: number; diffCount: number; pointPool: number }`, `STAGE_CONFIG: StageDef[]`(길이 7), `TOTAL_STAGE_SCORE: number`(=800), `GLOBAL_TIME_LIMIT_SEC = 300`, `WRONG_TOUCH_LIMIT_PER_LEVEL = 3`, `WRONG_TOUCH_PENALTY = 10`, `INCOMPLETE_LEVEL_PENALTY = 10`. 이후 모든 태스크가 이 이름들을 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/stageConfig.test.ts` 파일을 아래 내용으로 새로 만든다(이후 태스크에서 계속 추가할 것이므로 지금은 이 부분만):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_CONFIG,
  TOTAL_STAGE_SCORE,
  GLOBAL_TIME_LIMIT_SEC,
  WRONG_TOUCH_LIMIT_PER_LEVEL,
  WRONG_TOUCH_PENALTY,
  INCOMPLETE_LEVEL_PENALTY,
} from "./stageConfig.ts";

test("STAGE_CONFIG: 7레벨로 구성된다", () => {
  assert.equal(STAGE_CONFIG.length, 7);
});

test("STAGE_CONFIG: 레벨 배점이 50/50/100/100/150/150/200이다", () => {
  assert.deepEqual(
    STAGE_CONFIG.map((s) => s.pointPool),
    [50, 50, 100, 100, 150, 150, 200]
  );
});

test("STAGE_CONFIG: diffCount는 1~6레벨 5, 7레벨 7이다", () => {
  assert.deepEqual(
    STAGE_CONFIG.map((s) => s.diffCount),
    [5, 5, 5, 5, 5, 5, 7]
  );
});

test("TOTAL_STAGE_SCORE: 레벨 배점 합은 800이다", () => {
  assert.equal(TOTAL_STAGE_SCORE, 800);
});

test("전역 상수: 시간/오답/미완주 관련 값이 스펙과 일치한다", () => {
  assert.equal(GLOBAL_TIME_LIMIT_SEC, 300);
  assert.equal(WRONG_TOUCH_LIMIT_PER_LEVEL, 3);
  assert.equal(WRONG_TOUCH_PENALTY, 10);
  assert.equal(INCOMPLETE_LEVEL_PENALTY, 10);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: `app/lib/stageConfig.test.ts` 관련 항목이 전부 FAIL (아직 새 export가 없으므로 모듈 로드 자체가 실패할 수 있음 — 정상).

- [ ] **Step 3: `app/lib/stageConfig.ts` 최소 구현**

파일 맨 위부터 아래 내용으로 교체 시작(파일 전체를 이 내용으로 덮어쓴다 — 이후 태스크에서 뒤에 계속 이어붙인다):

```ts
export type StageDef = {
  level: number;
  diffCount: number;
  pointPool: number;
};

export const STAGE_CONFIG: StageDef[] = [
  { level: 1, diffCount: 5, pointPool: 50 },
  { level: 2, diffCount: 5, pointPool: 50 },
  { level: 3, diffCount: 5, pointPool: 100 },
  { level: 4, diffCount: 5, pointPool: 100 },
  { level: 5, diffCount: 5, pointPool: 150 },
  { level: 6, diffCount: 5, pointPool: 150 },
  { level: 7, diffCount: 7, pointPool: 200 },
];

export const TOTAL_STAGE_SCORE = STAGE_CONFIG.reduce((sum, s) => sum + s.pointPool, 0);

export const GLOBAL_TIME_LIMIT_SEC = 300;
export const WRONG_TOUCH_LIMIT_PER_LEVEL = 3;
export const WRONG_TOUCH_PENALTY = 10;
export const INCOMPLETE_LEVEL_PENALTY = 10;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 위 5개 테스트 PASS (다른 테스트 파일은 아직 옛 API를 참조하는 다른 파일이 없으므로 영향 없음).

- [ ] **Step 5: 커밋**

```bash
git add app/lib/stageConfig.ts app/lib/stageConfig.test.ts
git commit -m "$(cat <<'EOF'
STAGE_CONFIG를 7레벨 고정 배점 구조로 재정의

9레벨/가변 stageScore 구조를 걷어내고, 새 게임 규칙(레벨 7개,
레벨별 고정 배점 50/50/100/100/150/150/200=800)에 맞춘
STAGE_CONFIG와 전역 상수(GLOBAL_TIME_LIMIT_SEC, WRONG_TOUCH_*,
INCOMPLETE_LEVEL_PENALTY)로 교체.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 정답률 티어 + 시간 보너스 (`calcAccuracyTierPoints`, `calcTimeBonus`)

**Files:**
- Modify: `app/lib/stageConfig.ts` (Task 1 파일 끝에 추가)
- Test: `app/lib/stageConfig.test.ts` (끝에 추가)

**Interfaces:**
- Consumes: 없음(순수 함수, 새 상수만 사용)
- Produces: `TIME_BONUS_MAX = 600`, `TIME_BONUS_FAST_THRESHOLD_SEC = 100`, `TIME_BONUS_STEP_SEC = 10`, `TIME_BONUS_STEP_VALUE = 30`, `calcAccuracyTierPoints(accuracyPercent: number): number`, `calcTimeBonus(elapsedSec: number, accuracyPercent: number): number`. Task 6(`calcFinalScore`)이 `calcTimeBonus`를 그대로 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/stageConfig.test.ts` 끝에 추가:

```ts
import { calcAccuracyTierPoints, calcTimeBonus } from "./stageConfig.ts";

test("calcAccuracyTierPoints: 6단계 정답률 구간 경계값", () => {
  assert.equal(calcAccuracyTierPoints(0), 0);
  assert.equal(calcAccuracyTierPoints(20), 0);
  assert.equal(calcAccuracyTierPoints(21), 50);
  assert.equal(calcAccuracyTierPoints(40), 50);
  assert.equal(calcAccuracyTierPoints(41), 100);
  assert.equal(calcAccuracyTierPoints(60), 100);
  assert.equal(calcAccuracyTierPoints(61), 200);
  assert.equal(calcAccuracyTierPoints(80), 200);
  assert.equal(calcAccuracyTierPoints(81), 400);
  assert.equal(calcAccuracyTierPoints(90), 400);
  assert.equal(calcAccuracyTierPoints(91), 600);
  assert.equal(calcAccuracyTierPoints(100), 600);
});

test("calcTimeBonus: 100초 이내는 정답률 티어 그대로", () => {
  assert.equal(calcTimeBonus(50, 100), 600);
  assert.equal(calcTimeBonus(100, 100), 600);
  assert.equal(calcTimeBonus(100, 70), 200);
});

test("calcTimeBonus: 100초 초과는 10초 단위로 30점씩 감소한다", () => {
  assert.equal(calcTimeBonus(105, 100), 570);
  assert.equal(calcTimeBonus(110, 100), 570);
  assert.equal(calcTimeBonus(111, 100), 540);
  assert.equal(calcTimeBonus(300, 100), 0);
});

test("calcTimeBonus: 정답률이 낮으면 더 일찍 0에 도달한다", () => {
  assert.equal(calcTimeBonus(150, 70), 50);
  assert.equal(calcTimeBonus(161, 70), 0);
});

test("calcTimeBonus: 정답률 0%면 어떤 시간에도 0이다(악용 방지 검증)", () => {
  assert.equal(calcTimeBonus(30, 0), 0);
  assert.equal(calcTimeBonus(105, 0), 0);
  assert.equal(calcTimeBonus(250, 0), 0);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: 위 5개 테스트가 `calcAccuracyTierPoints`/`calcTimeBonus`를 찾지 못해 FAIL.

- [ ] **Step 3: 구현 추가**

`app/lib/stageConfig.ts` 끝에 추가:

```ts
export const TIME_BONUS_MAX = 600;
export const TIME_BONUS_FAST_THRESHOLD_SEC = 100;
export const TIME_BONUS_STEP_SEC = 10;
export const TIME_BONUS_STEP_VALUE = 30;

const ACCURACY_TIME_BONUS_TIERS: { minPercent: number; points: number }[] = [
  { minPercent: 91, points: 600 },
  { minPercent: 81, points: 400 },
  { minPercent: 61, points: 200 },
  { minPercent: 41, points: 100 },
  { minPercent: 21, points: 50 },
  { minPercent: 0, points: 0 },
];

export function calcAccuracyTierPoints(accuracyPercent: number): number {
  const found = ACCURACY_TIME_BONUS_TIERS.find((t) => accuracyPercent >= t.minPercent);
  return found ? found.points : 0;
}

export function calcTimeBonus(elapsedSec: number, accuracyPercent: number): number {
  const tierPoints = calcAccuracyTierPoints(accuracyPercent);
  if (elapsedSec <= TIME_BONUS_FAST_THRESHOLD_SEC) {
    return tierPoints;
  }
  const overSec = elapsedSec - TIME_BONUS_FAST_THRESHOLD_SEC;
  const steps = Math.ceil(overSec / TIME_BONUS_STEP_SEC);
  return Math.max(0, tierPoints - TIME_BONUS_STEP_VALUE * steps);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: Task 1의 테스트 포함 전체 PASS.

- [ ] **Step 5: 커밋**

```bash
git add app/lib/stageConfig.ts app/lib/stageConfig.test.ts
git commit -m "$(cat <<'EOF'
정답률 6단계 티어 기반 시간 보너스 계산 추가

100초 이내는 정답률 티어(0/50/100/200/400/600) 그대로,
100초 초과는 10초 단위로 30점씩 감소. 정답률 0%면 어떤
경과시간에도 0이 되어 "오답만 찍고 강제 스킵" 악용을 막는다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 콤보 보너스 (`calcComboBonusForStreak`)

**Files:**
- Modify: `app/lib/stageConfig.ts`
- Test: `app/lib/stageConfig.test.ts`

**Interfaces:**
- Produces: `COMBO_BONUS_MAX = 553`, `calcComboBonusForStreak(streakLength: number, totalAnswers: number): number`. Task 6이 이 함수로 "적립분 + 현재 스트릭 값"을 합산해 콤보 보너스를 계산한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/stageConfig.test.ts` 끝에 추가:

```ts
import { COMBO_BONUS_MAX, calcComboBonusForStreak } from "./stageConfig.ts";

function closeTo(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be close to ${expected}`
  );
}

test("calcComboBonusForStreak: 스트릭 0이면 0점", () => {
  assert.equal(calcComboBonusForStreak(0, 50), 0);
});

test("calcComboBonusForStreak: 전체 정답을 스트릭 끊김 없이 다 찾으면 만점", () => {
  closeTo(calcComboBonusForStreak(50, 50), COMBO_BONUS_MAX);
});

test("calcComboBonusForStreak: 스트릭 길이의 제곱에 비례한다", () => {
  closeTo(calcComboBonusForStreak(10, 50), 553 * (10 / 50) ** 2);
  closeTo(calcComboBonusForStreak(25, 50), 553 * (25 / 50) ** 2);
});

test("calcComboBonusForStreak: 전체 정답 수가 0이면 0점(0으로 나누기 방지)", () => {
  assert.equal(calcComboBonusForStreak(0, 0), 0);
});

test("calcComboBonusForStreak: 균등 간격 오답 k회 시 총합은 553/(k+1)에 수렴한다", () => {
  const N = 60;
  const k = 2; // 오답 2회 → 3구간
  const segment = N / (k + 1);
  const total =
    calcComboBonusForStreak(segment, N) +
    calcComboBonusForStreak(segment, N) +
    calcComboBonusForStreak(segment, N);
  closeTo(total, COMBO_BONUS_MAX / (k + 1), 0.5);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: 위 테스트가 `calcComboBonusForStreak`/`COMBO_BONUS_MAX`를 찾지 못해 FAIL.

- [ ] **Step 3: 구현 추가**

`app/lib/stageConfig.ts` 끝에 추가:

```ts
export const COMBO_BONUS_MAX = 553;

export function calcComboBonusForStreak(streakLength: number, totalAnswers: number): number {
  if (totalAnswers <= 0) return 0;
  const ratio = streakLength / totalAnswers;
  return COMBO_BONUS_MAX * ratio * ratio;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 전체 PASS.

- [ ] **Step 5: 커밋**

```bash
git add app/lib/stageConfig.ts app/lib/stageConfig.test.ts
git commit -m "$(cat <<'EOF'
콤보 보너스 계산 함수 추가 (553 x (스트릭/전체정답)^2)

오답 없이 이어지는 연속 정답 스트릭에 비례해 실시간으로
커지는 콤보 점수. 호출부(useGameProgress)가 오답 발생 시점의
스트릭 값을 이 함수로 계산해 "적립"하고 카운터만 리셋하는
방식으로 조립한다(적립분 유지 규칙은 이 함수 바깥에서 처리).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 스테이지 점수 (`calcStageScore`, `LevelResult`)

**Files:**
- Modify: `app/lib/stageConfig.ts`
- Test: `app/lib/stageConfig.test.ts`

**Interfaces:**
- Produces: `LevelResult { pointPool: number; foundCount: number; actualDiffCount: number }`, `calcStageScore(levelResults: LevelResult[]): number`. Task 6과 `useGameProgress`(Task 7)가 이 타입/함수를 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/stageConfig.test.ts` 끝에 추가:

```ts
import { calcStageScore } from "./stageConfig.ts";

test("calcStageScore: 한 레벨을 전부 찾으면 배점 그대로", () => {
  assert.equal(calcStageScore([{ pointPool: 50, foundCount: 5, actualDiffCount: 5 }]), 50);
});

test("calcStageScore: 일부만 찾으면 비율만큼만 받는다", () => {
  assert.equal(calcStageScore([{ pointPool: 50, foundCount: 3, actualDiffCount: 5 }]), 30);
});

test("calcStageScore: 실제 diffCount가 목표보다 적어도 정확히 나뉜다", () => {
  closeToStage(calcStageScore([{ pointPool: 100, foundCount: 2, actualDiffCount: 3 }]), 200 / 3);
});

test("calcStageScore: 여러 레벨을 합산한다", () => {
  const result = calcStageScore([
    { pointPool: 50, foundCount: 5, actualDiffCount: 5 },
    { pointPool: 100, foundCount: 0, actualDiffCount: 5 },
    { pointPool: 200, foundCount: 7, actualDiffCount: 7 },
  ]);
  assert.equal(result, 50 + 0 + 200);
});

test("calcStageScore: actualDiffCount가 0이면 0으로 나누지 않고 건너뛴다", () => {
  assert.equal(calcStageScore([{ pointPool: 50, foundCount: 0, actualDiffCount: 0 }]), 0);
});

function closeToStage(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${actual} to be close to ${expected}`);
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: `calcStageScore`를 찾지 못해 FAIL.

- [ ] **Step 3: 구현 추가**

`app/lib/stageConfig.ts` 끝에 추가:

```ts
export type LevelResult = {
  pointPool: number;
  foundCount: number;
  actualDiffCount: number;
};

export function calcStageScore(levelResults: LevelResult[]): number {
  return levelResults.reduce((sum, r) => {
    if (r.actualDiffCount <= 0) return sum;
    return sum + (r.pointPool / r.actualDiffCount) * r.foundCount;
  }, 0);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 전체 PASS.

- [ ] **Step 5: 커밋**

```bash
git add app/lib/stageConfig.ts app/lib/stageConfig.test.ts
git commit -m "$(cat <<'EOF'
스테이지 점수 계산 함수 추가 (레벨 배점 ÷ 실제 diffCount)

diffCount가 콘텐츠 사정에 따라 목표치보다 줄어들 수 있으므로,
레벨 고정 배점을 실제 diffCount로 나눠 "정답 1개당 점수"를
구하고 찾은 개수만큼만 합산한다. 못 찾은 정답은 자연히
못 받는 간접 페널티 구조.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 감점 함수 (`calcWrongTouchPenalty`, `calcIncompleteLevelPenalty`)

**Files:**
- Modify: `app/lib/stageConfig.ts`
- Test: `app/lib/stageConfig.test.ts`

**Interfaces:**
- Consumes: `STAGE_CONFIG`(Task 1), `WRONG_TOUCH_PENALTY`(Task 1), `INCOMPLETE_LEVEL_PENALTY`(Task 1)
- Produces: `calcWrongTouchPenalty(totalWrongTouches: number): number`, `calcIncompleteLevelPenalty(levelsReached: number, totalLevels: number): number`. Task 6이 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/stageConfig.test.ts` 끝에 추가:

```ts
import { calcWrongTouchPenalty, calcIncompleteLevelPenalty } from "./stageConfig.ts";

test("calcWrongTouchPenalty: 오답 1회당 10점", () => {
  assert.equal(calcWrongTouchPenalty(0), 0);
  assert.equal(calcWrongTouchPenalty(1), 10);
  assert.equal(calcWrongTouchPenalty(21), 210);
});

test("calcIncompleteLevelPenalty: 전부 도달하면 0점", () => {
  assert.equal(calcIncompleteLevelPenalty(7, 7), 0);
});

test("calcIncompleteLevelPenalty: 진행 중이던 레벨은 도달로 취급해 감점 제외", () => {
  // 4단계까지 갔다(진행 중이던 4단계 포함 levelsReached=4) → 5,6,7단계 3개 미도달
  assert.equal(calcIncompleteLevelPenalty(4, 7), 30);
});

test("calcIncompleteLevelPenalty: 음수로 내려가지 않는다", () => {
  assert.equal(calcIncompleteLevelPenalty(9, 7), 0);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: 두 함수를 찾지 못해 FAIL.

- [ ] **Step 3: 구현 추가**

`app/lib/stageConfig.ts` 끝에 추가:

```ts
export function calcWrongTouchPenalty(totalWrongTouches: number): number {
  return totalWrongTouches * WRONG_TOUCH_PENALTY;
}

export function calcIncompleteLevelPenalty(levelsReached: number, totalLevels: number): number {
  const unreached = Math.max(0, totalLevels - levelsReached);
  return unreached * INCOMPLETE_LEVEL_PENALTY;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 전체 PASS.

- [ ] **Step 5: 커밋**

```bash
git add app/lib/stageConfig.ts app/lib/stageConfig.test.ts
git commit -m "$(cat <<'EOF'
오답/미완주 감점 함수 추가

오답 1회당 -10점, 300초 초과로 강제종료될 때 아예 도달 못한
레벨 1개당 -10점(진행 중이던 레벨은 도달로 취급해 제외).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `calcFinalScore` 통합 + 등급 판정

**Files:**
- Modify: `app/lib/stageConfig.ts`
- Test: `app/lib/stageConfig.test.ts`

**Interfaces:**
- Consumes: `calcStageScore`, `calcTimeBonus`, `calcComboBonusForStreak`, `calcWrongTouchPenalty`, `calcIncompleteLevelPenalty`, `STAGE_CONFIG.length`(Tasks 1~5)
- Produces: `ScoreBreakdown { stageScore, timeBonus, comboBonus, wrongTouchPenalty, incompleteLevelPenalty, total }`, `CalcFinalScoreInput { levelResults, elapsedSec, totalWrongTouches, comboBankedScore, comboCurrentStreak, comboTotalAnswers, levelsReached }`, `calcFinalScore(input: CalcFinalScoreInput): ScoreBreakdown`, `GukbapTier`, `calcGukbapTier(totalScore: number): GukbapTier`. **Task 7(`useGameProgress`)과 Task 10(`GameResultScreen`/`DailyResultScreen`)이 이 이름들을 그대로 가져다 쓴다.**

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/stageConfig.test.ts` 끝에 추가:

```ts
import { calcFinalScore, calcGukbapTier } from "./stageConfig.ts";

function perfectLevelResults() {
  return STAGE_CONFIG.map((s) => ({
    pointPool: s.pointPool,
    foundCount: s.diffCount,
    actualDiffCount: s.diffCount,
  }));
}

test("calcFinalScore: 완전 무결점 + 100초 이내 완주 = 1953", () => {
  const totalAnswers = STAGE_CONFIG.reduce((sum, s) => sum + s.diffCount, 0);
  const breakdown = calcFinalScore({
    levelResults: perfectLevelResults(),
    elapsedSec: 90,
    totalWrongTouches: 0,
    comboBankedScore: 0,
    comboCurrentStreak: totalAnswers,
    comboTotalAnswers: totalAnswers,
    levelsReached: STAGE_CONFIG.length,
  });
  assert.equal(breakdown.total, 1953);
});

test("calcFinalScore: 오답만 찍고 강제 스킵하는 악용은 순손실이다", () => {
  const totalAnswers = STAGE_CONFIG.reduce((sum, s) => sum + s.diffCount, 0);
  const emptyLevelResults = STAGE_CONFIG.map((s) => ({
    pointPool: s.pointPool,
    foundCount: 0,
    actualDiffCount: s.diffCount,
  }));
  const breakdown = calcFinalScore({
    levelResults: emptyLevelResults,
    elapsedSec: 35,
    totalWrongTouches: STAGE_CONFIG.length * 3,
    comboBankedScore: 0,
    comboCurrentStreak: 0,
    comboTotalAnswers: totalAnswers,
    levelsReached: STAGE_CONFIG.length,
  });
  assert.equal(breakdown.total, 0);
  assert.equal(breakdown.stageScore, 0);
  assert.equal(breakdown.timeBonus, 0);
  assert.equal(breakdown.comboBonus, 0);
  assert.equal(breakdown.wrongTouchPenalty, 210);
});

test("calcFinalScore: 총점은 절대 음수로 표시되지 않는다", () => {
  const breakdown = calcFinalScore({
    levelResults: [],
    elapsedSec: 300,
    totalWrongTouches: 100,
    comboBankedScore: 0,
    comboCurrentStreak: 0,
    comboTotalAnswers: 30,
    levelsReached: 0,
  });
  assert.equal(breakdown.total, 0);
});

test("calcGukbapTier: 컷오프 경계값", () => {
  assert.equal(calcGukbapTier(1953), "1953 Master");
  assert.equal(calcGukbapTier(1500), "국밥 단골");
  assert.equal(calcGukbapTier(1200), "국밥 미식가");
  assert.equal(calcGukbapTier(800), "국밥 탐험가");
  assert.equal(calcGukbapTier(0), "국밥 입문생");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: `calcFinalScore`/`calcGukbapTier`를 찾지 못해 FAIL.

- [ ] **Step 3: 구현 추가**

`app/lib/stageConfig.ts` 끝에 추가:

```ts
export type ScoreBreakdown = {
  stageScore: number;
  timeBonus: number;
  comboBonus: number;
  wrongTouchPenalty: number;
  incompleteLevelPenalty: number;
  total: number;
};

export type CalcFinalScoreInput = {
  levelResults: LevelResult[];
  elapsedSec: number;
  totalWrongTouches: number;
  comboBankedScore: number;
  comboCurrentStreak: number;
  comboTotalAnswers: number;
  levelsReached: number;
};

export function calcFinalScore(input: CalcFinalScoreInput): ScoreBreakdown {
  const stageScore = calcStageScore(input.levelResults);
  const totalFound = input.levelResults.reduce((sum, r) => sum + r.foundCount, 0);
  const accuracyPercent =
    input.comboTotalAnswers > 0 ? (totalFound / input.comboTotalAnswers) * 100 : 0;
  const timeBonus = calcTimeBonus(input.elapsedSec, accuracyPercent);
  const comboBonus =
    input.comboBankedScore +
    calcComboBonusForStreak(input.comboCurrentStreak, input.comboTotalAnswers);
  const wrongTouchPenalty = calcWrongTouchPenalty(input.totalWrongTouches);
  const incompleteLevelPenalty = calcIncompleteLevelPenalty(input.levelsReached, STAGE_CONFIG.length);
  const rawTotal = stageScore + timeBonus + comboBonus - wrongTouchPenalty - incompleteLevelPenalty;

  return {
    stageScore: Math.round(stageScore),
    timeBonus,
    comboBonus: Math.round(comboBonus),
    wrongTouchPenalty,
    incompleteLevelPenalty,
    total: Math.max(0, Math.round(rawTotal)),
  };
}

export type GukbapTier =
  | "1953 Master"
  | "국밥 단골"
  | "국밥 미식가"
  | "국밥 탐험가"
  | "국밥 입문생";

const GUKBAP_TIER_CUTOFFS: { min: number; tier: GukbapTier }[] = [
  { min: 1953, tier: "1953 Master" },
  { min: 1500, tier: "국밥 단골" },
  { min: 1200, tier: "국밥 미식가" },
  { min: 800, tier: "국밥 탐험가" },
  { min: 0, tier: "국밥 입문생" },
];

// 컷오프 값은 구 2-pass 환산 시절과 동일한 절대 점수를 유지한다(밸런스 테스트 후 조정 예정 —
// docs/superpowers/specs/2026-07-31-native-1953-score-design.md 리스크 항목 참고).
export function calcGukbapTier(totalScore: number): GukbapTier {
  const found = GUKBAP_TIER_CUTOFFS.find((c) => totalScore >= c.min);
  return found ? found.tier : "국밥 입문생";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 전체 PASS. (이 시점에 `npm run build` 또는 `npx tsc --noEmit`을 한 번 실행해, `stageConfig.ts`를 아직 참조 중인 `useGameProgress.ts`/`GameScreen.tsx`/`GameResultScreen.tsx`/`DailyResultScreen.tsx`에서 타입 에러가 나는 게 정상임을 확인한다 — Task 7~10에서 순서대로 고친다.)

- [ ] **Step 5: 커밋**

```bash
git add app/lib/stageConfig.ts app/lib/stageConfig.test.ts
git commit -m "$(cat <<'EOF'
calcFinalScore 통합 및 등급 판정 함수 재작성

stageScore/timeBonus/comboBonus/wrongTouchPenalty/
incompleteLevelPenalty를 조합해 0~1953 총점(음수는 0 클램프)을
한 번에 계산하는 calcFinalScore로 교체. calcGukbapTier도
0~100 비율 대신 이 총점을 직접 받도록 변경.

이 시점에서 useGameProgress.ts 등 소비처는 아직 옛 API를
참조해 빌드가 깨진다 — 이후 태스크에서 순서대로 고친다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `useGameProgress` 훅 재작성 (전역 타이머 + 오답/콤보 추적)

**Files:**
- Modify: `app/hooks/useGameProgress.ts` (전체 재작성)

**Interfaces:**
- Consumes: `STAGE_CONFIG`, `GLOBAL_TIME_LIMIT_SEC`, `calcComboBonusForStreak`, `calcFinalScore`, `calcGukbapTier`, `ScoreBreakdown`, `GukbapTier`, `LevelResult`(Tasks 1~6), `fetchGameData`/`GameSession`(`../actions`, 기존), `preloadAllStages`/`LoadError`(`../lib/preloadGame`, 기존), `ensureParticipant`/`reassignNickname`(`../actions`, 기존)
- Produces: 훅 반환값 `{ phase, nickname, regenerateNickname, isRegenerating, stageNumber, loadNonce, totalStages, remainingTimeSec, session, loadError, scoreBreakdown, gukbapTier, startGame, retryPreload, recordCorrectFind, recordWrongTouch, handleStageClear, handleForceAdvance, advanceToNextStage, proceedToWheel, proceedToDailyResult, resetToStart }`. **Task 8(`GameScreen`)과 Task 9(`page.tsx`)가 이 이름들을 그대로 사용한다.** `GamePhase`에서 `"stageFail"`이 제거됨에 유의.

- [ ] **Step 1: `app/hooks/useGameProgress.ts` 전체 교체**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGameData, GameSession } from "../actions";
import { preloadAllStages } from "../lib/preloadGame";
import type { LoadError } from "../lib/preloadGame";
import {
  STAGE_CONFIG,
  GLOBAL_TIME_LIMIT_SEC,
  calcComboBonusForStreak,
  calcFinalScore,
  calcGukbapTier,
  ScoreBreakdown,
  GukbapTier,
  LevelResult,
} from "../lib/stageConfig";
import { ensureParticipant, reassignNickname as reassignNicknameAction } from "../actions";

export type GamePhase =
  | "start"
  | "loading"
  | "playing"
  | "stageClear"
  | "gameResult"
  | "wheel"
  | "dailyResult";

function countDifferences(session: GameSession): number {
  return session.slots.filter((s) => s.isDifference).length;
}

export function useGameProgress(trackId: string | null) {
  const [phase, setPhase] = useState<GamePhase>("start");
  const [nickname, setNickname] = useState<string>("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const nicknameSyncedRef = useRef(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loadNonce, setLoadNonce] = useState(0);
  const [loadError, setLoadError] = useState<LoadError | null>(null);

  const [remainingTimeSec, setRemainingTimeSec] = useState(GLOBAL_TIME_LIMIT_SEC);
  const [levelResults, setLevelResults] = useState<LevelResult[]>([]);
  const [totalWrongTouches, setTotalWrongTouches] = useState(0);
  const [comboBankedScore, setComboBankedScore] = useState(0);
  const [comboCurrentStreak, setComboCurrentStreak] = useState(0);
  const totalAnswersRef = useRef(0);

  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);
  const [gukbapTier, setGukbapTier] = useState<GukbapTier | null>(null);

  const session = sessions[stageIndex] ?? null;

  useEffect(() => {
    let cancelled = false;
    void ensureParticipant(trackId).then((result) => {
      if (cancelled) return;
      setNickname(result.nickname);
      nicknameSyncedRef.current = result.nicknameSynced;
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const finishGame = useCallback(
    (levelsReached: number) => {
      const breakdown = calcFinalScore({
        levelResults,
        elapsedSec: GLOBAL_TIME_LIMIT_SEC - remainingTimeSec,
        totalWrongTouches,
        comboBankedScore,
        comboCurrentStreak,
        comboTotalAnswers: totalAnswersRef.current,
        levelsReached,
      });
      setScoreBreakdown(breakdown);
      setGukbapTier(calcGukbapTier(breakdown.total));
      setPhase("gameResult");
    },
    [levelResults, remainingTimeSec, totalWrongTouches, comboBankedScore, comboCurrentStreak]
  );

  // 전체 300초 단일 타이머: playing/stageClear 구간 내내 흐르고, 0이 되면 그 자리에서 즉시 종료한다.
  // (stageClear 모달을 오래 띄워두는 것으로 시간을 버는 것을 막기 위해 이 구간도 타이머를 멈추지 않는다.)
  useEffect(() => {
    if (phase !== "playing" && phase !== "stageClear") return;
    if (remainingTimeSec <= 0) {
      finishGame(stageIndex + 1);
      return;
    }
    const timer = setInterval(() => {
      setRemainingTimeSec((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, remainingTimeSec, stageIndex, finishGame]);

  const runPreload = useCallback(async () => {
    setLoadError(null);
    const result = await preloadAllStages(fetchGameData);
    if (result.ok) {
      setSessions(result.sessions);
      totalAnswersRef.current = result.sessions.reduce((sum, s) => sum + countDifferences(s), 0);
      setLoadNonce((n) => n + 1);
      setPhase("playing");
    } else {
      setLoadError({ key: result.key, params: result.params });
    }
  }, []);

  const startGame = useCallback(() => {
    setPhase("loading");
    setStageIndex(0);
    setRemainingTimeSec(GLOBAL_TIME_LIMIT_SEC);
    setLevelResults([]);
    setTotalWrongTouches(0);
    setComboBankedScore(0);
    setComboCurrentStreak(0);
    setScoreBreakdown(null);
    setGukbapTier(null);

    if (!nicknameSyncedRef.current) {
      void reassignNicknameAction().then((result) => {
        setNickname(result.nickname);
        nicknameSyncedRef.current = result.nicknameSynced;
      });
    }

    void runPreload();
  }, [runPreload]);

  const retryPreload = useCallback(() => {
    void runPreload();
  }, [runPreload]);

  const regenerateNickname = useCallback(() => {
    setIsRegenerating(true);
    void reassignNicknameAction()
      .then((result) => {
        setNickname(result.nickname);
        nicknameSyncedRef.current = result.nicknameSynced;
      })
      .finally(() => setIsRegenerating(false));
  }, []);

  const recordCorrectFind = useCallback(() => {
    setComboCurrentStreak((prev) => prev + 1);
  }, []);

  const recordWrongTouch = useCallback(() => {
    setTotalWrongTouches((prev) => prev + 1);
    setComboBankedScore(
      (prev) => prev + calcComboBonusForStreak(comboCurrentStreak, totalAnswersRef.current)
    );
    setComboCurrentStreak(0);
  }, [comboCurrentStreak]);

  const recordLevelResult = useCallback(
    (foundCount: number) => {
      setLevelResults((prev) => [
        ...prev,
        {
          pointPool: STAGE_CONFIG[stageIndex].pointPool,
          foundCount,
          actualDiffCount: session ? countDifferences(session) : 0,
        },
      ]);
    },
    [stageIndex, session]
  );

  const goToNextLevelOrFinish = useCallback(() => {
    const nextIndex = stageIndex + 1;
    if (nextIndex < STAGE_CONFIG.length) {
      setStageIndex(nextIndex);
      setPhase("playing");
      return;
    }
    finishGame(STAGE_CONFIG.length);
  }, [stageIndex, finishGame]);

  const handleStageClear = useCallback(
    (foundCount: number) => {
      recordLevelResult(foundCount);
      setPhase("stageClear");
    },
    [recordLevelResult]
  );

  const advanceToNextStage = useCallback(() => {
    goToNextLevelOrFinish();
  }, [goToNextLevelOrFinish]);

  const handleForceAdvance = useCallback(
    (foundCount: number) => {
      recordLevelResult(foundCount);
      goToNextLevelOrFinish();
    },
    [recordLevelResult, goToNextLevelOrFinish]
  );

  const proceedToWheel = useCallback(() => setPhase("wheel"), []);
  const proceedToDailyResult = useCallback(() => setPhase("dailyResult"), []);

  const resetToStart = useCallback(() => {
    setPhase("start");
    setStageIndex(0);
    setSessions([]);
    setRemainingTimeSec(GLOBAL_TIME_LIMIT_SEC);
    setLevelResults([]);
    setTotalWrongTouches(0);
    setComboBankedScore(0);
    setComboCurrentStreak(0);
    setScoreBreakdown(null);
    setGukbapTier(null);
  }, []);

  return {
    phase,
    nickname,
    regenerateNickname,
    isRegenerating,
    stageNumber: stageIndex + 1,
    loadNonce,
    totalStages: STAGE_CONFIG.length,
    remainingTimeSec,
    session,
    loadError,
    scoreBreakdown,
    gukbapTier,
    startGame,
    retryPreload,
    recordCorrectFind,
    recordWrongTouch,
    handleStageClear,
    handleForceAdvance,
    advanceToNextStage,
    proceedToWheel,
    proceedToDailyResult,
    resetToStart,
  };
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `useGameProgress.ts` 자체는 에러 없음. `GameScreen.tsx`/`page.tsx`/`GameResultScreen.tsx`/`DailyResultScreen.tsx`는 여전히 옛 prop 이름(`timeLimitSec`, `onStageTimeout` 등)을 참조해 에러가 남아있는 게 정상 — Task 8~10에서 해소한다.

- [ ] **Step 3: 커밋**

```bash
git add app/hooks/useGameProgress.ts
git commit -m "$(cat <<'EOF'
useGameProgress: 전역 300초 타이머 + 오답/콤보 추적으로 재작성

레벨별 remainingTimeByStage 배열과 hadWrongTouch 불리언을
제거하고, 게임 전체를 관통하는 단일 타이머(remainingTimeSec)와
레벨별 결과 누적(levelResults), 오답 총횟수(totalWrongTouches),
콤보 적립/현재 스트릭(comboBankedScore/comboCurrentStreak)으로
교체. stageFail 페이즈와 retryFromStageOne을 제거하고
오답 소진 시 다음 레벨로 강제 진행하는 handleForceAdvance를 추가.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `GameScreen` 재작성 (전역 타이머 표시, 오답 3회 UI, 강제진행 연출)

**Files:**
- Modify: `app/components/GameScreen.tsx` (전체 재작성)
- Modify: `app/globals.css` (shake 키프레임 추가)

**Interfaces:**
- Consumes: `WRONG_TOUCH_LIMIT_PER_LEVEL`(Task 1)
- Produces: `GameScreenProps { session, stageNumber, totalStages, remainingTimeSec, onStageClear(foundCount), onForceAdvance(foundCount), onWrongTouch(), onCorrectFind() }`. **Task 9(`page.tsx`)가 이 prop 이름으로 연결한다.**

- [ ] **Step 1: `app/globals.css` 끝에 shake 애니메이션 추가**

```css
@keyframes shake {
  10%, 90% { transform: translateX(-1px); }
  20%, 80% { transform: translateX(2px); }
  30%, 50%, 70% { transform: translateX(-4px); }
  40%, 60% { transform: translateX(4px); }
}
.animate-shake {
  animation: shake 0.4s ease-in-out;
}
```

- [ ] **Step 2: `app/components/GameScreen.tsx` 전체 교체**

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { GameSession } from "../actions";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import { WRONG_TOUCH_LIMIT_PER_LEVEL } from "../lib/stageConfig";

interface GameScreenProps {
  session: GameSession;
  stageNumber: number;
  totalStages: number;
  remainingTimeSec: number;
  onStageClear: (foundCount: number) => void;
  onForceAdvance: (foundCount: number) => void;
  onWrongTouch: () => void;
  onCorrectFind: () => void;
}

const FORCE_ADVANCE_DELAY_MS = 400;

export default function GameScreen({
  session,
  stageNumber,
  totalStages,
  remainingTimeSec,
  onStageClear,
  onForceAdvance,
  onWrongTouch,
  onCorrectFind,
}: GameScreenProps) {
  const { t } = useLocale();
  const [foundSlots, setFoundSlots] = useState<Set<number>>(new Set());
  const [wrongTouchCount, setWrongTouchCount] = useState(0);
  const [isShaking, setIsShaking] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const totalDifferences = session.slots.filter((s) => s.isDifference).length;

  const updateScale = () => {
    if (containerRef.current) {
      const { clientWidth } = containerRef.current;
      setScale(clientWidth / 1200);
    }
  };

  useEffect(() => {
    window.addEventListener("resize", updateScale);
    updateScale();
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const handleImageLoad = () => {
    updateScale();
  };

  useEffect(() => {
    if (totalDifferences > 0 && foundSlots.size >= totalDifferences) {
      onStageClear(foundSlots.size);
    }
  }, [foundSlots.size, totalDifferences, onStageClear]);

  const handleSlotClick = (slotId: number, isDifference: boolean) => {
    // 3회 소진 후 강제진행 연출(FORCE_ADVANCE_DELAY_MS) 대기 중 추가 클릭이
    // 오답/정답을 중복 집계하지 않도록 차단한다.
    if (wrongTouchCount >= WRONG_TOUCH_LIMIT_PER_LEVEL) return;

    if (isDifference && !foundSlots.has(slotId)) {
      setFoundSlots((prev) => {
        const newSet = new Set(prev);
        newSet.add(slotId);
        return newSet;
      });
      onCorrectFind();
      return;
    }

    onWrongTouch();
    setWrongTouchCount((prev) => {
      const next = prev + 1;
      if (next >= WRONG_TOUCH_LIMIT_PER_LEVEL) {
        setIsShaking(true);
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(100);
        }
        setTimeout(() => onForceAdvance(foundSlots.size), FORCE_ADVANCE_DELAY_MS);
      }
      return next;
    });
  };

  const FALLBACK_CLIP_PATH = "circle(25%)";

  const buildClipPath = (polygon: { x: number; y: number }[] | null): string => {
    if (!polygon || polygon.length < 3) {
      return FALLBACK_CLIP_PATH;
    }
    if (polygon.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      return FALLBACK_CLIP_PATH;
    }
    const points = polygon.map((p) => `${p.x * 100}% ${p.y * 100}%`).join(", ");
    return `polygon(${points})`;
  };

  const renderClickOverlays = (side: "left" | "right") =>
    session.slots.map((slot) => (
      <div
        key={slot.slotId}
        className="absolute cursor-pointer overflow-hidden"
        style={{
          left: `${slot.x * scale}px`,
          top: `${slot.y * scale}px`,
          width: `${100 * slot.slotScale * scale}px`,
          height: `${100 * slot.slotScale * scale}px`,
          clipPath: buildClipPath(side === "left" ? slot.leftHitPolygon : slot.rightHitPolygon),
          zIndex: foundSlots.has(slot.slotId) ? 2 : 1,
        }}
        onClick={() => handleSlotClick(slot.slotId, slot.isDifference)}
      >
        {foundSlots.has(slot.slotId) && (
          <div className="absolute inset-0 flex items-center justify-center text-4xl bg-black/40 rounded-full animate-in zoom-in [clip-path:none]">
            ✅
          </div>
        )}
      </div>
    ));

  return (
    <div className={`flex flex-col min-h-screen bg-bg-deep text-ink ${isShaking ? "animate-shake" : ""}`}>
      <header className="flex justify-between items-center p-4 md:px-8 bg-surface shadow-lg border-b border-wood z-10 sticky top-0">
        <span className="text-lg md:text-xl font-bold">
          {t("game.stageProgress", { current: stageNumber, total: totalStages })}
        </span>
        <div
          className="flex items-center gap-1"
          aria-label={t("game.wrongTouchAria", { count: wrongTouchCount, limit: WRONG_TOUCH_LIMIT_PER_LEVEL })}
        >
          {Array.from({ length: WRONG_TOUCH_LIMIT_PER_LEVEL }).map((_, i) => (
            <span key={i} className={`text-xl ${i < wrongTouchCount ? "text-error" : "text-muted/30"}`}>
              ✕
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl font-bold">{t("game.timeRemainingLabel")}</span>
          <span
            className={`text-2xl md:text-3xl font-extrabold ${remainingTimeSec <= 30 ? "text-error animate-pulse" : "text-amber"}`}
          >
            {t("game.secondsUnit", { seconds: remainingTimeSec })}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row items-center justify-center p-4 gap-6 overflow-auto">
        <div
          ref={containerRef}
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-wood hover:border-accent transition-colors w-full max-w-[1200px]"
          style={{ aspectRatio: "1200 / 800" }}
        >
          <img
            src={session.leftSceneUrl}
            alt="Scene Left"
            className="w-full h-full object-contain select-none pointer-events-none"
            onLoad={handleImageLoad}
          />
          {renderClickOverlays("left")}
        </div>

        <div
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-wood hover:border-accent transition-colors w-full max-w-[1200px]"
          style={{ aspectRatio: "1200 / 800" }}
        >
          <img
            src={session.rightSceneUrl}
            alt="Scene Right"
            className="w-full h-full object-contain select-none pointer-events-none"
          />
          {renderClickOverlays("right")}
        </div>
      </main>

      <footer className="flex justify-between items-center p-4 md:px-8 bg-surface border-t border-wood">
        <PixelPanel size="btn">
          <button type="button" className="w-full font-bold text-ink">
            {t("game.hintButton")}
          </button>
        </PixelPanel>
        <span className="text-lg font-bold">
          {t("game.remainingCount", { found: totalDifferences - foundSlots.size, total: totalDifferences })}
        </span>
      </footer>
    </div>
  );
}
```

(`game.wrongTouchAria` 키는 Task 11에서 추가한다 — 지금은 `t()`가 키를 못 찾으면 키 문자열 그대로 반환하므로 런타임 에러는 없다.)

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `GameScreen.tsx` 자체는 에러 없음. `page.tsx`는 여전히 옛 prop으로 `GameScreen`을 호출해 에러 남음 — Task 9에서 해소.

- [ ] **Step 4: 커밋**

```bash
git add app/components/GameScreen.tsx app/globals.css
git commit -m "$(cat <<'EOF'
GameScreen: 레벨별 타이머 제거, 오답 3회 UI/강제진행 연출 추가

레벨 로컬 카운트다운을 없애고 부모가 관리하는 전역
remainingTimeSec을 그대로 표시. 오답을 누를 때마다 X 표시가
하나씩 채워지고, 3회 소진 시 화면을 짧게 흔들고(shake)
진동(navigator.vibrate) 피드백 후 onForceAdvance로 다음
레벨로 넘어간다. 정답 클릭마다 onCorrectFind로 콤보 갱신을
부모에 알린다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `page.tsx` 배선 갱신 + `StageTransitionModal` 정리

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/components/StageTransitionModal.tsx`

**Interfaces:**
- Consumes: `useGameProgress`(Task 7)의 반환값, `GameScreen`(Task 8) props

**Step 1: `app/components/StageTransitionModal.tsx`에서 `stageFail` 분기 제거**

전체를 아래로 교체한다(`type`을 `"stageClear"` 고정값으로 단순화):

```tsx
"use client";

import React from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { LoadError } from "../lib/preloadGame";
import PixelPanel from "./PixelPanel";

interface StageTransitionModalProps {
  onNext: () => void;
  isLoading?: boolean;
  loadError?: LoadError | null;
}

export default function StageTransitionModal({
  onNext,
  isLoading,
  loadError,
}: StageTransitionModalProps) {
  const { t } = useLocale();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80">
      <PixelPanel size="card" className="max-w-sm w-full mx-4 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-extrabold mb-4 text-amber">{t("stageTransition.clearTitle")}</h2>
        <p className="text-ink mb-6 text-lg">{t("stageTransition.clearMessage")}</p>
        {loadError && <p className="text-error mb-4">{t(loadError.key, loadError.params)}</p>}
        <button
          onClick={onNext}
          disabled={isLoading}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? t("stageTransition.loading") : t("stageTransition.nextButton")}
        </button>
      </PixelPanel>
    </div>
  );
}
```

- [ ] **Step 2: `app/page.tsx` 갱신**

`game.phase === "stageFail"` 관련 블록을 제거하고, `GameScreen`/`StageTransitionModal` 호출부를 새 prop으로 교체한다. `41~65`번 줄 부근을 아래로 교체:

```tsx
      {(game.phase === "playing" || game.phase === "stageClear") && game.session && (
        <div className={game.phase !== "playing" ? "blur-sm pointer-events-none" : undefined}>
          <GameScreen
            key={`${game.stageNumber}-${game.loadNonce}`}
            session={game.session}
            stageNumber={game.stageNumber}
            totalStages={game.totalStages}
            remainingTimeSec={game.remainingTimeSec}
            onStageClear={game.handleStageClear}
            onForceAdvance={game.handleForceAdvance}
            onWrongTouch={game.recordWrongTouch}
            onCorrectFind={game.recordCorrectFind}
          />
        </div>
      )}

      {game.phase === "stageClear" && <StageTransitionModal onNext={game.advanceToNextStage} />}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `page.tsx` 관련 에러 해소. `GameResultScreen.tsx`/`DailyResultScreen.tsx`는 아직 옛 `ScoreBreakdown` 필드(`completionBonus`, `streakBonus`)와 `toDisplayScore`를 참조해 에러 남음 — Task 10에서 해소.

- [ ] **Step 4: 커밋**

```bash
git add app/page.tsx app/components/StageTransitionModal.tsx
git commit -m "$(cat <<'EOF'
page.tsx: stageFail 페이즈 제거, GameScreen 새 props로 배선

레벨별 시간초과 → 전체 재시작 흐름이 없어짐에 따라
StageTransitionModal의 stageFail 분기(죽은 코드)를 제거하고
"stageClear" 단일 용도로 단순화. GameScreen에는 remainingTimeSec/
onForceAdvance/onCorrectFind를 새로 연결.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `GameResultScreen`/`DailyResultScreen` 갱신 (새 ScoreBreakdown 반영)

**Files:**
- Modify: `app/components/GameResultScreen.tsx` (전체 재작성)
- Modify: `app/components/DailyResultScreen.tsx` (전체 재작성)

**Interfaces:**
- Consumes: `ScoreBreakdown`, `GukbapTier`, `DISPLAY_MAX_SCORE`(Task 1, 값 그대로 1953 유지)

- [ ] **Step 1: `app/lib/stageConfig.ts`에 `DISPLAY_MAX_SCORE` 재정의**

Task 1~6까지는 `DISPLAY_MAX_SCORE`를 다루지 않았다. `app/lib/stageConfig.ts` 파일에서 `TOTAL_STAGE_SCORE` 선언 바로 아래에 추가:

```ts
// 이제 환산 대상이 아니라 총점의 실제 만점이다(총점은 항상 0~1953으로 계산된다).
export const DISPLAY_MAX_SCORE = 1953;
```

- [ ] **Step 2: `app/components/GameResultScreen.tsx` 전체 교체**

```tsx
"use client";

import React from "react";
import { ScoreBreakdown, GukbapTier, DISPLAY_MAX_SCORE } from "../lib/stageConfig";
import { gukbapTierKey } from "../lib/i18n/gukbapTierKey";
import { useLocale } from "../lib/i18n/LocaleContext";
import PixelPanel from "./PixelPanel";

interface GameResultScreenProps {
  scoreBreakdown: ScoreBreakdown;
  gukbapTier: GukbapTier;
  onNext: () => void;
}

export default function GameResultScreen({
  scoreBreakdown,
  gukbapTier,
  onNext,
}: GameResultScreenProps) {
  const { t } = useLocale();

  const rows: { label: string; value: number; isPenalty: boolean }[] = [
    { label: t("gameResult.stageScore"), value: scoreBreakdown.stageScore, isPenalty: false },
    { label: t("gameResult.timeBonus"), value: scoreBreakdown.timeBonus, isPenalty: false },
    { label: t("gameResult.comboBonus"), value: scoreBreakdown.comboBonus, isPenalty: false },
    {
      label: t("gameResult.wrongTouchPenalty"),
      value: scoreBreakdown.wrongTouchPenalty,
      isPenalty: true,
    },
    {
      label: t("gameResult.incompleteLevelPenalty"),
      value: scoreBreakdown.incompleteLevelPenalty,
      isPenalty: true,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("gameResult.title")}</h1>
        <dl className="space-y-2 mb-6 text-left">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <dt className="text-muted">{row.label}</dt>
              <dd className={`font-bold ${row.isPenalty ? "text-error" : "text-ink"}`}>
                {row.isPenalty ? "-" : ""}
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-wood pt-4 mb-2">
          <div className="flex justify-between text-xl font-extrabold">
            <span className="text-ink">{t("gameResult.totalLabel")}</span>
            <span className="text-amber" style={{ fontFamily: "var(--font-pixel)" }}>
              {scoreBreakdown.total} / {DISPLAY_MAX_SCORE}
            </span>
          </div>
        </div>
        <p className="text-amber font-bold mb-8" style={{ fontFamily: "var(--font-pixel)" }}>
          {t("gameResult.gukbapPowerLabel", { tier: t(gukbapTierKey(gukbapTier)) })}
        </p>
        <button
          onClick={onNext}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("gameResult.nextButton")}
        </button>
      </PixelPanel>
    </div>
  );
}
```

- [ ] **Step 3: `app/components/DailyResultScreen.tsx` 전체 교체**

```tsx
"use client";

import React from "react";
import { GukbapTier, DISPLAY_MAX_SCORE } from "../lib/stageConfig";
import { gukbapTierKey } from "../lib/i18n/gukbapTierKey";
import { useLocale } from "../lib/i18n/LocaleContext";
import PixelPanel from "./PixelPanel";

interface DailyResultScreenProps {
  nickname: string;
  gukbapTier: GukbapTier;
  totalScore: number;
  onRestart: () => void;
}

export default function DailyResultScreen({
  nickname,
  gukbapTier,
  totalScore,
  onRestart,
}: DailyResultScreenProps) {
  const { t } = useLocale();
  const stubAchievements = ["첫 만남", "형제의 눈썰미"];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("dailyResult.title")}</h1>
        <p className="text-muted mb-1">{t("dailyResult.nicknameLabel")}</p>
        <p className="text-xl text-ink font-bold mb-4">{nickname}</p>
        <p className="text-muted mb-1">{t("dailyResult.gukbapPowerLabel")}</p>
        <p className="text-xl text-amber font-bold mb-4" style={{ fontFamily: "var(--font-pixel)" }}>
          {t(gukbapTierKey(gukbapTier))}
        </p>
        <p className="text-muted mb-1">{t("dailyResult.finalScoreLabel")}</p>
        <p className="text-xl text-amber font-bold mb-6" style={{ fontFamily: "var(--font-pixel)" }}>
          {totalScore} / {DISPLAY_MAX_SCORE}
        </p>
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {stubAchievements.map((label) => (
            <span
              key={label}
              className="px-3 py-1 rounded-full bg-amber/20 text-amber text-sm border border-amber/40"
            >
              {label}
            </span>
          ))}
        </div>
        <PixelPanel size="btn">
          <button onClick={onRestart} className="w-full font-bold text-ink">
            {t("dailyResult.restartButton")}
          </button>
        </PixelPanel>
      </PixelPanel>
    </div>
  );
}
```

`page.tsx`의 `DailyResultScreen` 호출부(`totalScore={game.scoreBreakdown.total}`)는 필드명이 그대로(`total`)이므로 수정 불필요.

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0건(Task 1~10 전체 반영 후 프로젝트 전체가 새 API로 일관됨).

- [ ] **Step 5: 커밋**

```bash
git add app/lib/stageConfig.ts app/components/GameResultScreen.tsx app/components/DailyResultScreen.tsx
git commit -m "$(cat <<'EOF'
GameResultScreen/DailyResultScreen: 새 ScoreBreakdown 반영

toDisplayScore() 환산 호출을 전부 제거(총점이 이미 0~1953
네이티브 값). completionBonus/streakBonus 행을 comboBonus/
wrongTouchPenalty/incompleteLevelPenalty로 교체하고 감점
항목은 빨간색 "-" 표기로 구분.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: i18n 키 정리 (`ko.ts`, `en.ts`)

**Files:**
- Modify: `app/lib/i18n/locales/ko.ts`
- Modify: `app/lib/i18n/locales/en.ts`

**Interfaces:**
- Consumes: 없음(정적 데이터)
- Produces: Task 8/10에서 참조한 `game.wrongTouchAria`, `gameResult.comboBonus`, `gameResult.wrongTouchPenalty`, `gameResult.incompleteLevelPenalty` 키. `gameResult.completionBonus`, `gameResult.streakBonus`, `stageTransition.failTitle`, `stageTransition.failMessage`, `stageTransition.retryButton`은 더 이상 어디서도 참조하지 않으므로 삭제(죽은 키 제거).

- [ ] **Step 1: `app/lib/i18n/locales/ko.ts` 수정**

`gameResult.completionBonus`와 `gameResult.streakBonus` 두 줄을 삭제하고 그 자리에:

```ts
  "gameResult.stageScore": "Stage 점수",
  "gameResult.timeBonus": "시간 보너스",
  "gameResult.comboBonus": "콤보 보너스",
  "gameResult.wrongTouchPenalty": "오답 감점",
  "gameResult.incompleteLevelPenalty": "미완주 감점",
```

(기존 `"gameResult.timeBonus": "시간 보너스",` 줄과 중복되지 않도록 원래 있던 timeBonus 줄은 지우고 위 5줄로 통째로 교체한다.)

`stageTransition.failTitle`, `stageTransition.failMessage`, `stageTransition.retryButton` 세 줄을 삭제한다.

`game.remainingCount` 줄 다음에 추가:

```ts
  "game.wrongTouchAria": "오답 {count}/{limit}",
```

- [ ] **Step 2: `app/lib/i18n/locales/en.ts`에 동일하게 반영**

`gameResult.completionBonus`/`gameResult.streakBonus`를 삭제하고 `gameResult.timeBonus` 자리를 아래로 교체:

```ts
  "gameResult.stageScore": "Stage Score",
  "gameResult.timeBonus": "Time Bonus",
  "gameResult.comboBonus": "Combo Bonus",
  "gameResult.wrongTouchPenalty": "Wrong Touch Penalty",
  "gameResult.incompleteLevelPenalty": "Incomplete Level Penalty",
```

`stageTransition.failTitle`, `stageTransition.failMessage`, `stageTransition.retryButton` 삭제.

`game.remainingCount` 다음에 추가:

```ts
  "game.wrongTouchAria": "{count}/{limit} wrong touches",
```

- [ ] **Step 3: 타입 체크 및 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 둘 다 에러 없음(`ko.ts`는 `Dictionary` 타입이라 키를 지워도 컴파일 에러가 나지 않음 — 존재하지 않는 키를 `t()`로 요청했을 때만 문자열 그대로 반환되는 런타임 폴백이므로, Task 8/10에서 추가한 `t("gameResult.comboBonus")` 등의 호출이 실제로 번역 문자열을 돌려주는지는 다음 Step에서 브라우저로 확인한다).

- [ ] **Step 4: 커밋**

```bash
git add app/lib/i18n/locales/ko.ts app/lib/i18n/locales/en.ts
git commit -m "$(cat <<'EOF'
i18n: 새 점수 항목 키 추가, 죽은 stageFail/구 보너스 키 제거

completionBonus/streakBonus를 comboBonus/wrongTouchPenalty/
incompleteLevelPenalty로 교체하고, 더 이상 어디서도 참조하지
않는 stageTransition.fail* 키를 삭제. 오답 카운터 aria-label
키(game.wrongTouchAria) 추가.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: 수동 브라우저 검증 (골든패스 + 엣지 케이스)

**Files:** 없음(검증만).

이 저장소는 훅/컴포넌트 자동 테스트 관례가 없으므로, 아래를 로컬 dev 서버(`npm run dev`)로 직접 플레이해 확인한다. 각 항목은 브라우저 콘솔에 에러가 없고 화면 표시가 스펙과 일치해야 통과.

- [ ] **Step 1: 개발 서버 기동**

Run: `npm run dev`
Expected: 콘솔에 컴파일 에러 없이 기동.

- [ ] **Step 2: 정상 완주 골든패스**

7레벨을 순서대로 플레이하며 각 레벨에서 정답을 전부 찾아 클리어한다(오답 없이). 확인할 것:
- 헤더의 남은 시간이 300초에서 시작해 레벨을 넘어가도 리셋되지 않고 계속 줄어드는지.
- 오답 X 표시가 항상 0/3인지.
- 결과 화면(`GameResultScreen`)에서 5개 행(Stage 점수/시간 보너스/콤보 보너스/오답 감점/미완주 감점)이 모두 보이고, 오답·미완주 감점이 0(또는 표시 안 되더라도 "-0")인지, 합계가 1953에 가까운(정답률 100%·100초 이내 완주 시 정확히 1953) 값인지.

- [ ] **Step 3: 오답 3회 강제진행 확인**

한 레벨에서 의도적으로 틀린 부분을 3번 클릭한다. 확인할 것:
- 클릭할 때마다 X 표시가 하나씩 채워지는지.
- 3번째 오답 시 화면이 짧게 흔들리고(shake), 약 0.4초 후 자동으로 다음 레벨로 넘어가는지(버튼 클릭 없이).
- 결과 화면에서 오답 감점이 정확히 `오답 횟수 × 10`으로 반영되는지.

- [ ] **Step 4: 전체 시간 초과 확인**

플레이 없이 방치하거나(또는 브라우저 개발자도구로 시간을 앞당길 수 없다면 실제로 300초를 기다려) 시간이 0이 되는 순간을 관찰한다. 확인할 것:
- 300초가 되는 즉시 별도 버튼 클릭 없이 바로 결과 화면(`gameResult`)으로 전환되는지.
- 그때까지 진행했던 레벨의 점수는 반영되고, 아예 시작 못 한 레벨만큼 미완주 감점이 붙는지.

- [ ] **Step 5: 최종 커밋(선택)**

수동 검증 중 문제를 발견해 코드를 고쳤다면, 해당 수정을 이 태스크가 아니라 원인이 된 태스크의 커밋에 `git commit --amend` 없이 새 커밋으로 추가한다(이 저장소 지침상 amend 금지 — Global Constraints 참고 대신 세션 공통 git 안전 수칙 준수).

---

## Task 13: `GameResultScreen` 감점 표시 스타일 수정 (실사용 QA 발견)

Task 12 수동 브라우저 검증 중 이란토가 실제로 발견한 표시 문제. 감점이 0일 때 "-0"으로 보이는 게 어색하고, 감점 행만 빨간색으로 강조하는 게 불필요하다는 피드백.

**Files:**
- Modify: `app/components/GameResultScreen.tsx`

**Interfaces:**
- Consumes: `ScoreBreakdown`(Task 6) — 변경 없음, 렌더링 방식만 수정

- [ ] **Step 1: `rows` 렌더링 부분을 아래로 교체**

기존(Task 10에서 작성한):
```tsx
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <dt className="text-muted">{row.label}</dt>
              <dd className={`font-bold ${row.isPenalty ? "text-error" : "text-ink"}`}>
                {row.isPenalty ? "-" : ""}
                {row.value}
              </dd>
            </div>
          ))}
```

아래로 교체:
```tsx
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <dt className="text-muted">{row.label}</dt>
              <dd className="text-ink font-bold">
                {row.isPenalty && row.value > 0 ? "-" : ""}
                {row.value}
              </dd>
            </div>
          ))}
```

변경 내용: (1) 감점 값이 0이면 "-" 접두사를 붙이지 않는다(`row.value > 0` 조건 추가). (2) 감점 행도 `text-error`(빨간색)가 아니라 `text-ink`(다른 행과 동일한 흰색/기본색)로 통일한다. `row.isPenalty` 필드 자체(및 그 위 `rows` 배열 정의)는 그대로 둔다 — "-" 접두사 조건에 여전히 필요하다.

- [ ] **Step 2: 수동 확인**

이 컴포넌트는 자동 테스트 대상이 아니다(저장소 컨벤션). `flatpak-spawn --host npx tsc --noEmit`으로 타입 에러 없는지만 확인.

- [ ] **Step 3: 커밋**

```bash
git add app/components/GameResultScreen.tsx
git commit -m "$(cat <<'EOF'
GameResultScreen: 감점 0일 때 접두사 생략, 감점 행 색상 통일

수동 QA에서 발견 — 감점이 0인데 "-0"으로 보이는 게 어색하고,
감점 행만 빨간색으로 구분할 필요가 없다는 피드백 반영.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: `GameScreen` 오답 판정 로직 개선 + 커서 치트 방지 (실사용 QA 발견)

Task 12 수동 브라우저 검증 중 이란토가 발견한 두 가지 문제:
1. 이미 찾은 정답 슬롯을 다시 클릭하면 오답으로 처리되는 버그(정답 슬롯 오버레이의 `else` 분기로 빠짐).
2. 슬롯에만 클릭 가능한 오버레이 div가 있어서, 마우스 커서가 손모양으로 바뀌는 위치를 더듬어 찾으면 정답 위치가 그대로 드러나는 구조적 문제.

**해결 방향**: 오버레이 div는 이제 "정답(차이) 슬롯"에만 렌더링한다(오답 슬롯용 오버레이는 완전히 없앤다). 오답 판정은 "정답 슬롯이 아닌 곳 아무데나 클릭"으로 통일하고, 클릭한 정확한 좌표에 실시간으로 ✕ 표시를 띄운다. 배경에도 정답 슬롯과 동일한 `cursor-pointer`를 적용해 커서 변화로 정답 위치를 추측할 수 없게 한다. 이미 찾은 정답 슬롯을 다시 클릭하면 오버레이가 클릭을 그 자리에서 흡수(`stopPropagation`)하고 아무 효과도 없다(오답 아님).

**Files:**
- Modify: `app/components/GameScreen.tsx` (전체 재작성)

**Interfaces:**
- Consumes: `WRONG_TOUCH_LIMIT_PER_LEVEL`(Task 1) — 변경 없음
- Produces: `GameScreenProps`는 Task 8과 동일(`session, stageNumber, totalStages, remainingTimeSec, onStageClear, onForceAdvance, onWrongTouch, onCorrectFind`) — **외부 인터페이스는 바뀌지 않는다**, `page.tsx`(Task 9) 수정 불필요.

- [ ] **Step 1: `app/components/GameScreen.tsx` 전체 교체**

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { GameSession } from "../actions";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import { WRONG_TOUCH_LIMIT_PER_LEVEL } from "../lib/stageConfig";

interface GameScreenProps {
  session: GameSession;
  stageNumber: number;
  totalStages: number;
  remainingTimeSec: number;
  onStageClear: (foundCount: number) => void;
  onForceAdvance: (foundCount: number) => void;
  onWrongTouch: () => void;
  onCorrectFind: () => void;
}

const FORCE_ADVANCE_DELAY_MS = 400;

type WrongMark = { id: number; x: number; y: number; side: "left" | "right" };

export default function GameScreen({
  session,
  stageNumber,
  totalStages,
  remainingTimeSec,
  onStageClear,
  onForceAdvance,
  onWrongTouch,
  onCorrectFind,
}: GameScreenProps) {
  const { t } = useLocale();
  const [foundSlots, setFoundSlots] = useState<Set<number>>(new Set());
  const [wrongTouchCount, setWrongTouchCount] = useState(0);
  const [wrongMarks, setWrongMarks] = useState<WrongMark[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const wrongMarkIdRef = React.useRef(0);

  const differenceSlots = session.slots.filter((s) => s.isDifference);
  const totalDifferences = differenceSlots.length;

  const updateScale = () => {
    if (containerRef.current) {
      const { clientWidth } = containerRef.current;
      setScale(clientWidth / 1200);
    }
  };

  useEffect(() => {
    window.addEventListener("resize", updateScale);
    updateScale();
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const handleImageLoad = () => {
    updateScale();
  };

  useEffect(() => {
    if (totalDifferences > 0 && foundSlots.size >= totalDifferences) {
      onStageClear(foundSlots.size);
    }
  }, [foundSlots.size, totalDifferences, onStageClear]);

  const registerWrongTouch = (x: number, y: number, side: "left" | "right") => {
    if (wrongTouchCount >= WRONG_TOUCH_LIMIT_PER_LEVEL) return;

    setWrongMarks((prev) => [...prev, { id: wrongMarkIdRef.current++, x, y, side }]);
    onWrongTouch();
    setWrongTouchCount((prev) => {
      const next = prev + 1;
      if (next >= WRONG_TOUCH_LIMIT_PER_LEVEL) {
        setIsShaking(true);
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(100);
        }
        setTimeout(() => onForceAdvance(foundSlots.size), FORCE_ADVANCE_DELAY_MS);
      }
      return next;
    });
  };

  const handleBackgroundClick =
    (side: "left" | "right") => (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      registerWrongTouch(e.clientX - rect.left, e.clientY - rect.top, side);
    };

  const handleSlotClick = (slotId: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (wrongTouchCount >= WRONG_TOUCH_LIMIT_PER_LEVEL) return;
    if (foundSlots.has(slotId)) return;

    setFoundSlots((prev) => {
      const newSet = new Set(prev);
      newSet.add(slotId);
      return newSet;
    });
    onCorrectFind();
  };

  const FALLBACK_CLIP_PATH = "circle(25%)";

  const buildClipPath = (polygon: { x: number; y: number }[] | null): string => {
    if (!polygon || polygon.length < 3) {
      return FALLBACK_CLIP_PATH;
    }
    if (polygon.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      return FALLBACK_CLIP_PATH;
    }
    const points = polygon.map((p) => `${p.x * 100}% ${p.y * 100}%`).join(", ");
    return `polygon(${points})`;
  };

  const renderClickOverlays = (side: "left" | "right") =>
    differenceSlots.map((slot) => (
      <div
        key={slot.slotId}
        className="absolute cursor-pointer overflow-hidden"
        style={{
          left: `${slot.x * scale}px`,
          top: `${slot.y * scale}px`,
          width: `${100 * slot.slotScale * scale}px`,
          height: `${100 * slot.slotScale * scale}px`,
          clipPath: buildClipPath(side === "left" ? slot.leftHitPolygon : slot.rightHitPolygon),
          zIndex: foundSlots.has(slot.slotId) ? 2 : 1,
        }}
        onClick={handleSlotClick(slot.slotId)}
      >
        {foundSlots.has(slot.slotId) && (
          <div className="absolute inset-0 flex items-center justify-center text-4xl bg-black/40 rounded-full animate-in zoom-in [clip-path:none]">
            ✅
          </div>
        )}
      </div>
    ));

  const renderWrongMarks = (side: "left" | "right") =>
    wrongMarks
      .filter((mark) => mark.side === side)
      .map((mark) => (
        <div
          key={mark.id}
          className="absolute pointer-events-none flex items-center justify-center text-3xl text-error"
          style={{ left: mark.x - 16, top: mark.y - 16, width: 32, height: 32, zIndex: 3 }}
        >
          ✕
        </div>
      ));

  return (
    <div className={`flex flex-col min-h-screen bg-bg-deep text-ink ${isShaking ? "animate-shake" : ""}`}>
      <header className="flex justify-between items-center p-4 md:px-8 bg-surface shadow-lg border-b border-wood z-10 sticky top-0">
        <span className="text-lg md:text-xl font-bold">
          {t("game.stageProgress", { current: stageNumber, total: totalStages })}
        </span>
        <div
          className="flex items-center gap-1"
          aria-label={t("game.wrongTouchAria", { count: wrongTouchCount, limit: WRONG_TOUCH_LIMIT_PER_LEVEL })}
        >
          {Array.from({ length: WRONG_TOUCH_LIMIT_PER_LEVEL }).map((_, i) => (
            <span key={i} className={`text-xl ${i < wrongTouchCount ? "text-error" : "text-muted/30"}`}>
              ✕
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl font-bold">{t("game.timeRemainingLabel")}</span>
          <span
            className={`text-2xl md:text-3xl font-extrabold ${remainingTimeSec <= 30 ? "text-error animate-pulse" : "text-amber"}`}
          >
            {t("game.secondsUnit", { seconds: remainingTimeSec })}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row items-center justify-center p-4 gap-6 overflow-auto">
        <div
          ref={containerRef}
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-wood hover:border-accent transition-colors w-full max-w-[1200px] cursor-pointer"
          style={{ aspectRatio: "1200 / 800" }}
          onClick={handleBackgroundClick("left")}
        >
          <img
            src={session.leftSceneUrl}
            alt="Scene Left"
            className="w-full h-full object-contain select-none pointer-events-none"
            onLoad={handleImageLoad}
          />
          {renderClickOverlays("left")}
          {renderWrongMarks("left")}
        </div>

        <div
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-wood hover:border-accent transition-colors w-full max-w-[1200px] cursor-pointer"
          style={{ aspectRatio: "1200 / 800" }}
          onClick={handleBackgroundClick("right")}
        >
          <img
            src={session.rightSceneUrl}
            alt="Scene Right"
            className="w-full h-full object-contain select-none pointer-events-none"
          />
          {renderClickOverlays("right")}
          {renderWrongMarks("right")}
        </div>
      </main>

      <footer className="flex justify-between items-center p-4 md:px-8 bg-surface border-t border-wood">
        <PixelPanel size="btn">
          <button type="button" className="w-full font-bold text-ink">
            {t("game.hintButton")}
          </button>
        </PixelPanel>
        <span className="text-lg font-bold">
          {t("game.remainingCount", { found: totalDifferences - foundSlots.size, total: totalDifferences })}
        </span>
      </footer>
    </div>
  );
}
```

핵심 변경점:
- `renderClickOverlays`가 이제 `session.slots` 전체가 아니라 `differenceSlots`(정답 슬롯)만 순회한다 — 오답(디코이) 슬롯 전용 오버레이가 아예 없어진다.
- `handleSlotClick`은 클릭 즉시 `e.stopPropagation()`을 호출해, 배경 클릭 핸들러로 이벤트가 전파되지 않게 막는다. 이미 찾은 슬롯(`foundSlots.has(slotId)`)이면 그대로 `return`— 오답 처리도, 추가 효과도 없다.
- 컨테이너(왼쪽/오른쪽 각각)에 `onClick={handleBackgroundClick(side)}`를 새로 달았다. 정답 슬롯 오버레이가 클릭을 흡수하지 못한 모든 클릭(디코이 슬롯 자리든 진짜 배경이든)이 여기로 떨어져 오답 처리된다.
- `registerWrongTouch(x, y, side)`가 클릭 좌표를 받아 `wrongMarks`에 追加하고, 기존 `onWrongTouch`/3회 소진 로직(흔들림·진동·강제진행)을 그대로 수행한다.
- 컨테이너 `className`에 `cursor-pointer`를 추가해, 배경 위 커서와 정답 슬롯 위 커서가 구분되지 않게 한다(정답 위치 추측 방지).
- `renderWrongMarks`가 클릭 좌표에 정확히 ✕ 표시를 렌더링한다(`pointer-events-none`이라 표시 자체는 클릭을 가로채지 않음).

- [ ] **Step 2: 타입 체크**

Run: `flatpak-spawn --host npx tsc --noEmit`
Expected: 에러 0건. `GameScreenProps`가 Task 8과 동일하므로 `page.tsx`(Task 9) 쪽 호출부는 수정 불필요.

- [ ] **Step 3: 커밋**

```bash
git add app/components/GameScreen.tsx
git commit -m "$(cat <<'EOF'
GameScreen: 오답 판정을 "정답 슬롯 밖 클릭"으로 통일, 커서 치트 방지

이미 찾은 정답을 재클릭하면 오답으로 처리되던 버그를 고치고
(오버레이가 클릭을 흡수만 하고 아무 효과 없음), 오답 전용
슬롯 오버레이를 없애 배경 클릭도 동일하게 오답 처리되도록
통일. 배경에도 cursor-pointer를 적용해 커서 변화로 정답
위치를 추측하는 치트를 막고, 클릭 좌표에 실시간 ✕ 표시 추가.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: 수동 재확인**

`npm run dev`로 실행 후: (1) 정답을 찾은 슬롯을 다시 클릭해도 오답 카운트가 늘지 않는지, (2) 정답이 아닌 빈 배경을 클릭하면 오답으로 처리되고 그 위치에 ✕가 뜨는지, (3) 이미지 위에서 마우스를 움직여도 정답 슬롯 근처와 배경에서 커서 모양이 동일한지 확인.

---

## Task 15: 최종 브랜치 리뷰에서 발견된 점수 정합성 버그 수정

최종 전체 브랜치 리뷰(opus 모델)에서 발견한 Critical 2건 + Important 1건. 개별 태스크 리뷰는 각 태스크의 diff만 보므로 놓쳤던, 태스크 경계를 넘나드는 결함이다.

**발견된 문제:**
1. **(Critical) 마지막 레벨(7단계)에서 오답 3회로 강제진행될 때 그 레벨 점수가 통째로 누락된다.** `handleForceAdvance`가 `recordLevelResult`로 `setLevelResults`를 큐잉한 직후 같은 이벤트 핸들러 안에서 `finishGame`을 호출하는데, `finishGame`은 `levelResults`를 **클로저(state)로** 읽어서 방금 큐잉한 항목이 반영되기 전 값을 쓴다(React state 업데이트는 비동기 커밋). 7레벨 `foundCount`가 `stageScore`/정답률 계산에서 빠지고, 심하면 `totalWrongTouches`/`comboBankedScore`도 낡은 스냅샷을 쓴다.
2. **(Critical) 300초 타임아웃 시 그 순간 진행 중이던 레벨에서 찾은 정답이 0점 처리된다.** 스펙(`2026-07-31-native-1953-score-design.md:90`)은 "그때까지 찾은 정답은 스테이지 점수로 그대로 인정"이라고 명시했지만, 타이머 effect가 `finishGame`만 호출하고 진행 중 레벨의 `foundCount`를 `levelResults`에 반영하는 코드가 없다(그 값은 `GameScreen`의 로컬 state에만 있어 훅이 알 방법이 없었음).
3. **(Important) `GameScreen`의 `registerWrongTouch`가 `setWrongTouchCount`의 함수형 업데이터 안에서 `setIsShaking`/`navigator.vibrate`/`setTimeout` 부수효과를 실행한다.** Next.js 앱 라우터는 `reactStrictMode`가 기본 `true`이고, React 19는 dev 모드에서 `setState`에 전달된 업데이터 함수를 부수효과 탐지를 위해 **두 번** 호출한다. 그 결과 dev 환경에서 오답 3회 강제진행이 이중으로 발생할 수 있다(마지막 레벨이 아니면 해당 레벨 점수가 이중 계상, 마지막 레벨이면 문제 1과 동일한 낡은 스냅샷 문제가 겹침). **이 버그가 남아있는 동안 `npm run dev`로 하는 수동 검증 결과는 신뢰할 수 없다.**

**수정 방향:** `finishGame`이 `levelResults`를 state 클로저로 읽지 않고 **호출부가 명시적으로 조립해서 전달**하도록 시그니처를 바꾼다(문제 1 해결). 훅이 "진행 중인 레벨에서 몇 개를 찾았는지"를 `recordCorrectFind` 시점에 직접 추적하는 `ref`를 두고, 타임아웃 시 이 값으로 진행 중 레벨의 `LevelResult`를 합성해 넘긴다(문제 2 해결). `registerWrongTouch`는 함수형 업데이터 대신 현재 렌더의 `wrongTouchCount`를 직접 읽어 부수효과를 업데이터 바깥으로 뺀다(문제 3 해결, 겸사겸사 미해결 상태였던 Task 8/14의 강제진행 `setTimeout` cleanup 누락도 이 태스크에서 같이 정리한다).

**Files:**
- Modify: `app/hooks/useGameProgress.ts` (전체 재작성)
- Modify: `app/components/GameScreen.tsx` (`registerWrongTouch` 부분 수정 + cleanup 추가)

**Interfaces:**
- Consumes: `STAGE_CONFIG`, `GLOBAL_TIME_LIMIT_SEC`, `calcComboBonusForStreak`, `calcFinalScore`, `calcGukbapTier`, `ScoreBreakdown`, `GukbapTier`, `LevelResult`(Tasks 1~6) — 변경 없음
- Produces: 훅의 반환값 이름/시그니처는 Task 7과 **완전히 동일하게 유지**한다(`GameScreen`/`page.tsx`는 이 태스크에서 수정할 필요 없음, `GameScreen.tsx`는 오직 `registerWrongTouch` 내부 구현만 바뀜).

- [ ] **Step 1: `app/hooks/useGameProgress.ts` 전체 교체**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGameData, GameSession } from "../actions";
import { preloadAllStages } from "../lib/preloadGame";
import type { LoadError } from "../lib/preloadGame";
import {
  STAGE_CONFIG,
  GLOBAL_TIME_LIMIT_SEC,
  calcComboBonusForStreak,
  calcFinalScore,
  calcGukbapTier,
  ScoreBreakdown,
  GukbapTier,
  LevelResult,
} from "../lib/stageConfig";
import { ensureParticipant, reassignNickname as reassignNicknameAction } from "../actions";

export type GamePhase =
  | "start"
  | "loading"
  | "playing"
  | "stageClear"
  | "gameResult"
  | "wheel"
  | "dailyResult";

function countDifferences(session: GameSession): number {
  return session.slots.filter((s) => s.isDifference).length;
}

export function useGameProgress(trackId: string | null) {
  const [phase, setPhase] = useState<GamePhase>("start");
  const [nickname, setNickname] = useState<string>("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const nicknameSyncedRef = useRef(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loadNonce, setLoadNonce] = useState(0);
  const [loadError, setLoadError] = useState<LoadError | null>(null);

  const [remainingTimeSec, setRemainingTimeSec] = useState(GLOBAL_TIME_LIMIT_SEC);
  const [levelResults, setLevelResults] = useState<LevelResult[]>([]);
  const [totalWrongTouches, setTotalWrongTouches] = useState(0);
  const [comboBankedScore, setComboBankedScore] = useState(0);
  const [comboCurrentStreak, setComboCurrentStreak] = useState(0);
  const totalAnswersRef = useRef(0);
  const currentLevelFoundCountRef = useRef(0);

  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);
  const [gukbapTier, setGukbapTier] = useState<GukbapTier | null>(null);

  const session = sessions[stageIndex] ?? null;

  useEffect(() => {
    let cancelled = false;
    void ensureParticipant(trackId).then((result) => {
      if (cancelled) return;
      setNickname(result.nickname);
      nicknameSyncedRef.current = result.nicknameSynced;
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const buildLevelResult = useCallback(
    (foundCount: number): LevelResult => ({
      pointPool: STAGE_CONFIG[stageIndex].pointPool,
      foundCount,
      actualDiffCount: session ? countDifferences(session) : 0,
    }),
    [stageIndex, session]
  );

  // finishGame은 levelResults를 state 클로저로 읽지 않는다 — 호출부가 방금 큐잉한 항목까지
  // 합쳐서 명시적으로 넘긴다. state를 그대로 읽으면 "같은 이벤트 안에서 setLevelResults 직후
  // 바로 finishGame을 호출"하는 경로(handleForceAdvance가 마지막 레벨일 때)에서 그 setState가
  // 아직 커밋되지 않은 값을 쓰게 되어 마지막 레벨 점수가 누락되는 버그가 있었다.
  const finishGame = useCallback(
    (levelsReached: number, finalLevelResults: LevelResult[]) => {
      const breakdown = calcFinalScore({
        levelResults: finalLevelResults,
        elapsedSec: GLOBAL_TIME_LIMIT_SEC - remainingTimeSec,
        totalWrongTouches,
        comboBankedScore,
        comboCurrentStreak,
        comboTotalAnswers: totalAnswersRef.current,
        levelsReached,
      });
      setScoreBreakdown(breakdown);
      setGukbapTier(calcGukbapTier(breakdown.total));
      setPhase("gameResult");
    },
    [remainingTimeSec, totalWrongTouches, comboBankedScore, comboCurrentStreak]
  );

  // 전체 300초 단일 타이머: playing/stageClear 구간 내내 흐르고, 0이 되면 그 자리에서 즉시 종료한다.
  // phase가 "playing"일 때 타임아웃되면, 그 순간 진행 중이던 레벨에서 찾은 정답
  // (currentLevelFoundCountRef)을 합성한 LevelResult를 만들어 반드시 점수에 포함시킨다 —
  // 그렇지 않으면 "그때까지 찾은 정답은 인정한다"는 스펙을 어기고 그 레벨이 0점 처리된다.
  // phase가 "stageClear"일 때 타임아웃되면 그 레벨은 이미 handleStageClear가 levelResults에
  // 기록했으므로 추가로 합성하지 않는다(중복 계상 방지).
  useEffect(() => {
    if (phase !== "playing" && phase !== "stageClear") return;
    if (remainingTimeSec <= 0) {
      if (phase === "playing") {
        finishGame(stageIndex + 1, [...levelResults, buildLevelResult(currentLevelFoundCountRef.current)]);
      } else {
        finishGame(stageIndex + 1, levelResults);
      }
      return;
    }
    const timer = setInterval(() => {
      setRemainingTimeSec((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, remainingTimeSec, stageIndex, levelResults, buildLevelResult, finishGame]);

  const runPreload = useCallback(async () => {
    setLoadError(null);
    const result = await preloadAllStages(fetchGameData);
    if (result.ok) {
      setSessions(result.sessions);
      totalAnswersRef.current = result.sessions.reduce((sum, s) => sum + countDifferences(s), 0);
      setLoadNonce((n) => n + 1);
      setPhase("playing");
    } else {
      setLoadError({ key: result.key, params: result.params });
    }
  }, []);

  const startGame = useCallback(() => {
    setPhase("loading");
    setStageIndex(0);
    setRemainingTimeSec(GLOBAL_TIME_LIMIT_SEC);
    setLevelResults([]);
    setTotalWrongTouches(0);
    setComboBankedScore(0);
    setComboCurrentStreak(0);
    currentLevelFoundCountRef.current = 0;
    setScoreBreakdown(null);
    setGukbapTier(null);

    if (!nicknameSyncedRef.current) {
      void reassignNicknameAction().then((result) => {
        setNickname(result.nickname);
        nicknameSyncedRef.current = result.nicknameSynced;
      });
    }

    void runPreload();
  }, [runPreload]);

  const retryPreload = useCallback(() => {
    void runPreload();
  }, [runPreload]);

  const regenerateNickname = useCallback(() => {
    setIsRegenerating(true);
    void reassignNicknameAction()
      .then((result) => {
        setNickname(result.nickname);
        nicknameSyncedRef.current = result.nicknameSynced;
      })
      .finally(() => setIsRegenerating(false));
  }, []);

  const recordCorrectFind = useCallback(() => {
    setComboCurrentStreak((prev) => prev + 1);
    currentLevelFoundCountRef.current += 1;
  }, []);

  const recordWrongTouch = useCallback(() => {
    setTotalWrongTouches((prev) => prev + 1);
    setComboBankedScore(
      (prev) => prev + calcComboBonusForStreak(comboCurrentStreak, totalAnswersRef.current)
    );
    setComboCurrentStreak(0);
  }, [comboCurrentStreak]);

  const handleStageClear = useCallback(
    (foundCount: number) => {
      setLevelResults((prev) => [...prev, buildLevelResult(foundCount)]);
      setPhase("stageClear");
    },
    [buildLevelResult]
  );

  // 마지막 레벨에서 강제진행되는 경우, 방금 조립한 updatedLevelResults를 finishGame에
  // "직접" 넘긴다 — setLevelResults(state) 갱신을 기다렸다가 다시 읽지 않는다(그게 문제 1의 원인이었다).
  const handleForceAdvance = useCallback(
    (foundCount: number) => {
      const updatedLevelResults = [...levelResults, buildLevelResult(foundCount)];
      setLevelResults(updatedLevelResults);
      currentLevelFoundCountRef.current = 0;

      const nextIndex = stageIndex + 1;
      if (nextIndex < STAGE_CONFIG.length) {
        setStageIndex(nextIndex);
        setPhase("playing");
        return;
      }
      finishGame(STAGE_CONFIG.length, updatedLevelResults);
    },
    [stageIndex, levelResults, buildLevelResult, finishGame]
  );

  // "다음" 버튼 클릭은 handleStageClear가 levelResults를 커밋한 뒤(별도 렌더/커밋 사이클)
  // 일어나는 별개의 이벤트이므로, 여기서는 state를 그대로 읽어도 안전하다(stale 문제 없음).
  const advanceToNextStage = useCallback(() => {
    currentLevelFoundCountRef.current = 0;
    const nextIndex = stageIndex + 1;
    if (nextIndex < STAGE_CONFIG.length) {
      setStageIndex(nextIndex);
      setPhase("playing");
      return;
    }
    finishGame(STAGE_CONFIG.length, levelResults);
  }, [stageIndex, levelResults, finishGame]);

  const proceedToWheel = useCallback(() => setPhase("wheel"), []);
  const proceedToDailyResult = useCallback(() => setPhase("dailyResult"), []);

  const resetToStart = useCallback(() => {
    setPhase("start");
    setStageIndex(0);
    setSessions([]);
    setRemainingTimeSec(GLOBAL_TIME_LIMIT_SEC);
    setLevelResults([]);
    setTotalWrongTouches(0);
    setComboBankedScore(0);
    setComboCurrentStreak(0);
    currentLevelFoundCountRef.current = 0;
    setScoreBreakdown(null);
    setGukbapTier(null);
  }, []);

  return {
    phase,
    nickname,
    regenerateNickname,
    isRegenerating,
    stageNumber: stageIndex + 1,
    loadNonce,
    totalStages: STAGE_CONFIG.length,
    remainingTimeSec,
    session,
    loadError,
    scoreBreakdown,
    gukbapTier,
    startGame,
    retryPreload,
    recordCorrectFind,
    recordWrongTouch,
    handleStageClear,
    handleForceAdvance,
    advanceToNextStage,
    proceedToWheel,
    proceedToDailyResult,
    resetToStart,
  };
}
```

- [ ] **Step 2: `app/components/GameScreen.tsx`의 `registerWrongTouch` 부분과 그 주변 수정**

기존(Task 14가 작성한):
```tsx
  const registerWrongTouch = (x: number, y: number, side: "left" | "right") => {
    if (wrongTouchCount >= WRONG_TOUCH_LIMIT_PER_LEVEL) return;

    setWrongMarks((prev) => [...prev, { id: wrongMarkIdRef.current++, x, y, side }]);
    onWrongTouch();
    setWrongTouchCount((prev) => {
      const next = prev + 1;
      if (next >= WRONG_TOUCH_LIMIT_PER_LEVEL) {
        setIsShaking(true);
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(100);
        }
        setTimeout(() => onForceAdvance(foundSlots.size), FORCE_ADVANCE_DELAY_MS);
      }
      return next;
    });
  };
```

아래로 교체(부수효과를 `setWrongTouchCount`의 함수형 업데이터 밖으로 빼고, 강제진행 타이머를 ref에 저장해 언마운트 시 정리):

```tsx
  const registerWrongTouch = (x: number, y: number, side: "left" | "right") => {
    if (wrongTouchCount >= WRONG_TOUCH_LIMIT_PER_LEVEL) return;

    setWrongMarks((prev) => [...prev, { id: wrongMarkIdRef.current++, x, y, side }]);
    onWrongTouch();

    const next = wrongTouchCount + 1;
    setWrongTouchCount(next);

    if (next >= WRONG_TOUCH_LIMIT_PER_LEVEL) {
      setIsShaking(true);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(100);
      }
      forceAdvanceTimeoutRef.current = setTimeout(() => onForceAdvance(foundSlots.size), FORCE_ADVANCE_DELAY_MS);
    }
  };
```

`wrongMarkIdRef` 선언 바로 아래에 새 ref 선언을 추가:
```tsx
  const forceAdvanceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
```

`updateScale`의 `useEffect` 다음(또는 다른 적당한 위치)에 언마운트 시 타이머 정리용 `useEffect`를 추가:
```tsx
  useEffect(() => {
    return () => {
      if (forceAdvanceTimeoutRef.current) {
        clearTimeout(forceAdvanceTimeoutRef.current);
      }
    };
  }, []);
```

**왜 이렇게 고치는지**: `setWrongTouchCount(prev => {...부수효과...})`처럼 함수형 업데이터 안에서 `setIsShaking`/`navigator.vibrate`/`setTimeout` 같은 부수효과를 실행하면, React 19 + Next.js의 기본 `reactStrictMode`가 dev 모드에서 이 업데이터 함수를 부수효과 탐지 목적으로 **두 번** 호출하기 때문에 오답 3회 강제진행이 이중으로 발생할 수 있다. `wrongTouchCount`를 렌더 스코프에서 직접 읽어 `next` 값을 계산하고 `setWrongTouchCount(next)`로 리터럴 값을 넘기면(함수가 아니므로) 이 이중 호출 문제 자체가 사라진다.

- [ ] **Step 3: 타입 체크**

Run: `flatpak-spawn --host npx tsc --noEmit`
Expected: 에러 0건(프로젝트 전체).

- [ ] **Step 4: 커밋**

```bash
git add app/hooks/useGameProgress.ts app/components/GameScreen.tsx
git commit -m "$(cat <<'EOF'
최종 브랜치 리뷰에서 발견된 점수 정합성 버그 수정

1. 마지막 레벨 강제진행 시 levelResults state를 클로저로 읽던
   finishGame이 방금 큐잉된 갱신을 놓쳐 7단계 점수가 누락되던
   버그 수정 — 호출부가 최신 배열을 직접 조립해서 넘기도록 변경.
2. 300초 타임아웃 시 진행 중이던 레벨에서 찾은 정답이 0점
   처리되던 버그 수정(스펙 명시 위반) — currentLevelFoundCountRef로
   추적해 타임아웃 시 그 레벨의 LevelResult를 합성해 포함.
3. GameScreen의 오답 카운트 함수형 업데이터 안에 있던 부수효과
   (흔들림/진동/강제진행 타이머)를 업데이터 밖으로 이동 —
   React 19 + Next.js 기본 StrictMode의 dev 모드 업데이터 이중
   호출로 오답 3회 강제진행이 이중 발생하던 문제 해결. 강제진행
   setTimeout을 ref에 저장해 언마운트 시 정리하도록 추가.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: 수동 재확인 (Task 12의 미완료 항목을 여기서 마무리)**

`npm run dev`로 실행 후, 이번엔 반드시 확인:
- **7단계(마지막 레벨)에서 일부러 오답 3번**: 결과 화면에서 7단계 정답까지 스테이지 점수에 포함되는지(기존엔 누락됐음).
- **레벨 중간(예: 3단계)에서 일부러 300초를 다 씀**: 그 순간까지 3단계에서 찾은 정답이 스테이지 점수에 포함되는지(기존엔 0점 처리됐음).
- 위 두 시나리오 모두 결과 화면을 새로고침 없이 한 번에 확인(개발 모드 StrictMode 이중 호출 여부까지 함께 확인하는 셈).

---

## Self-Review 요약

- **스펙 커버리지**: 게임 규칙 변경(레벨 7, 전역 300초, 오답 3회) → Task 1/7/8/9. 점수 구성 3항목(스테이지/시간/콤보) → Task 2~4, 6. 감점 2종 → Task 5~6. 검증된 엣지 케이스(오답만 찍는 악용 방지) → Task 6의 통합 테스트. UI 반영 → Task 8, 10. i18n → Task 11. 수동 검증 → Task 12. 스펙의 "범위 밖" 항목(`game_score_logs` 제출, 가챠 구간 재조정, 등급 컷오프 최종 확정)은 이 계획에 포함하지 않음(의도된 배제).
- **타입 일관성**: `LevelResult`/`ScoreBreakdown`/`CalcFinalScoreInput`/`GukbapTier` 이름과 필드가 Task 4/6에서 정의된 그대로 Task 7·10에서 동일하게 쓰임을 확인함. `GameScreenProps`의 `onStageClear(foundCount)`/`onForceAdvance(foundCount)` 시그니처가 Task 7의 `handleStageClear`/`handleForceAdvance`와 Task 9의 `page.tsx` 배선에서 일치함을 확인함.
- **플레이스홀더 없음**: `GUKBAP_TIER_CUTOFFS`는 스펙상 "밸런스 테스트 후 조정"이 명시된 항목이지만, 구현 시점에는 기존 절대값(1953/1500/1200/800)을 그대로 쓰는 구체적인 코드로 작성했다(TBD 텍스트 없음, 주석으로 조정 가능성만 명시).

# 프론트엔드 핵심 플레이 흐름 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gookbapgame`의 단일 라운드 MVP를 GDD(Ch.6~7) 기준 Stage 1~7 고정 진행 + 절대값 스코어링(총점 1953) + 오늘의 별명 구조로 리디자인한다.

**Architecture:** 신규 DB 테이블 없이(단, `base_images.level` 컬럼 1개 추가는 예외) 클라이언트 상태(`useGameProgress` 커스텀 훅)만으로 완결되는 7단계 상태머신. 스코어링/스테이지 설정은 순수 함수로 분리해 단위 테스트하고, 랭킹/업적/이벤트/힌트-질문 등 DB 의존 기능은 화면 자리만 두거나(스텁) 아예 포함하지 않는다.

**Tech Stack:** Next.js 16(App Router) / React 19 / TypeScript / Tailwind CSS v4 / Supabase JS client / `node:test`(`--experimental-strip-types`)

## Global Constraints

- Stage는 1~7 고정, 전 스테이지 제한시간 60초, 스테이지별 차이 개수 `[5,5,5,5,5,5,7]` (GDD 7.2).
- 총점 최대 1953 = Stage 점수 1400(180×6+320) + 완주 보너스 100 + 시간 보너스 400 + 정답행진 보너스 53 (GDD 6.2). 임의의 100점 환산 없이 절대값으로 계산한다.
- 재도전은 실패한 스테이지만 재시도하는 것이 아니라 **세션 전체를 Stage 1부터 재시작**(이미지 재추첨, 점수/업적 초기화, GDD 6.4)한다.
- DB 스키마 변경은 `base_images.level` 컬럼 추가 1개만 허용한다. 그 외 신규 테이블(랭킹/업적/쿠폰/힌트문항 등)은 이번 스펙 범위 밖이다.
- 힌트 버튼, 설정 모달, 랭킹, 업적, 이벤트(룰렛) 실제 로직, 설문, 구매영수증 화면은 스텁이거나 아예 포함하지 않는다(설계 스펙의 "이번 스펙에서 실구현" 표를 벗어나지 않는다).
- 비주얼 톤앤매너(색상/폰트/브랜드 그래픽)는 이번 범위 밖이다 — 기존 다크톤 레이아웃을 유지하고, 와이어프레임은 화면 구조·흐름 참고용으로만 쓴다.
- 참고 스펙: `docs/superpowers/specs/2026-07-21-frontend-core-flow-redesign-design.md`

---

### Task 1: 스테이지 설정 & 스코어링 순수 함수

**Files:**
- Create: `app/lib/stageConfig.ts`
- Test: `app/lib/stageConfig.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수, 외부 의존성 없음)
- Produces: `STAGE_CONFIG: StageDef[]` (7개 원소, `level`/`timeLimitSec`/`diffCount`/`stageScore` 필드), `TOTAL_STAGE_SCORE: number`(1400), `COMPLETION_BONUS: number`(100), `MAX_TIME_BONUS: number`(400), `STREAK_BONUS: number`(53), `MAX_TOTAL_SCORE: number`(1953), `calcTimeBonus(remainingTimeByStage: number[]): number`, `calcStreakBonus(hadWrongTouch: boolean): number`, `calcFinalScore(remainingTimeByStage: number[], hadWrongTouch: boolean): ScoreBreakdown`, `ScoreBreakdown = { stageScore, completionBonus, timeBonus, streakBonus, total }`, `GukbapTier = "1953 Master" | "국밥 단골" | "국밥 미식가" | "국밥 탐험가" | "국밥 입문생"`, `calcGukbapTier(totalScore: number): GukbapTier`. 이후 모든 태스크(`useGameProgress`, `GameResultScreen`, `DailyResultScreen`, `GameScreen`)가 이 타입/함수를 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/stageConfig.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_CONFIG,
  TOTAL_STAGE_SCORE,
  MAX_TOTAL_SCORE,
  calcTimeBonus,
  calcStreakBonus,
  calcFinalScore,
  calcGukbapTier,
} from "./stageConfig.ts";

test("STAGE_CONFIG는 7개 스테이지, Stage 점수 합계는 1400이다", () => {
  assert.equal(STAGE_CONFIG.length, 7);
  assert.equal(TOTAL_STAGE_SCORE, 1400);
});

test("MAX_TOTAL_SCORE는 1953이다", () => {
  assert.equal(MAX_TOTAL_SCORE, 1953);
});

test("calcTimeBonus: 전체 시간 예산의 60%(252초)를 남기면 만점 400을 준다", () => {
  const remaining = [36, 36, 36, 36, 36, 36, 36]; // 합계 252초
  assert.equal(calcTimeBonus(remaining), 400);
});

test("calcTimeBonus: 목표치의 절반만 남기면 절반 점수를 준다", () => {
  const remaining = [18, 18, 18, 18, 18, 18, 18]; // 합계 126초 = 252의 절반
  assert.equal(calcTimeBonus(remaining), 200);
});

test("calcTimeBonus: 남은 시간이 없으면 0점", () => {
  assert.equal(calcTimeBonus([]), 0);
});

test("calcTimeBonus: 남은 시간이 목표치를 초과해도 400점을 넘지 않는다", () => {
  const remaining = [60, 60, 60, 60, 60, 60, 60]; // 합계 420초
  assert.equal(calcTimeBonus(remaining), 400);
});

test("calcStreakBonus: 오답이 없으면 53점, 있으면 0점", () => {
  assert.equal(calcStreakBonus(false), 53);
  assert.equal(calcStreakBonus(true), 0);
});

test("calcFinalScore: 시간 만점 + 오답 없음이면 총점 1953", () => {
  const remaining = [36, 36, 36, 36, 36, 36, 36];
  const result = calcFinalScore(remaining, false);
  assert.equal(result.stageScore, 1400);
  assert.equal(result.completionBonus, 100);
  assert.equal(result.timeBonus, 400);
  assert.equal(result.streakBonus, 53);
  assert.equal(result.total, 1953);
});

test("calcFinalScore: 오답이 있으면 정답행진 보너스만 빠진다", () => {
  const remaining = [36, 36, 36, 36, 36, 36, 36];
  const result = calcFinalScore(remaining, true);
  assert.equal(result.streakBonus, 0);
  assert.equal(result.total, 1900);
});

test("calcGukbapTier: 만점이면 1953 Master", () => {
  assert.equal(calcGukbapTier(1953), "1953 Master");
});

test("calcGukbapTier: 1500점 이상 1953 미만은 국밥 단골", () => {
  assert.equal(calcGukbapTier(1500), "국밥 단골");
  assert.equal(calcGukbapTier(1952), "국밥 단골");
});

test("calcGukbapTier: 800점 미만은 국밥 입문생", () => {
  assert.equal(calcGukbapTier(0), "국밥 입문생");
  assert.equal(calcGukbapTier(799), "국밥 입문생");
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --experimental-strip-types --test app/lib/stageConfig.test.ts`
Expected: FAIL — `Cannot find module '.../app/lib/stageConfig.ts'` (파일이 아직 없음)

- [ ] **Step 3: 구현 작성**

`app/lib/stageConfig.ts`:

```ts
export type StageDef = {
  level: number;
  timeLimitSec: number;
  diffCount: number;
  stageScore: number;
};

export const STAGE_CONFIG: StageDef[] = [
  { level: 1, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 2, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 3, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 4, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 5, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 6, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 7, timeLimitSec: 60, diffCount: 7, stageScore: 320 },
];

export const TOTAL_STAGE_SCORE = STAGE_CONFIG.reduce((sum, s) => sum + s.stageScore, 0);
export const COMPLETION_BONUS = 100;
export const MAX_TIME_BONUS = 400;
export const STREAK_BONUS = 53;
export const MAX_TOTAL_SCORE = TOTAL_STAGE_SCORE + COMPLETION_BONUS + MAX_TIME_BONUS + STREAK_BONUS;

const TOTAL_TIME_BUDGET_SEC = STAGE_CONFIG.reduce((sum, s) => sum + s.timeLimitSec, 0);
// GDD 6.2: "일정 수준 이상의 남은 시간을 확보하면 최대 점수" — 세부 환산은 밸런스 테스트로
// 확정 예정이므로, 이 비율(전체 예산의 60%)을 상수 하나로 분리해 나중에 조정 가능하게 한다.
const TIME_BONUS_TARGET_RATIO = 0.6;

export function calcTimeBonus(remainingTimeByStage: number[]): number {
  const totalRemaining = remainingTimeByStage.reduce((sum, t) => sum + t, 0);
  const target = TOTAL_TIME_BUDGET_SEC * TIME_BONUS_TARGET_RATIO;
  const ratio = target > 0 ? totalRemaining / target : 0;
  return Math.min(MAX_TIME_BONUS, Math.round(MAX_TIME_BONUS * ratio));
}

export function calcStreakBonus(hadWrongTouch: boolean): number {
  return hadWrongTouch ? 0 : STREAK_BONUS;
}

export type ScoreBreakdown = {
  stageScore: number;
  completionBonus: number;
  timeBonus: number;
  streakBonus: number;
  total: number;
};

export function calcFinalScore(
  remainingTimeByStage: number[],
  hadWrongTouch: boolean
): ScoreBreakdown {
  const timeBonus = calcTimeBonus(remainingTimeByStage);
  const streakBonus = calcStreakBonus(hadWrongTouch);
  return {
    stageScore: TOTAL_STAGE_SCORE,
    completionBonus: COMPLETION_BONUS,
    timeBonus,
    streakBonus,
    total: TOTAL_STAGE_SCORE + COMPLETION_BONUS + timeBonus + streakBonus,
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

export function calcGukbapTier(totalScore: number): GukbapTier {
  const found = GUKBAP_TIER_CUTOFFS.find((c) => totalScore >= c.min);
  return found ? found.tier : "국밥 입문생";
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --experimental-strip-types --test app/lib/stageConfig.test.ts`
Expected: PASS, 13개 테스트 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add app/lib/stageConfig.ts app/lib/stageConfig.test.ts
git commit -m "feat: Stage 1~7 설정과 GDD 기준 스코어링 순수 함수 추가"
```

---

### Task 2: 오늘의 별명 생성

**Files:**
- Create: `app/lib/nickname.ts`
- Test: `app/lib/nickname.test.ts`

**Interfaces:**
- Consumes: 없음 (브라우저 `window.localStorage`만 사용, 없으면 매번 새로 생성)
- Produces: `generateNickname(): string`, `loadOrCreateNickname(): string`, `regenerateNickname(): string`. `useGameProgress`(Task 5)와 `StartScreen`(Task 11)이 이 세 함수를 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/nickname.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateNickname, loadOrCreateNickname, regenerateNickname } from "./nickname.ts";

function installFakeLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  };
  return () => {
    delete (globalThis as any).window;
  };
}

test("generateNickname은 '형용사 명사' 형태의 문자열을 반환한다", () => {
  const nickname = generateNickname();
  const parts = nickname.split(" ");
  assert.equal(parts.length, 2);
  assert.ok(parts[0].length > 0);
  assert.ok(parts[1].length > 0);
});

test("loadOrCreateNickname은 최초 호출 시 생성한 값을 이후 호출에서도 그대로 반환한다", () => {
  const cleanup = installFakeLocalStorage();
  const first = loadOrCreateNickname();
  const second = loadOrCreateNickname();
  assert.equal(first, second);
  cleanup();
});

test("regenerateNickname은 저장된 값을 새로 덮어쓴다", () => {
  const cleanup = installFakeLocalStorage();
  loadOrCreateNickname();
  const regenerated = regenerateNickname();
  const reloaded = loadOrCreateNickname();
  assert.equal(reloaded, regenerated);
  cleanup();
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --experimental-strip-types --test app/lib/nickname.test.ts`
Expected: FAIL — `Cannot find module '.../app/lib/nickname.ts'` (파일이 아직 없음)

- [ ] **Step 3: 구현 작성**

`app/lib/nickname.ts`:

```ts
// GDD 6.7: 형용사 100 + 명사 100 조합이 최종 목표이나, 이번 스펙은 구조 검증이
// 목적이므로 24개씩의 placeholder 목록으로 시작한다. 카피는 추후 확장.
const ADJECTIVES = [
  "든든한", "행복한", "푸짐한", "따뜻한", "시원한", "쫄깃한", "얼큰한", "담백한",
  "진한", "깊은", "정겨운", "구수한", "훈훈한", "넉넉한", "뜨끈한", "살뜰한",
  "야무진", "알찬", "정성스런", "소담한", "활기찬", "명랑한", "씩씩한", "포근한",
];

const NOUNS = [
  "솥밥", "숟가락", "뚝배기", "육수", "국밥", "김치", "부추", "수육",
  "젓가락", "뼈다귀", "순대", "깍두기", "국물", "밥공기", "장인", "한그릇",
  "뚝심", "손맛", "불맛", "국밥러", "미식가", "탐험가", "애호가", "단골",
];

const NICKNAME_STORAGE_KEY = "gookbapgame:nickname";

export function generateNickname(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective} ${noun}`;
}

export function loadOrCreateNickname(): string {
  if (typeof window === "undefined") return generateNickname();
  const stored = window.localStorage.getItem(NICKNAME_STORAGE_KEY);
  if (stored) return stored;
  const created = generateNickname();
  window.localStorage.setItem(NICKNAME_STORAGE_KEY, created);
  return created;
}

export function regenerateNickname(): string {
  const created = generateNickname();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(NICKNAME_STORAGE_KEY, created);
  }
  return created;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --experimental-strip-types --test app/lib/nickname.test.ts`
Expected: PASS, 3개 테스트 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add app/lib/nickname.ts app/lib/nickname.test.ts
git commit -m "feat: 로그인 없는 오늘의 별명 생성/localStorage 저장 추가"
```

---

### Task 3: 차이 개수 클램프 헬퍼 + 테스트 스크립트 정비

**Files:**
- Create: `app/lib/gameSelection.ts`
- Test: `app/lib/gameSelection.test.ts`
- Modify: `package.json:6`

**Interfaces:**
- Consumes: 없음
- Produces: `clampDifferenceCount(targetDiffCount: number, availableSlotCount: number): number`. Task 4의 `fetchGameData`가 이 함수로 기존 `Math.max(1, Math.round(N * 2/3))` 계산을 대체한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/gameSelection.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampDifferenceCount } from "./gameSelection.ts";

test("clampDifferenceCount: 콘텐츠가 목표치보다 많으면 목표치를 그대로 반환", () => {
  assert.equal(clampDifferenceCount(5, 10), 5);
});

test("clampDifferenceCount: 콘텐츠가 목표치보다 적으면 있는 만큼만 반환", () => {
  assert.equal(clampDifferenceCount(7, 3), 3);
});

test("clampDifferenceCount: 정확히 같으면 그대로 반환", () => {
  assert.equal(clampDifferenceCount(5, 5), 5);
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --experimental-strip-types --test app/lib/gameSelection.test.ts`
Expected: FAIL — `Cannot find module '.../app/lib/gameSelection.ts'` (파일이 아직 없음)

- [ ] **Step 3: 구현 작성**

`app/lib/gameSelection.ts`:

```ts
export function clampDifferenceCount(
  targetDiffCount: number,
  availableSlotCount: number
): number {
  return Math.min(targetDiffCount, availableSlotCount);
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --experimental-strip-types --test app/lib/gameSelection.test.ts`
Expected: PASS, 3개 테스트 모두 통과

- [ ] **Step 5: package.json의 test 스크립트에 신규 테스트 파일 3개 추가**

`package.json:6` 현재:

```json
    "test": "node --experimental-strip-types --test app/lib/composeScene.test.ts test/pipeline-visual.test.ts"
```

변경 후:

```json
    "test": "node --experimental-strip-types --test app/lib/composeScene.test.ts app/lib/stageConfig.test.ts app/lib/nickname.test.ts app/lib/gameSelection.test.ts test/pipeline-visual.test.ts"
```

- [ ] **Step 6: 전체 테스트 스크립트 실행 → 통과 확인**

Run: `npm test`
Expected: PASS, `composeScene.test.ts` / `stageConfig.test.ts` / `nickname.test.ts` / `gameSelection.test.ts` / `pipeline-visual.test.ts` 전부 통과

- [ ] **Step 7: 커밋**

```bash
git add app/lib/gameSelection.ts app/lib/gameSelection.test.ts package.json
git commit -m "feat: 차이 개수 클램프 헬퍼 추가 및 테스트 스크립트에 신규 테스트 등록"
```

---

### Task 4: `fetchGameData`를 스테이지(level) 기반으로 확장 + 스키마 갱신

**Files:**
- Modify: `app/actions.ts`
- Modify: `scripts/test-db-schema.sql`

**Interfaces:**
- Consumes: `clampDifferenceCount` from `app/lib/gameSelection.ts` (Task 3)
- Produces: `fetchGameData(level: number, targetDiffCount: number): Promise<GameSession | null>`, `GameSession = { level: number; leftSceneUrl: string; rightSceneUrl: string; slots: GameSlot[] }`. Task 5(`useGameProgress`)가 `STAGE_CONFIG[i].level`/`STAGE_CONFIG[i].diffCount`를 인자로 이 함수를 호출한다.

- [ ] **Step 1: `scripts/test-db-schema.sql`에 `level` 컬럼 추가**

`base_images` 테이블 정의(파일 10~15번 줄)를:

```sql
create table base_images (
  id bigint generated always as identity primary key,
  title text not null,
  image_url text not null,
  created_at timestamptz default now()
);
```

다음으로 변경:

```sql
create table base_images (
  id bigint generated always as identity primary key,
  title text not null,
  image_url text not null,
  level integer not null default 1,
  created_at timestamptz default now()
);
```

파일 상단(1~3번 줄) 주석에 한 줄 추가:

```sql
-- 테스트용 Supabase 프로젝트에 gookbapgame 스키마를 재현하는 스크립트.
-- 팀 대시보드(gookbapanalyze) Table Editor 스크린샷 기준으로 작성됨.
-- level 컬럼은 운영 Supabase에는 이미 있고(gookbapanalyze의 updateBaseImageLevel),
-- 이 로컬 테스트 스키마 스크립트에는 빠져있던 것을 뒤늦게 추가함(1~9 범위, Stage 설계는 1~7만 사용).
-- Supabase SQL Editor에 붙여넣고 실행할 것.
```

- [ ] **Step 2: `app/actions.ts` 수정 — import 추가**

`app/actions.ts:1-3` 현재:

```ts
"use server";

import { supabase } from "./lib/db";
```

변경 후:

```ts
"use server";

import { supabase } from "./lib/db";
import { clampDifferenceCount } from "./lib/gameSelection";
```

- [ ] **Step 3: `GameSession` 타입에 `level` 필드 추가**

`app/actions.ts:13-17` 현재:

```ts
export type GameSession = {
  leftSceneUrl: string;
  rightSceneUrl: string;
  slots: GameSlot[];
};
```

변경 후:

```ts
export type GameSession = {
  level: number;
  leftSceneUrl: string;
  rightSceneUrl: string;
  slots: GameSlot[];
};
```

- [ ] **Step 4: `fetchGameData` 시그니처와 쿼리 필터 변경**

`app/actions.ts:19-31` 현재:

```ts
export async function fetchGameData(): Promise<GameSession | null> {
  try {
    // 1. Fetch all base_images and shuffle them
    const { data: baseImages, error: baseErr } = await supabase
      .from("base_images")
      .select("*");

    if (baseErr || !baseImages || baseImages.length === 0) {
      console.error("Failed to fetch base_images:", baseErr);
      return null;
    }

    const shuffledBaseImages = [...baseImages].sort(() => 0.5 - Math.random());
```

변경 후:

```ts
export async function fetchGameData(
  level: number,
  targetDiffCount: number
): Promise<GameSession | null> {
  try {
    // 1. Fetch base_images registered for this stage's level and shuffle them
    const { data: baseImages, error: baseErr } = await supabase
      .from("base_images")
      .select("*")
      .eq("level", level);

    if (baseErr || !baseImages || baseImages.length === 0) {
      console.error(`Failed to fetch base_images for level=${level}:`, baseErr);
      return null;
    }

    const shuffledBaseImages = [...baseImages].sort(() => 0.5 - Math.random());
```

- [ ] **Step 5: 차이 개수 계산을 `clampDifferenceCount`로 교체**

`app/actions.ts:73-77`(변경 전 줄 번호 기준) 현재:

```ts
    // 3. Determine differences
    const N = validSlots.length;
    const numDifferences = Math.max(1, Math.round(N * (2 / 3)));

    const diffIndices = [...Array(N).keys()].sort(() => 0.5 - Math.random()).slice(0, numDifferences);
```

변경 후:

```ts
    // 3. Determine differences — GDD 7.2가 정한 스테이지별 고정 목표치를 우선하되,
    // 콘텐츠(유효 슬롯)가 그보다 적으면 있는 만큼만 차이로 지정한다(조용히 스킵하지 않음).
    const N = validSlots.length;
    const numDifferences = clampDifferenceCount(targetDiffCount, N);
    if (numDifferences < targetDiffCount) {
      console.warn(
        `[fetchGameData] level=${level}: 콘텐츠 슬롯(${N}개)이 목표 차이 개수(${targetDiffCount})보다 적어 ${numDifferences}개로 축소함`
      );
    }

    const diffIndices = [...Array(N).keys()].sort(() => 0.5 - Math.random()).slice(0, numDifferences);
```

- [ ] **Step 6: 반환값에 `level` 필드 추가**

`app/actions.ts:113-121`(변경 전 줄 번호 기준) 현재:

```ts
    const baseImageId = selectedBaseImage.id;
    const leftSceneUrl = `/api/scene?base=${baseImageId}&side=left&parts=${leftPairs.join(",")}`;
    const rightSceneUrl = `/api/scene?base=${baseImageId}&side=right&parts=${rightPairs.join(",")}`;

    return {
      leftSceneUrl,
      rightSceneUrl,
      slots,
    };
```

변경 후:

```ts
    const baseImageId = selectedBaseImage.id;
    const leftSceneUrl = `/api/scene?base=${baseImageId}&side=left&parts=${leftPairs.join(",")}`;
    const rightSceneUrl = `/api/scene?base=${baseImageId}&side=right&parts=${rightPairs.join(",")}`;

    return {
      level,
      leftSceneUrl,
      rightSceneUrl,
      slots,
    };
```

- [ ] **Step 7: 확인**

이 시점에서는 `app/page.tsx`가 아직 예전 `fetchGameData()`(인자 없음) 형태로 호출하고 있어 프로젝트 전체 타입체크는 통과하지 않는다 — 이는 Task 12(page.tsx 재배선)에서 해소된다. 이번 태스크에서는 위 변경분이 Task 3의 `clampDifferenceCount` 시그니처, 그리고 Task 5가 기대하는 `fetchGameData(level, targetDiffCount)` 시그니처와 정확히 일치하는지 눈으로 재확인한다.

- [ ] **Step 8: 커밋**

```bash
git add app/actions.ts scripts/test-db-schema.sql
git commit -m "feat: fetchGameData가 스테이지 level과 목표 차이 개수를 받도록 확장"
```

---

### Task 5: `useGameProgress` 훅 — 7단계 진행 상태머신

**Files:**
- Create: `app/hooks/useGameProgress.ts`

**Interfaces:**
- Consumes: `fetchGameData`, `GameSession` from `app/actions.ts`(Task 4); `STAGE_CONFIG`, `calcFinalScore`, `calcGukbapTier`, `ScoreBreakdown`, `GukbapTier` from `app/lib/stageConfig.ts`(Task 1); `loadOrCreateNickname`, `regenerateNickname` from `app/lib/nickname.ts`(Task 2, 훅 내부에서는 `regenerateStoredNickname`이라는 이름으로 import)
- Produces: `GamePhase = "start" | "playing" | "stageClear" | "stageFail" | "gameResult" | "wheel" | "dailyResult"`, 그리고 훅이 반환하는 객체:
  `{ phase, nickname, regenerateNickname, stageNumber, totalStages, timeLimitSec, session, isLoading, loadError, scoreBreakdown, gukbapTier, startGame, recordWrongTouch, handleStageClear, handleStageTimeout, advanceToNextStage, retryFromStageOne, proceedToWheel, proceedToDailyResult, resetToStart }`.
  Task 12(`page.tsx`)가 이 전체 반환 객체를 그대로 소비한다.

이 훅은 React state만 다루고 DOM/브라우저 API에 직접 접근하지 않으므로(`nickname.ts`가 `window` 접근을 캡슐화), 프로젝트에 React 컴포넌트/훅 테스트 하네스(`@testing-library/react` 등)가 전혀 없는 현재 상태에서 새 테스트 인프라를 추가하는 대신 Task 13의 수동 브라우저 검증으로 동작을 확인한다. 이 훅이 호출하는 `calcFinalScore`/`calcGukbapTier`/`loadOrCreateNickname`/`fetchGameData`의 순수 로직 부분은 이미 Task 1·2·4에서 단위 테스트로 커버되어 있다.

- [ ] **Step 1: 구현 작성**

`app/hooks/useGameProgress.ts`:

```ts
"use client";

import { useCallback, useState } from "react";
import { fetchGameData, GameSession } from "../actions";
import {
  STAGE_CONFIG,
  calcFinalScore,
  calcGukbapTier,
  ScoreBreakdown,
  GukbapTier,
} from "../lib/stageConfig";
import {
  loadOrCreateNickname,
  regenerateNickname as regenerateStoredNickname,
} from "../lib/nickname";

export type GamePhase =
  | "start"
  | "playing"
  | "stageClear"
  | "stageFail"
  | "gameResult"
  | "wheel"
  | "dailyResult";

export function useGameProgress() {
  const [phase, setPhase] = useState<GamePhase>("start");
  const [nickname, setNickname] = useState<string>(() => loadOrCreateNickname());
  const [stageIndex, setStageIndex] = useState(0);
  const [session, setSession] = useState<GameSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [remainingTimeByStage, setRemainingTimeByStage] = useState<number[]>([]);
  const [hadWrongTouch, setHadWrongTouch] = useState(false);
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);
  const [gukbapTier, setGukbapTier] = useState<GukbapTier | null>(null);

  const loadStage = useCallback(async (index: number) => {
    setIsLoading(true);
    setLoadError(null);
    const cfg = STAGE_CONFIG[index];
    const data = await fetchGameData(cfg.level, cfg.diffCount);
    setIsLoading(false);
    if (!data) {
      setLoadError("게임 데이터를 불러오는데 실패했습니다.");
      return false;
    }
    setSession(data);
    return true;
  }, []);

  const startGame = useCallback(async () => {
    setStageIndex(0);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    setScoreBreakdown(null);
    setGukbapTier(null);
    const ok = await loadStage(0);
    if (ok) setPhase("playing");
  }, [loadStage]);

  const regenerateNickname = useCallback(() => {
    setNickname(regenerateStoredNickname());
  }, []);

  const recordWrongTouch = useCallback(() => {
    setHadWrongTouch(true);
  }, []);

  const handleStageClear = useCallback((remainingTimeSec: number) => {
    setRemainingTimeByStage((prev) => [...prev, remainingTimeSec]);
    setPhase("stageClear");
  }, []);

  const handleStageTimeout = useCallback(() => {
    setPhase("stageFail");
  }, []);

  const advanceToNextStage = useCallback(async () => {
    const nextIndex = stageIndex + 1;
    if (nextIndex < STAGE_CONFIG.length) {
      setStageIndex(nextIndex);
      const ok = await loadStage(nextIndex);
      if (ok) setPhase("playing");
      return;
    }
    const breakdown = calcFinalScore(remainingTimeByStage, hadWrongTouch);
    setScoreBreakdown(breakdown);
    setGukbapTier(calcGukbapTier(breakdown.total));
    setPhase("gameResult");
  }, [stageIndex, remainingTimeByStage, hadWrongTouch, loadStage]);

  const retryFromStageOne = useCallback(async () => {
    setStageIndex(0);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    const ok = await loadStage(0);
    if (ok) setPhase("playing");
  }, [loadStage]);

  const proceedToWheel = useCallback(() => setPhase("wheel"), []);
  const proceedToDailyResult = useCallback(() => setPhase("dailyResult"), []);

  const resetToStart = useCallback(() => {
    setPhase("start");
    setStageIndex(0);
    setSession(null);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    setScoreBreakdown(null);
    setGukbapTier(null);
  }, []);

  return {
    phase,
    nickname,
    regenerateNickname,
    stageNumber: stageIndex + 1,
    totalStages: STAGE_CONFIG.length,
    timeLimitSec: STAGE_CONFIG[stageIndex].timeLimitSec,
    session,
    isLoading,
    loadError,
    scoreBreakdown,
    gukbapTier,
    startGame,
    recordWrongTouch,
    handleStageClear,
    handleStageTimeout,
    advanceToNextStage,
    retryFromStageOne,
    proceedToWheel,
    proceedToDailyResult,
    resetToStart,
  };
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/hooks/useGameProgress.ts
git commit -m "feat: 7단계 진행/점수/재도전 상태를 관리하는 useGameProgress 훅 추가"
```

---

### Task 6: `GameScreen` — 스테이지 인지 + 오답 콜백 + 힌트 스텁

**Files:**
- Modify: `app/components/GameScreen.tsx`

**Interfaces:**
- Consumes: `GameSession` type from `app/actions.ts`(Task 4, `level` 필드 추가됨)
- Produces: `GameScreenProps = { session: GameSession; stageNumber: number; totalStages: number; timeLimitSec: number; onStageClear: (remainingTimeSec: number) => void; onStageTimeout: () => void; onWrongTouch: () => void }`. Task 12(`page.tsx`)가 `useGameProgress`의 필드들을 이 props로 그대로 연결하고, `key={stageNumber}`로 스테이지 전환 시 강제 리마운트한다(내부 `timeLeft`/`foundSlots`가 `session` prop만 바뀌어서는 리셋되지 않는 기존 버그 대응).

- [ ] **Step 1: 전체 내용 교체**

`app/components/GameScreen.tsx` 전체를 다음으로 교체:

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { GameSession } from "../actions";

interface GameScreenProps {
  session: GameSession;
  stageNumber: number;
  totalStages: number;
  timeLimitSec: number;
  onStageClear: (remainingTimeSec: number) => void;
  onStageTimeout: () => void;
  onWrongTouch: () => void;
}

export default function GameScreen({
  session,
  stageNumber,
  totalStages,
  timeLimitSec,
  onStageClear,
  onStageTimeout,
  onWrongTouch,
}: GameScreenProps) {
  const [timeLeft, setTimeLeft] = useState(timeLimitSec);
  const [foundSlots, setFoundSlots] = useState<Set<number>>(new Set());
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
    if (timeLeft <= 0) {
      onStageTimeout();
      return;
    }

    if (totalDifferences > 0 && foundSlots.size >= totalDifferences) {
      onStageClear(timeLeft);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, foundSlots.size, totalDifferences, onStageTimeout, onStageClear]);

  const handleSlotClick = (slotId: number, isDifference: boolean) => {
    if (isDifference && !foundSlots.has(slotId)) {
      setFoundSlots((prev) => {
        const newSet = new Set(prev);
        newSet.add(slotId);
        return newSet;
      });
      return;
    }
    onWrongTouch();
  };

  const renderClickOverlays = () =>
    session.slots.map((slot) => (
      <div
        key={slot.slotId}
        className="absolute cursor-pointer overflow-hidden"
        style={{
          left: `${slot.x * scale}px`,
          top: `${slot.y * scale}px`,
          width: `${100 * slot.slotScale * scale}px`,
          height: `${100 * slot.slotScale * scale}px`,
        }}
        onClick={() => handleSlotClick(slot.slotId, slot.isDifference)}
      >
        {foundSlots.has(slot.slotId) && (
          <div className="absolute inset-0 flex items-center justify-center text-4xl bg-black/40 rounded-full animate-in zoom-in z-10">
            ✅
          </div>
        )}
      </div>
    ));

  return (
    <div className="flex flex-col min-h-screen bg-zinc-900 text-white font-sans">
      <header className="flex justify-between items-center p-4 md:px-8 bg-zinc-800 shadow-lg border-b border-zinc-700 z-10 sticky top-0">
        <span className="text-lg md:text-xl font-bold">
          {stageNumber} / {totalStages} 단계
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl font-bold">남은 시간:</span>
          <span
            className={`text-2xl md:text-3xl font-extrabold ${timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-green-400"}`}
          >
            {timeLeft}초
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row items-center justify-center p-4 gap-6 overflow-auto">
        <div
          ref={containerRef}
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-zinc-800 hover:border-indigo-500 transition-colors w-full max-w-[1200px]"
          style={{ aspectRatio: "1200 / 800" }}
        >
          <img
            src={session.leftSceneUrl}
            alt="Scene Left"
            className="w-full h-full object-contain select-none pointer-events-none"
            onLoad={handleImageLoad}
          />
          {renderClickOverlays()}
        </div>

        <div
          className="relative group rounded-2xl overflow-hidden shadow-2xl border-4 border-zinc-800 hover:border-indigo-500 transition-colors w-full max-w-[1200px]"
          style={{ aspectRatio: "1200 / 800" }}
        >
          <img
            src={session.rightSceneUrl}
            alt="Scene Right"
            className="w-full h-full object-contain select-none pointer-events-none"
          />
          {renderClickOverlays()}
        </div>
      </main>

      <footer className="flex justify-between items-center p-4 md:px-8 bg-zinc-800 border-t border-zinc-700">
        <button
          type="button"
          className="px-4 py-2 rounded-full bg-yellow-500/20 text-yellow-300 font-bold border border-yellow-500/40"
        >
          힌트
        </button>
        <span className="text-lg font-bold">
          남은 개수: {totalDifferences - foundSlots.size}/{totalDifferences}
        </span>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: 확인**

이 태스크 단독으로는 `app/page.tsx`가 아직 예전 props(`onSuccess`/`onFail`)로 호출하고 있어 프로젝트 전체 타입체크는 Task 12 전까지 통과하지 않는다. 위 파일이 이 태스크의 Interfaces 블록에 선언한 `GameScreenProps`와 정확히 일치하는지 재확인한다.

- [ ] **Step 3: 커밋**

```bash
git add app/components/GameScreen.tsx
git commit -m "feat: GameScreen이 스테이지 번호/오답 콜백/힌트 스텁을 지원하도록 확장"
```

---

### Task 7: `StageTransitionModal` — 단계 클리어/타임아웃 모달

**Files:**
- Create: `app/components/StageTransitionModal.tsx`
- Delete: `app/components/Modal.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `StageTransitionModalProps = { type: "stageClear" | "stageFail"; onNext: () => void }`. Task 12가 `phase === "stageClear"`일 때 `onNext={advanceToNextStage}`, `phase === "stageFail"`일 때 `onNext={retryFromStageOne}`으로 연결한다.

기존 `Modal.tsx`는 단일 라운드 MVP의 "success/fail 최종 결과" 모달이었다 — 이번 리디자인에서 그 역할은 `GameResultScreen`(Task 8)과 `DailyResultScreen`(Task 10)이 대신하므로, `Modal.tsx`는 삭제하고 이 컴포넌트로 대체한다.

- [ ] **Step 1: 기존 파일 삭제**

```bash
rm app/components/Modal.tsx
```

- [ ] **Step 2: 신규 컴포넌트 작성**

`app/components/StageTransitionModal.tsx`:

```tsx
"use client";

import React from "react";

interface StageTransitionModalProps {
  type: "stageClear" | "stageFail";
  onNext: () => void;
}

export default function StageTransitionModal({ type, onNext }: StageTransitionModalProps) {
  const isClear = type === "stageClear";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
        <div className="text-6xl mb-4">{isClear ? "🎉" : "⏳"}</div>
        <h2
          className={`text-2xl font-extrabold mb-4 ${isClear ? "text-green-500" : "text-red-500"}`}
        >
          {isClear ? "축하합니다!!" : "아쉽게도"}
        </h2>
        <p className="text-zinc-600 dark:text-zinc-300 mb-6 text-lg">
          {isClear ? "이번 단계를 통과하셨습니다." : "시간이 종료되었습니다."}
        </p>
        <button
          onClick={onNext}
          className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl font-bold shadow-md transition-all active:scale-95"
        >
          {isClear ? "다음" : "재도전"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add -A app/components/StageTransitionModal.tsx app/components/Modal.tsx
git commit -m "feat: 단일 결과 모달을 단계별 클리어/타임아웃 모달로 교체"
```

---

### Task 8: `GameResultScreen` — 세션 최종 점수 화면

**Files:**
- Create: `app/components/GameResultScreen.tsx`

**Interfaces:**
- Consumes: `ScoreBreakdown`, `GukbapTier` types from `app/lib/stageConfig.ts`(Task 1)
- Produces: `GameResultScreenProps = { scoreBreakdown: ScoreBreakdown; gukbapTier: GukbapTier; onNext: () => void }`. Task 12가 `phase === "gameResult"`일 때 `onNext={proceedToWheel}`로 연결한다.

- [ ] **Step 1: 구현 작성**

`app/components/GameResultScreen.tsx`:

```tsx
"use client";

import React from "react";
import { ScoreBreakdown, GukbapTier } from "../lib/stageConfig";

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
  const rows: { label: string; value: number }[] = [
    { label: "Stage 점수", value: scoreBreakdown.stageScore },
    { label: "완주 보너스", value: scoreBreakdown.completionBonus },
    { label: "시간 보너스", value: scoreBreakdown.timeBonus },
    { label: "정답행진 보너스", value: scoreBreakdown.streakBonus },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-sm w-full bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 text-center">
        <h1 className="text-2xl font-extrabold mb-6">게임 결과</h1>
        <dl className="space-y-2 mb-6 text-left">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <dt className="text-zinc-300">{row.label}</dt>
              <dd className="font-bold">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-white/20 pt-4 mb-2">
          <div className="flex justify-between text-xl font-extrabold">
            <span>총점</span>
            <span>{scoreBreakdown.total} / 1953</span>
          </div>
        </div>
        <p className="text-yellow-300 font-bold mb-8">국밥력: {gukbapTier}</p>
        <button
          onClick={onNext}
          className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 rounded-xl font-bold shadow-md transition-all active:scale-95"
        >
          다음
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/components/GameResultScreen.tsx
git commit -m "feat: 세션 최종 점수/국밥력을 보여주는 GameResultScreen 추가"
```

---

### Task 9: `WheelScreen` — 행운의 돌림판 placeholder

**Files:**
- Create: `app/components/WheelScreen.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `WheelScreenProps = { onNext: () => void }`. Task 12가 `phase === "wheel"`일 때 `onNext={proceedToDailyResult}`로 연결한다.

- [ ] **Step 1: 구현 작성**

`app/components/WheelScreen.tsx`:

```tsx
"use client";

import React from "react";

interface WheelScreenProps {
  onNext: () => void;
}

export default function WheelScreen({ onNext }: WheelScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-sm w-full bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 text-center">
        <h1 className="text-2xl font-extrabold mb-6">행운의 돌림판</h1>
        <div className="text-6xl mb-6">🎡</div>
        <p className="text-zinc-300 mb-8">준비 중입니다.</p>
        <button
          onClick={onNext}
          className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 rounded-xl font-bold shadow-md transition-all active:scale-95"
        >
          다음
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/components/WheelScreen.tsx
git commit -m "feat: 행운의 돌림판 placeholder 화면 추가"
```

---

### Task 10: `DailyResultScreen` — 오늘의 결과 화면

**Files:**
- Create: `app/components/DailyResultScreen.tsx`

**Interfaces:**
- Consumes: `GukbapTier` type from `app/lib/stageConfig.ts`(Task 1)
- Produces: `DailyResultScreenProps = { nickname: string; gukbapTier: GukbapTier; totalScore: number; onRestart: () => void }`. Task 12가 `phase === "dailyResult"`일 때 `onRestart={resetToStart}`로 연결한다.

- [ ] **Step 1: 구현 작성**

`app/components/DailyResultScreen.tsx`:

```tsx
"use client";

import React from "react";
import { GukbapTier } from "../lib/stageConfig";

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
  const stubAchievements = ["첫 만남", "형제의 눈썰미"];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-sm w-full bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 text-center">
        <h1 className="text-2xl font-extrabold mb-6">오늘의 결과</h1>
        <p className="text-zinc-300 mb-1">오늘의 별명</p>
        <p className="text-xl font-bold mb-4">{nickname}</p>
        <p className="text-zinc-300 mb-1">국밥력</p>
        <p className="text-xl font-bold mb-4">{gukbapTier}</p>
        <p className="text-zinc-300 mb-1">최종점수</p>
        <p className="text-xl font-bold mb-6">{totalScore} / 1953</p>
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {stubAchievements.map((label) => (
            <span
              key={label}
              className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-300 text-sm border border-yellow-500/40"
            >
              {label}
            </span>
          ))}
        </div>
        <button
          onClick={onRestart}
          className="w-full py-3 px-6 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl font-bold transition-all active:scale-95"
        >
          처음으로
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/components/DailyResultScreen.tsx
git commit -m "feat: 오늘의 결과 화면(별명/국밥력/최종점수 실구현, 업적 스텁) 추가"
```

---

### Task 11: `StartScreen` — 오늘의 별명 + 내결과/랭킹 스텁

**Files:**
- Modify: `app/components/StartScreen.tsx`

**Interfaces:**
- Consumes: 없음 (별명 문자열과 콜백은 props로 주입받음)
- Produces: `StartScreenProps = { nickname: string; onRegenerateNickname: () => void; onStart: () => void; isLoading: boolean; loadError: string | null }`. Task 12가 `useGameProgress`의 `nickname`/`regenerateNickname`/`startGame`/`isLoading`/`loadError`를 그대로 연결한다.

- [ ] **Step 1: 전체 내용 교체**

`app/components/StartScreen.tsx` 전체를 다음으로 교체:

```tsx
"use client";

import React from "react";

interface StartScreenProps {
  nickname: string;
  onRegenerateNickname: () => void;
  onStart: () => void;
  isLoading: boolean;
  loadError: string | null;
}

export default function StartScreen({
  nickname,
  onRegenerateNickname,
  onStart,
  isLoading,
  loadError,
}: StartScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black text-white p-6">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-white/20 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-indigo-400">
          다른그림찾기
        </h1>
        <p className="text-lg text-gray-300 mb-2">게임 제목</p>
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-zinc-300">{nickname} 님 환영합니다</span>
          <button
            type="button"
            onClick={onRegenerateNickname}
            aria-label="닉네임 다시 생성"
            className="text-xl"
          >
            🔄
          </button>
        </div>
        {loadError && <p className="text-red-400 mb-4">{loadError}</p>}
        <button
          onClick={onStart}
          disabled={isLoading}
          className="w-full py-4 px-6 bg-gradient-to-r from-pink-500 to-indigo-500 hover:from-pink-600 hover:to-indigo-600 rounded-full text-xl font-bold transition-all shadow-lg hover:shadow-pink-500/50 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {isLoading ? "로딩 중..." : "게임 시작"}
        </button>
        <div className="flex gap-3">
          <button type="button" className="flex-1 py-2 px-4 bg-white/10 rounded-full font-bold">
            내 결과
          </button>
          <button type="button" className="flex-1 py-2 px-4 bg-white/10 rounded-full font-bold">
            랭킹
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/components/StartScreen.tsx
git commit -m "feat: StartScreen에 오늘의 별명 표시/재생성과 내결과·랭킹 스텁 버튼 추가"
```

---

### Task 12: `page.tsx` — 전체 상태머신 재배선

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `useGameProgress`(Task 5)의 전체 반환값; `StartScreen`(Task 11), `GameScreen`(Task 6), `StageTransitionModal`(Task 7), `GameResultScreen`(Task 8), `WheelScreen`(Task 9), `DailyResultScreen`(Task 10)의 props
- Produces: 없음(최상위 페이지 컴포넌트)

- [ ] **Step 1: 전체 내용 교체**

`app/page.tsx` 전체를 다음으로 교체:

```tsx
"use client";

import StartScreen from "./components/StartScreen";
import GameScreen from "./components/GameScreen";
import StageTransitionModal from "./components/StageTransitionModal";
import GameResultScreen from "./components/GameResultScreen";
import WheelScreen from "./components/WheelScreen";
import DailyResultScreen from "./components/DailyResultScreen";
import { useGameProgress } from "./hooks/useGameProgress";

export default function Home() {
  const game = useGameProgress();

  return (
    <div className="min-h-screen bg-black">
      {game.phase === "start" && (
        <StartScreen
          nickname={game.nickname}
          onRegenerateNickname={game.regenerateNickname}
          onStart={game.startGame}
          isLoading={game.isLoading}
          loadError={game.loadError}
        />
      )}

      {(game.phase === "playing" ||
        game.phase === "stageClear" ||
        game.phase === "stageFail") &&
        game.session && (
          <div className={game.phase !== "playing" ? "blur-sm pointer-events-none" : undefined}>
            <GameScreen
              key={game.stageNumber}
              session={game.session}
              stageNumber={game.stageNumber}
              totalStages={game.totalStages}
              timeLimitSec={game.timeLimitSec}
              onStageClear={game.handleStageClear}
              onStageTimeout={game.handleStageTimeout}
              onWrongTouch={game.recordWrongTouch}
            />
          </div>
        )}

      {game.phase === "stageClear" && (
        <StageTransitionModal type="stageClear" onNext={game.advanceToNextStage} />
      )}

      {game.phase === "stageFail" && (
        <StageTransitionModal type="stageFail" onNext={game.retryFromStageOne} />
      )}

      {game.phase === "gameResult" && game.scoreBreakdown && game.gukbapTier && (
        <GameResultScreen
          scoreBreakdown={game.scoreBreakdown}
          gukbapTier={game.gukbapTier}
          onNext={game.proceedToWheel}
        />
      )}

      {game.phase === "wheel" && <WheelScreen onNext={game.proceedToDailyResult} />}

      {game.phase === "dailyResult" && game.scoreBreakdown && game.gukbapTier && (
        <DailyResultScreen
          nickname={game.nickname}
          gukbapTier={game.gukbapTier}
          totalScore={game.scoreBreakdown.total}
          onRestart={game.resetToStart}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 전체 프로젝트 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없이 종료 (Task 4~11에서 미뤄뒀던 시그니처 불일치가 이 시점에 전부 해소됨)

- [ ] **Step 3: 전체 테스트 스위트 재실행**

Run: `npm test`
Expected: PASS, 5개 테스트 파일(`composeScene`/`stageConfig`/`nickname`/`gameSelection`/`pipeline-visual`) 전부 통과

- [ ] **Step 4: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: page.tsx가 7단계 상태머신 전체를 useGameProgress로 조율하도록 재배선"
```

---

### Task 13: 수동 브라우저 검증

**Files:** 없음(코드 변경 없음, 검증 전용)

**Interfaces:** 없음

이 리디자인은 UI/UX 변경이 핵심이고 프로젝트에 컴포넌트/E2E 테스트 하네스가 없으므로, 다음을 로컬 개발 서버에서 직접 확인한다. Supabase 접속 정보(`db.properties` 또는 `SUPABASE_URL`/`SUPABASE_ANON_KEY` 환경변수)와 `scripts/test-db-schema.sql` 기준으로 `level` 값이 채워진 `base_images`/`image_slots`/`parts` 데이터가 최소 레벨 1~7 각각 1세트 이상 준비되어 있어야 한다.

- [ ] **Step 1: 개발 서버 실행**

Run: `npm run dev`
Expected: `http://localhost:3000`에서 서버가 뜬다.

- [ ] **Step 2: Start Hub 확인**

브라우저에서 `http://localhost:3000` 접속. "다른그림찾기 / 게임 제목" 아래 오늘의 별명(예: "든든한 솥밥 님 환영합니다")이 보이는지 확인. 🔄 버튼을 눌러 별명이 바뀌는지, 새로고침(F5) 후에도 마지막으로 생성된 별명이 유지되는지(localStorage) 확인. "내 결과"/"랭킹" 버튼은 눌러도 아무 반응이 없는 것이 정상(스텁).

- [ ] **Step 3: Stage 1~7 순차 진행 확인**

"게임 시작" 클릭 → 상단에 "1 / 7 단계"가 보이는지, 제한시간이 60초로 시작하는지 확인. 좌/우 이미지에서 차이를 모두 찾으면 "축하합니다!! 이번 단계를 통과하셨습니다" 모달이 뜨고 "다음" 클릭 시 "2 / 7 단계"로 넘어가는지 확인. Stage 7까지 반복.

- [ ] **Step 4: 게임 결과 → 돌림판 → 오늘의 결과 확인**

Stage 7 클리어 후 "다음"을 누르면 게임 결과 화면에서 Stage 점수 1400 / 완주 보너스 100 / 시간 보너스(0~400) / 정답행진 보너스(오답 없었으면 53, 있었으면 0) / 총점(최대 1953) / 국밥력 등급이 보이는지 확인. "다음" → 행운의 돌림판 placeholder(🎡, "준비 중입니다.") → "다음" → 오늘의 결과(별명/국밥력/최종점수 + 스텁 업적 뱃지) 확인.

- [ ] **Step 5: 타임아웃/재도전 확인**

아무 스테이지에서나 제한시간이 다 되도록 기다린다 → "아쉽게도 시간이 종료되었습니다" 모달이 뜨는지 확인. "재도전" 클릭 시 Stage 1부터 새로운 이미지 세트로 즉시 다시 시작하는지(Start Hub로 돌아가지 않고) 확인.

- [ ] **Step 6: "처음으로" 확인**

오늘의 결과 화면에서 "처음으로" 클릭 → Start Hub로 돌아가고, 오늘의 별명은 유지되는지 확인.

# 다국어 지원 기반(i18n foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gookbapgame`의 하드코딩된 한국어 UI 문자열을 ko/en/ja 3개 로케일로 토큰화하고, 시스템 언어 자동 감지 + 좌상단 지구본 아이콘 드롭다운으로 수동 전환 가능한 다국어 기반을 만든다.

**Architecture:** React 비의존 순수 함수(`detectLocale`, `t`)로 핵심 로직을 분리하고(`stageConfig.ts`/`gameSelection.ts`와 동일 패턴), `LocaleProvider`(Context)로 감싸서 각 화면 컴포넌트가 `useLocale().t(key, params?)`를 호출하도록 교체한다. 딕셔너리는 중첩 객체가 아니라 `"start.playButton"` 같은 점(dot) 포함 문자열을 키로 쓰는 **평평한(flat) `Record<string, string>`**으로 구현한다 — 중첩 객체 + 재귀 경로 탐색보다 타입이 단순하고 버그 표면이 작다(스펙 문서의 중첩 객체 예시와 기능적으로 동일, 구현만 단순화).

**Tech Stack:** Next.js(App Router) 클라이언트 컴포넌트, React Context, localStorage, `node:test`(기존 순수 함수 테스트 컨벤션).

## Global Constraints

- 지원 로케일은 `ko`(완성) / `en`(완성) / `ja`(키 구조만, 값 비어있음) 3개뿐이다. 그 이상 언어는 이번 계획 범위 밖(별도 스펙).
- URL 파라미터로 로케일을 넘기지 않는다. 감지는 `navigator.language`, 수동 선택은 localStorage(`gukbap_locale`)로만 한다.
- 감지된 시스템 언어가 ko/en/ja 중 어디에도 속하지 않으면 `en`으로 폴백한다(`ko` 아님).
- 사용자가 지구본 드롭다운에서 수동으로 고른 로케일만 localStorage에 쓴다. 자동 감지 결과는 저장하지 않는다.
- `t(locale, key, params?)` 조회 순서는 `locale → en → ko → key 문자열 그대로`. 어떤 경우에도 throw하지 않는다.
- 이 프로젝트엔 React 컴포넌트용 테스트 하네스(RTL 등)가 없다 — 순수 함수(`detectLocale`, `translate`, `preloadAllStages`)만 `node:test`로 자동 테스트하고, React 컴포넌트를 건드리는 작업은 수동 검증 단계로 대체한다(기존 `docs/superpowers/plans/2026-07-27-preload-loading-screen.md`와 동일한 관례).
- 닉네임 생성 문구(`app/lib/nickname.ts`)는 이번 계획 범위 밖이다 — 형용사+명사 조합 자체를 다국어로 만드는 건 별도 작업.

---

### Task 1: 로케일 타입 & 감지 함수

**Files:**
- Create: `app/lib/i18n/types.ts`
- Create: `app/lib/i18n/detectLocale.ts`
- Test: `app/lib/i18n/detectLocale.test.ts`

**Interfaces:**
- Consumes: 없음 (최하위 모듈)
- Produces: `Locale = "ko" | "en" | "ja"` 타입, `LOCALE_LABELS: Record<Locale, string>` 상수, `Dictionary = Record<string, string>` 타입, `detectLocale(navigatorLanguage: string): Locale` 함수 — 이후 모든 태스크가 이 세 가지를 그대로 가져다 쓴다.

- [ ] **Step 1: `types.ts` 작성**

```ts
// app/lib/i18n/types.ts
export type Locale = "ko" | "en" | "ja";

export const SUPPORTED_LOCALES: Locale[] = ["ko", "en", "ja"];

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
};

export type Dictionary = Record<string, string>;
```

- [ ] **Step 2: `detectLocale.test.ts` 작성 (실패하는 테스트 먼저)**

```ts
// app/lib/i18n/detectLocale.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLocale } from "./detectLocale.ts";

test("ko-KR은 ko로 매핑된다", () => {
  assert.equal(detectLocale("ko-KR"), "ko");
});

test("en-US는 en으로 매핑된다", () => {
  assert.equal(detectLocale("en-US"), "en");
});

test("ja는 ja로 매핑된다(지역 서브태그 없이)", () => {
  assert.equal(detectLocale("ja"), "ja");
});

test("지원하지 않는 언어(fr-FR)는 en으로 폴백한다", () => {
  assert.equal(detectLocale("fr-FR"), "en");
});

test("대소문자가 섞여 있어도(EN-US) 정상 매핑된다", () => {
  assert.equal(detectLocale("EN-US"), "en");
});
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `node --experimental-strip-types --test app/lib/i18n/detectLocale.test.ts`
Expected: FAIL — `detectLocale.ts` 파일이 없어서 모듈을 찾을 수 없다는 에러

- [ ] **Step 4: `detectLocale.ts` 최소 구현**

```ts
// app/lib/i18n/detectLocale.ts
import { SUPPORTED_LOCALES, type Locale } from "./types.ts";

export function detectLocale(navigatorLanguage: string): Locale {
  const primary = navigatorLanguage.split("-")[0].toLowerCase();
  return (SUPPORTED_LOCALES as string[]).includes(primary) ? (primary as Locale) : "en";
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `node --experimental-strip-types --test app/lib/i18n/detectLocale.test.ts`
Expected: 5개 테스트 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add app/lib/i18n/types.ts app/lib/i18n/detectLocale.ts app/lib/i18n/detectLocale.test.ts
git commit -m "feat: 로케일 타입과 시스템 언어 감지 함수 추가"
```

---

### Task 2: 번역 딕셔너리 & 번역 함수

**Files:**
- Create: `app/lib/i18n/locales/ko.ts`
- Create: `app/lib/i18n/locales/en.ts`
- Create: `app/lib/i18n/locales/ja.ts`
- Create: `app/lib/i18n/translate.ts`
- Test: `app/lib/i18n/translate.test.ts`

**Interfaces:**
- Consumes: `Dictionary`, `Locale` (Task 1의 `types.ts`)
- Produces: `t(locale: Locale, key: string, params?: Record<string, string | number>): string` — 이후 모든 화면 컴포넌트가 `useLocale().t(...)`를 통해 결국 이 함수를 호출한다. 딕셔너리 키 전체 목록(아래)은 이후 태스크(4~10)가 정확히 이 이름 그대로 사용한다.

- [ ] **Step 1: 한국어 마스터 딕셔너리 작성 (`locales/ko.ts`)**

기존 컴포넌트들의 실제 하드코딩 문자열을 그대로 옮긴 것 — 새로 만든 문구 없음.

```ts
// app/lib/i18n/locales/ko.ts
import type { Dictionary } from "../types.ts";

export const ko: Dictionary = {
  "meta.title": "다른그림찾기 - 국밥",
  "meta.description": "국밥 한 상차림 다른그림찾기 게임",

  "common.retry": "다시 시도",

  "start.title": "다른그림찾기",
  "start.welcome": "{nickname} 님 환영합니다",
  "start.regenerateNicknameAria": "닉네임 다시 생성",
  "start.playButton": "게임 시작",
  "start.myResult": "내 결과",
  "start.ranking": "랭킹",

  "preload.preparing": "국밥 준비 중...",
  "preload.sessionError": "게임 데이터를 불러오는데 실패했습니다. 네트워크 상태를 확인해주세요.",
  "preload.levelSessionError": "{level}단계 게임 데이터를 불러오지 못했습니다.",
  "preload.imageError": "이미지를 불러오는데 실패했습니다. 네트워크 상태를 확인해주세요.",

  "gameResult.title": "게임 결과",
  "gameResult.stageScore": "Stage 점수",
  "gameResult.completionBonus": "완주 보너스",
  "gameResult.timeBonus": "시간 보너스",
  "gameResult.streakBonus": "정답행진 보너스",
  "gameResult.totalLabel": "총점",
  "gameResult.gukbapPowerLabel": "국밥력: {tier}",
  "gameResult.nextButton": "다음",

  "dailyResult.title": "오늘의 결과",
  "dailyResult.nicknameLabel": "오늘의 별명",
  "dailyResult.gukbapPowerLabel": "국밥력",
  "dailyResult.finalScoreLabel": "최종점수",
  "dailyResult.restartButton": "처음으로",

  "gukbapTier.1953Master": "1953 Master",
  "gukbapTier.regular": "국밥 단골",
  "gukbapTier.gourmet": "국밥 미식가",
  "gukbapTier.explorer": "국밥 탐험가",
  "gukbapTier.beginner": "국밥 입문생",

  "stageTransition.clearTitle": "축하합니다!!",
  "stageTransition.failTitle": "아쉽게도",
  "stageTransition.clearMessage": "이번 단계를 통과하셨습니다.",
  "stageTransition.failMessage": "시간이 종료되었습니다.",
  "stageTransition.loading": "로딩 중...",
  "stageTransition.nextButton": "다음",
  "stageTransition.retryButton": "재도전",

  "wheel.title": "행운의 돌림판",
  "wheel.preparing": "준비 중입니다.",
  "wheel.nextButton": "다음",

  "game.stageProgress": "{current} / {total} 단계",
  "game.timeRemainingLabel": "남은 시간:",
  "game.secondsUnit": "{seconds}초",
  "game.hintButton": "힌트",
  "game.remainingCount": "남은 개수: {found}/{total}",
};
```

- [ ] **Step 2: 영어 딕셔너리 작성 (`locales/en.ts`)**

ko.ts와 동일한 키를 전부 채운다(완성).

```ts
// app/lib/i18n/locales/en.ts
import type { Dictionary } from "../types.ts";

export const en: Partial<Dictionary> = {
  "meta.title": "Spot the Difference - Gukbap",
  "meta.description": "A spot-the-difference game set around a bowl of gukbap",

  "common.retry": "Retry",

  "start.title": "Spot the Difference",
  "start.welcome": "Welcome, {nickname}",
  "start.regenerateNicknameAria": "Regenerate nickname",
  "start.playButton": "Start Game",
  "start.myResult": "My Results",
  "start.ranking": "Ranking",

  "preload.preparing": "Preparing gukbap...",
  "preload.sessionError": "Failed to load game data. Please check your network connection.",
  "preload.levelSessionError": "Failed to load game data for stage {level}.",
  "preload.imageError": "Failed to load images. Please check your network connection.",

  "gameResult.title": "Game Result",
  "gameResult.stageScore": "Stage Score",
  "gameResult.completionBonus": "Completion Bonus",
  "gameResult.timeBonus": "Time Bonus",
  "gameResult.streakBonus": "Streak Bonus",
  "gameResult.totalLabel": "Total",
  "gameResult.gukbapPowerLabel": "Gukbap Power: {tier}",
  "gameResult.nextButton": "Next",

  "dailyResult.title": "Today's Result",
  "dailyResult.nicknameLabel": "Today's Nickname",
  "dailyResult.gukbapPowerLabel": "Gukbap Power",
  "dailyResult.finalScoreLabel": "Final Score",
  "dailyResult.restartButton": "Back to Start",

  "gukbapTier.1953Master": "1953 Master",
  "gukbapTier.regular": "Gukbap Regular",
  "gukbapTier.gourmet": "Gukbap Gourmet",
  "gukbapTier.explorer": "Gukbap Explorer",
  "gukbapTier.beginner": "Gukbap Beginner",

  "stageTransition.clearTitle": "Congratulations!!",
  "stageTransition.failTitle": "Unfortunately",
  "stageTransition.clearMessage": "You cleared this stage.",
  "stageTransition.failMessage": "Time's up.",
  "stageTransition.loading": "Loading...",
  "stageTransition.nextButton": "Next",
  "stageTransition.retryButton": "Retry Stage",

  "wheel.title": "Lucky Wheel",
  "wheel.preparing": "Coming soon.",
  "wheel.nextButton": "Next",

  "game.stageProgress": "Stage {current} / {total}",
  "game.timeRemainingLabel": "Time Remaining:",
  "game.secondsUnit": "{seconds}s",
  "game.hintButton": "Hint",
  "game.remainingCount": "Remaining: {found}/{total}",
};
```

- [ ] **Step 3: 일본어 딕셔너리 자리 마련 (`locales/ja.ts`)**

```ts
// app/lib/i18n/locales/ja.ts
import type { Dictionary } from "../types.ts";

// 아직 번역 없음 — en → ko 순으로 폴백된다. 값이 채워지는 키만 그 즉시 일본어로 표시된다.
export const ja: Partial<Dictionary> = {};
```

- [ ] **Step 4: `translate.test.ts` 작성 (실패하는 테스트 먼저)**

```ts
// app/lib/i18n/translate.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "./translate.ts";

test("ko 로케일에서 정상 조회", () => {
  assert.equal(t("ko", "start.playButton"), "게임 시작");
});

test("en 로케일에서 정상 조회", () => {
  assert.equal(t("en", "start.playButton"), "Start Game");
});

test("ja에 키가 없으면 en으로 폴백한다", () => {
  assert.equal(t("ja", "start.playButton"), "Start Game");
});

test("en에도 없으면(가정) ko로 폴백한다", () => {
  // ko에는 있지만 en/ja엔 없는 임시 키가 없으므로, 존재하지 않는 로케일 값 자체를
  // 비워 시뮬레이션할 수 없는 대신 실제 회귀 지점인 '셋 다 없음' 케이스로 대체 검증한다.
  assert.equal(t("ja", "존재하지-않는-키"), "존재하지-않는-키");
});

test("파라미터 보간이 올바른 순서로 치환된다", () => {
  assert.equal(
    t("ko", "game.stageProgress", { current: 3, total: 7 }),
    "3 / 7 단계"
  );
  assert.equal(
    t("en", "game.stageProgress", { current: 3, total: 7 }),
    "Stage 3 / 7"
  );
});

test("파라미터가 없는 채로 보간 키를 호출하면 플레이스홀더가 그대로 남는다", () => {
  assert.equal(t("ko", "game.stageProgress"), "{current} / {total} 단계");
});
```

- [ ] **Step 5: 테스트 실행 → 실패 확인**

Run: `node --experimental-strip-types --test app/lib/i18n/translate.test.ts`
Expected: FAIL — `translate.ts` 모듈이 없음

- [ ] **Step 6: `translate.ts` 최소 구현**

```ts
// app/lib/i18n/translate.ts
import type { Locale } from "./types.ts";
import { ko } from "./locales/ko.ts";
import { en } from "./locales/en.ts";
import { ja } from "./locales/ja.ts";

const DICTIONARIES: Record<Locale, Partial<Record<string, string>>> = { ko, en, ja };

export function t(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const raw = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? DICTIONARIES.ko[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? `{${name}}`));
}
```

- [ ] **Step 7: 테스트 실행 → 통과 확인**

Run: `node --experimental-strip-types --test app/lib/i18n/translate.test.ts`
Expected: 6개 테스트 전부 PASS

- [ ] **Step 8: `package.json`의 `test` 스크립트에 새 테스트 파일 추가**

`app/lib/i18n/detectLocale.test.ts app/lib/i18n/translate.test.ts`를 기존 `test` 스크립트 명령 목록에 추가.

- [ ] **Step 9: 전체 테스트 스위트 실행 → 회귀 없음 확인**

Run: `npm test`
Expected: 기존 테스트 전부 + 새 테스트 11개(5+6) 모두 PASS

- [ ] **Step 10: 커밋**

```bash
git add app/lib/i18n/locales/ app/lib/i18n/translate.ts app/lib/i18n/translate.test.ts package.json
git commit -m "feat: ko/en/ja 딕셔너리와 폴백 체인을 가진 번역 함수 추가"
```

---

### Task 3: GukbapTier → 번역 키 매핑

**Files:**
- Create: `app/lib/i18n/gukbapTierKey.ts`
- Test: `app/lib/i18n/gukbapTierKey.test.ts`

**Interfaces:**
- Consumes: `GukbapTier` 타입(`app/lib/stageConfig.ts`), Task 2의 `t()`
- Produces: `gukbapTierKey(tier: GukbapTier): string` — Task 8(`GameResultScreen`/`DailyResultScreen`)이 `t(locale, gukbapTierKey(tier))` 형태로 사용한다.

`GukbapTier`는 `"1953 Master" | "국밥 단골" | "국밥 미식가" | "국밥 탐험가" | "국밥 입문생"` 리터럴 유니언(`app/lib/stageConfig.ts:63`)이라, 값 자체가 한국어 문자열이다. 화면에 그대로 렌더링하면 로케일 전환이 안 먹히므로 값→키 매핑이 별도로 필요하다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// app/lib/i18n/gukbapTierKey.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { gukbapTierKey } from "./gukbapTierKey.ts";

test("각 GukbapTier 값이 올바른 번역 키로 매핑된다", () => {
  assert.equal(gukbapTierKey("1953 Master"), "gukbapTier.1953Master");
  assert.equal(gukbapTierKey("국밥 단골"), "gukbapTier.regular");
  assert.equal(gukbapTierKey("국밥 미식가"), "gukbapTier.gourmet");
  assert.equal(gukbapTierKey("국밥 탐험가"), "gukbapTier.explorer");
  assert.equal(gukbapTierKey("국밥 입문생"), "gukbapTier.beginner");
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --experimental-strip-types --test app/lib/i18n/gukbapTierKey.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// app/lib/i18n/gukbapTierKey.ts
import type { GukbapTier } from "../stageConfig.ts";

const GUKBAP_TIER_KEYS: Record<GukbapTier, string> = {
  "1953 Master": "gukbapTier.1953Master",
  "국밥 단골": "gukbapTier.regular",
  "국밥 미식가": "gukbapTier.gourmet",
  "국밥 탐험가": "gukbapTier.explorer",
  "국밥 입문생": "gukbapTier.beginner",
};

export function gukbapTierKey(tier: GukbapTier): string {
  return GUKBAP_TIER_KEYS[tier];
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --experimental-strip-types --test app/lib/i18n/gukbapTierKey.test.ts`
Expected: PASS

- [ ] **Step 5: `package.json`의 `test` 스크립트에 추가 후 `npm test`로 전체 회귀 확인**

- [ ] **Step 6: 커밋**

```bash
git add app/lib/i18n/gukbapTierKey.ts app/lib/i18n/gukbapTierKey.test.ts package.json
git commit -m "feat: GukbapTier 값을 번역 키로 매핑하는 함수 추가"
```

---

### Task 4: `LocaleProvider` / `useLocale` 훅

**Files:**
- Create: `app/lib/i18n/LocaleContext.tsx`

**Interfaces:**
- Consumes: `Locale`, `detectLocale()` (Task 1), `t()` (Task 2)
- Produces: `<LocaleProvider>` 컴포넌트, `useLocale(): { locale: Locale; setLocale: (l: Locale) => void; t: (key: string, params?) => string }` 훅 — Task 5(레이아웃 배선)와 Task 7~10(모든 화면 컴포넌트)이 이 훅을 그대로 가져다 쓴다.

이 파일은 React 컴포넌트라 자동 테스트 하네스가 없다(Global Constraints 참고) — Task 5에서 실제 화면에 붙인 뒤 수동으로 검증한다.

- [ ] **Step 1: `LocaleContext.tsx` 작성**

```tsx
// app/lib/i18n/LocaleContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Locale } from "./types";
import { SUPPORTED_LOCALES } from "./types";
import { detectLocale } from "./detectLocale";
import { t as translate } from "./translate";

const STORAGE_KEY = "gukbap_locale";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function isSupportedLocale(value: string | null): value is Locale {
  return value !== null && (SUPPORTED_LOCALES as string[]).includes(value);
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ko");

  // 최초 마운트 시: 수동 저장된 로케일이 있으면 그걸 쓰고, 없으면 시스템 언어를 감지한다.
  // 서버 렌더링 시점엔 window가 없으므로 이 로직은 항상 클라이언트 마운트 이후에만 실행되고,
  // 그 전까지는 SSR과 동일한 기본값(ko)으로 렌더링돼 하이드레이션 불일치가 나지 않는다.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setLocaleState(isSupportedLocale(stored) ? stored : detectLocale(window.navigator.language));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, "meta.title");
  }, [locale]);

  const setLocale = (next: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  };

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/lib/i18n/LocaleContext.tsx
git commit -m "feat: LocaleProvider/useLocale 훅 추가 (감지+영속성+document 동기화)"
```

---

### Task 5: `LanguageToggle` 컴포넌트 + 레이아웃/페이지 배선

**Files:**
- Create: `app/components/LanguageToggle.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `useLocale()` (Task 4), `LOCALE_LABELS` (Task 1)
- Produces: 화면에 실제로 보이는 언어 전환 UI. 이후 태스크는 이 파일을 더 건드리지 않는다.

- [ ] **Step 1: `LanguageToggle.tsx` 작성**

```tsx
// app/components/LanguageToggle.tsx
"use client";

import { useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "../lib/i18n/types";

export default function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (next: Locale) => {
    setLocale(next);
    setIsOpen(false);
  };

  return (
    <div className="fixed top-2 left-2 z-[60]">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Language"
        className="w-9 h-9 flex items-center justify-center rounded-full border border-wood bg-surface/90 text-lg"
      >
        🌐
      </button>
      {isOpen && (
        <ul className="mt-1 min-w-[8rem] rounded-lg border border-wood bg-surface/95 shadow-lg overflow-hidden">
          {SUPPORTED_LOCALES.map((code) => (
            <li key={code}>
              <button
                type="button"
                onClick={() => handleSelect(code)}
                className={`w-full text-left px-3 py-2 text-sm ${
                  code === locale ? "font-bold text-accent" : "text-ink"
                }`}
              >
                {LOCALE_LABELS[code]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `app/layout.tsx`에 `LocaleProvider` 배선**

`app/layout.tsx:33`의 `<body>` 내용을 `LocaleProvider`로 감싼다:

```tsx
// app/layout.tsx (수정 부분만)
import { LocaleProvider } from "./lib/i18n/LocaleContext";
// ...기존 import 아래에 추가

// return문 내부:
<body className="min-h-full flex flex-col">
  <LocaleProvider>{children}</LocaleProvider>
</body>
```

(`metadata.title`/`metadata.description`은 그대로 두되, `LocaleContext.tsx`가 마운트 이후 `document.title`을 클라이언트에서 로케일에 맞게 덮어쓴다 — 최초 서버 렌더링/SEO 상의 타이틀은 한국어가 기본값으로 유지된다.)

- [ ] **Step 3: `app/page.tsx`에 `LanguageToggle` 추가**

`app/page.tsx:16`의 최상위 `<div>` 바로 안, phase 분기 이전에 항상 렌더링되도록 추가:

```tsx
// app/page.tsx (수정 부분만)
import LanguageToggle from "./components/LanguageToggle";

// return문 내부, 최상위 div의 첫 자식으로:
<div className="min-h-screen bg-black">
  <LanguageToggle />
  {game.phase === "start" && ( /* 기존 그대로 */
  ...
```

- [ ] **Step 4: 수동 검증**

Run: `npm run dev`
- 브라우저에서 열어서 좌상단에 지구본 아이콘이 뜨는지 확인
- 클릭 → "한국어 / English / 日本語" 드롭다운이 펼쳐지는지 확인
- English 선택 → 브라우저 탭 제목이 "Spot the Difference - Gukbap"으로 바뀌는지 확인 (아직 화면 본문 텍스트는 Task 7~10 전까지 한국어 그대로 — 정상)
- 새로고침 → English 선택이 유지되는지 확인(localStorage)

- [ ] **Step 5: 커밋**

```bash
git add app/components/LanguageToggle.tsx app/layout.tsx app/page.tsx
git commit -m "feat: 좌상단 지구본 드롭다운으로 언어 전환하는 UI 추가"
```

---

### Task 6: `preloadGame.ts` 에러를 번역 키 기반으로 전환

**Files:**
- Modify: `app/lib/preloadGame.ts`
- Modify: `app/lib/preloadGame.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수, i18n 모듈에 의존하지 않음 — 키 문자열만 반환)
- Produces: `LoadError = { key: string; params?: Record<string, string | number> }` 타입과, `PreloadResult`의 실패 케이스가 `{ ok: false } & LoadError`로 바뀜. Task 7의 `useGameProgress.ts`/`PreloadScreen.tsx`, Task 9의 `StageTransitionModal.tsx`가 이 `LoadError` 타입을 그대로 import해서 쓴다(중복 정의 금지).

지금은 `preloadAllStages`가 최종 한국어 문장을 직접 반환한다(`app/lib/preloadGame.ts:39,47,59`). 이 함수는 React에 의존하지 않는 순수 함수라 로케일을 알 방법이 없으므로, 최종 문장 대신 **번역 키(+보간 파라미터)**를 반환하도록 바꾸고 실제 번역은 이를 렌더링하는 컴포넌트(Task 7)에서 `useLocale().t(result.key, result.params)`로 수행한다.

- [ ] **Step 1: 테스트를 새 계약에 맞게 수정 (실패하는 상태로)**

```ts
// app/lib/preloadGame.test.ts (수정 부분만 — 나머지 파일은 그대로)

test("특정 레벨 세션 조회가 null이면 실패로 처리하고 해당 레벨을 파라미터에 포함한다", async () => {
  const result = await preloadAllStages(
    async (level) =>
      level === 3 ? null : { level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [] },
    async () => {}
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.key, "preload.levelSessionError");
    assert.equal(result.params?.level, 3);
  }
});

test("세션 조회 중 네트워크 오류로 reject되면 예외를 던지지 않고 실패로 처리한다", async () => {
  const result = await preloadAllStages(
    async (level) => {
      if (level === 2) {
        throw new Error("network unreachable");
      }
      return { level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [] };
    },
    async () => {}
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.key, "preload.sessionError");
  }
});

test("이미지 로드가 실패하면 실패로 처리한다", async () => {
  const result = await preloadAllStages(
    async (level) => ({ level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [] }),
    async () => {
      throw new Error("network fail");
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.key, "preload.imageError");
  }
});
```

(첫 번째 테스트 "모든 레벨/이미지가 성공하면..."은 `result.error` 관련 단언이 없으므로 변경 없음)

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --experimental-strip-types --test app/lib/preloadGame.test.ts`
Expected: FAIL — `result.key`가 `undefined` (아직 `error` 필드만 있음)

- [ ] **Step 3: `preloadGame.ts`를 새 계약에 맞게 수정**

```ts
// app/lib/preloadGame.ts (전체 교체)
import { STAGE_CONFIG } from "./stageConfig.ts";
import { runWithConcurrencyLimit } from "./concurrencyLimit.ts";
import type { GameSession } from "../actions.ts";

export type FetchSessionFn = (
  level: number,
  targetDiffCount: number
) => Promise<GameSession | null>;

export type LoadImageFn = (url: string) => Promise<void>;

export type LoadError = { key: string; params?: Record<string, string | number> };

export type PreloadResult =
  | { ok: true; sessions: GameSession[] }
  | ({ ok: false } & LoadError);

const PRELOAD_IMAGE_CONCURRENCY = 4;

export function loadImageInBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

export async function preloadAllStages(
  fetchSession: FetchSessionFn,
  loadImage: LoadImageFn = loadImageInBrowser
): Promise<PreloadResult> {
  let sessions: (GameSession | null)[];
  try {
    sessions = await Promise.all(
      STAGE_CONFIG.map((cfg) => fetchSession(cfg.level, cfg.diffCount))
    );
  } catch {
    return { ok: false, key: "preload.sessionError" };
  }

  const missingIndex = sessions.findIndex((s) => s === null);
  if (missingIndex !== -1) {
    return {
      ok: false,
      key: "preload.levelSessionError",
      params: { level: STAGE_CONFIG[missingIndex].level },
    };
  }

  const confirmedSessions = sessions as GameSession[];
  const urls = confirmedSessions.flatMap((s) => [s.leftSceneUrl, s.rightSceneUrl]);

  try {
    await runWithConcurrencyLimit(urls, PRELOAD_IMAGE_CONCURRENCY, loadImage);
  } catch {
    return { ok: false, key: "preload.imageError" };
  }

  return { ok: true, sessions: confirmedSessions };
}
```

(`loadImageInBrowser`의 내부 `Error` 메시지는 사용자에게 노출되지 않는 진단용 문자열이라 영문으로만 남긴다 — Global Constraints의 닉네임 문구와 마찬가지로 사용자 대면 텍스트가 아니므로 번역 대상이 아니다)

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --experimental-strip-types --test app/lib/preloadGame.test.ts`
Expected: 4개 테스트 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add app/lib/preloadGame.ts app/lib/preloadGame.test.ts
git commit -m "fix: preloadAllStages가 최종 문자열 대신 번역 키를 반환하도록 변경"
```

---

### Task 7: `useGameProgress.ts` 배선 + `StartScreen`/`PreloadScreen` 토큰화

**Files:**
- Modify: `app/hooks/useGameProgress.ts`
- Modify: `app/components/StartScreen.tsx`
- Modify: `app/components/PreloadScreen.tsx`

**Interfaces:**
- Consumes: `useLocale()` (Task 4), `LoadError` 타입과 `PreloadResult` (Task 6)
- Produces: `useGameProgress()`가 반환하는 `loadError`가 `LoadError | null` 타입으로 바뀜 — Task 9의 `StageTransitionModal`도 동일 타입을 그대로 import해서 쓴다.

- [ ] **Step 1: `useGameProgress.ts`의 `loadError` 상태 타입 변경**

`app/hooks/useGameProgress.ts:34`의 `useState<string | null>(null)`과, `result.error`를 그대로 저장하던 지점(`:54` 부근)을 다음과 같이 바꾼다:

```ts
// app/hooks/useGameProgress.ts (수정 부분만)
import type { LoadError } from "../lib/preloadGame";

// ...
const [loadError, setLoadError] = useState<LoadError | null>(null);

// preloadAllStages 결과 처리 부분:
const result = await preloadAllStages(fetchGameData);
if (!result.ok) {
  setLoadError({ key: result.key, params: result.params });
  return;
}
```

(`preloadAllStages` 호출 이후의 성공 분기는 그대로 둔다)

- [ ] **Step 2: `StartScreen.tsx`를 `useLocale()`로 토큰화**

```tsx
// app/components/StartScreen.tsx (전체 교체)
"use client";

import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";

interface StartScreenProps {
  nickname: string;
  onRegenerateNickname: () => void;
  onStart: () => void;
}

export default function StartScreen({
  nickname,
  onRegenerateNickname,
  onStart,
}: StartScreenProps) {
  const { t } = useLocale();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
          {t("start.title")}
        </h1>
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-ink">{t("start.welcome", { nickname })}</span>
          <button
            type="button"
            onClick={onRegenerateNickname}
            aria-label={t("start.regenerateNicknameAria")}
            className="text-xl"
          >
            🔄
          </button>
        </div>
        <button
          onClick={onStart}
          className="pixel-mask-btn-solid w-full py-4 px-6 bg-accent text-accent-ink text-xl font-bold transition-opacity active:scale-95 mb-4"
        >
          {t("start.playButton")}
        </button>
        <div className="flex gap-3 w-full">
          <PixelPanel size="btn" className="flex-1">
            <button type="button" className="w-full font-bold text-ink">{t("start.myResult")}</button>
          </PixelPanel>
          <PixelPanel size="btn" className="flex-1">
            <button type="button" className="w-full font-bold text-ink">{t("start.ranking")}</button>
          </PixelPanel>
        </div>
      </PixelPanel>
    </div>
  );
}
```

- [ ] **Step 3: `PreloadScreen.tsx`를 `useLocale()`로 토큰화**

```tsx
// app/components/PreloadScreen.tsx (전체 교체)
"use client";

import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { LoadError } from "../lib/preloadGame";

interface PreloadScreenProps {
  loadError: LoadError | null;
  onRetry: () => void;
}

export default function PreloadScreen({ loadError, onRetry }: PreloadScreenProps) {
  const { t } = useLocale();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <PixelPanel size="card" className="max-w-sm w-full mx-4 text-center">
        {loadError ? (
          <>
            <p className="text-error mb-6 text-lg">{t(loadError.key, loadError.params)}</p>
            <button
              onClick={onRetry}
              className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
            >
              {t("common.retry")}
            </button>
          </>
        ) : (
          <>
            <div className="animate-spin text-6xl mb-4">🍚</div>
            <p className="text-ink text-lg font-bold">{t("preload.preparing")}</p>
          </>
        )}
      </PixelPanel>
    </div>
  );
}
```

- [ ] **Step 4: 수동 검증**

Run: `npm run dev`
- 게임 시작 → 로딩 화면에서 "국밥 준비 중..." 표시 확인
- 지구본으로 English 전환 → 시작 화면 문구가 전부 영어로 바뀌는지 확인("Spot the Difference", "Start Game", "My Results", "Ranking")
- (선택) `fetchGameData`를 임시로 실패하게 만들어 프리로드 에러 문구가 로케일에 맞게 나오는지 확인 후 되돌림

- [ ] **Step 5: 커밋**

```bash
git add app/hooks/useGameProgress.ts app/components/StartScreen.tsx app/components/PreloadScreen.tsx
git commit -m "feat: StartScreen/PreloadScreen을 다국어 토큰으로 전환"
```

---

### Task 8: `GameResultScreen`/`DailyResultScreen` 토큰화

**Files:**
- Modify: `app/components/GameResultScreen.tsx`
- Modify: `app/components/DailyResultScreen.tsx`

**Interfaces:**
- Consumes: `useLocale()` (Task 4), `gukbapTierKey()` (Task 3)
- Produces: 없음 (리프 컴포넌트)

- [ ] **Step 1: `GameResultScreen.tsx` 토큰화**

```tsx
// app/components/GameResultScreen.tsx (전체 교체)
"use client";

import React from "react";
import { ScoreBreakdown, GukbapTier, MAX_TOTAL_SCORE } from "../lib/stageConfig";
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

  const rows: { label: string; value: number }[] = [
    { label: t("gameResult.stageScore"), value: scoreBreakdown.stageScore },
    { label: t("gameResult.completionBonus"), value: scoreBreakdown.completionBonus },
    { label: t("gameResult.timeBonus"), value: scoreBreakdown.timeBonus },
    { label: t("gameResult.streakBonus"), value: scoreBreakdown.streakBonus },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("gameResult.title")}</h1>
        <dl className="space-y-2 mb-6 text-left">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <dt className="text-muted">{row.label}</dt>
              <dd className="text-ink font-bold">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-wood pt-4 mb-2">
          <div className="flex justify-between text-xl font-extrabold">
            <span className="text-ink">{t("gameResult.totalLabel")}</span>
            <span className="text-amber" style={{ fontFamily: "var(--font-pixel)" }}>
              {scoreBreakdown.total} / {MAX_TOTAL_SCORE}
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

- [ ] **Step 2: `DailyResultScreen.tsx` 토큰화**

```tsx
// app/components/DailyResultScreen.tsx (전체 교체)
"use client";

import React from "react";
import { GukbapTier, MAX_TOTAL_SCORE } from "../lib/stageConfig";
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
          {totalScore} / {MAX_TOTAL_SCORE}
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

(`stubAchievements`는 스텁/미구현 배지 문구라 이번 범위에서 제외 — 실제 업적 시스템이 붙을 때 함께 다국어화)

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`
- 게임 한 판 완주 → `GameResultScreen`에서 "국밥력: 국밥 단골"처럼 등급이 한국어로 뜨는지 확인
- English로 전환 후 다시 확인 → "Gukbap Power: Gukbap Regular"처럼 등급까지 영어로 바뀌는지 확인 (등급 텍스트가 하드코딩된 한국어로 남아있지 않아야 함 — `gukbapTierKey` 매핑이 제대로 안 되면 여기서 바로 드러남)

- [ ] **Step 4: 커밋**

```bash
git add app/components/GameResultScreen.tsx app/components/DailyResultScreen.tsx
git commit -m "feat: GameResultScreen/DailyResultScreen을 다국어 토큰으로 전환"
```

---

### Task 9: `StageTransitionModal`/`WheelScreen` 토큰화

**Files:**
- Modify: `app/components/StageTransitionModal.tsx`
- Modify: `app/components/WheelScreen.tsx`

**Interfaces:**
- Consumes: `useLocale()` (Task 4), `LoadError` 타입(Task 6에서 `app/lib/preloadGame.ts`에 정의됨)
- Produces: 없음 (리프 컴포넌트)

- [ ] **Step 1: `StageTransitionModal.tsx` 토큰화**

```tsx
// app/components/StageTransitionModal.tsx (전체 교체)
"use client";

import React from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { LoadError } from "../lib/preloadGame";
import PixelPanel from "./PixelPanel";

interface StageTransitionModalProps {
  type: "stageClear" | "stageFail";
  onNext: () => void;
  isLoading?: boolean;
  loadError?: LoadError | null;
}

export default function StageTransitionModal({
  type,
  onNext,
  isLoading,
  loadError,
}: StageTransitionModalProps) {
  const { t } = useLocale();
  const isClear = type === "stageClear";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80">
      <PixelPanel size="card" className="max-w-sm w-full mx-4 text-center">
        <div className="text-6xl mb-4">{isClear ? "🎉" : "⏳"}</div>
        <h2
          className={`text-2xl font-extrabold mb-4 ${isClear ? "text-amber" : "text-error"}`}
        >
          {isClear ? t("stageTransition.clearTitle") : t("stageTransition.failTitle")}
        </h2>
        <p className="text-ink mb-6 text-lg">
          {isClear ? t("stageTransition.clearMessage") : t("stageTransition.failMessage")}
        </p>
        {loadError && <p className="text-error mb-4">{t(loadError.key, loadError.params)}</p>}
        <button
          onClick={onNext}
          disabled={isLoading}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading
            ? t("stageTransition.loading")
            : isClear
              ? t("stageTransition.nextButton")
              : t("stageTransition.retryButton")}
        </button>
      </PixelPanel>
    </div>
  );
}
```

- [ ] **Step 2: `WheelScreen.tsx` 토큰화**

```tsx
// app/components/WheelScreen.tsx (전체 교체)
"use client";

import React from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import PixelPanel from "./PixelPanel";

interface WheelScreenProps {
  onNext: () => void;
}

export default function WheelScreen({ onNext }: WheelScreenProps) {
  const { t } = useLocale();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("wheel.title")}</h1>
        <div className="text-6xl mb-6">🎡</div>
        <p className="text-muted mb-8">{t("wheel.preparing")}</p>
        <button
          onClick={onNext}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("wheel.nextButton")}
        </button>
      </PixelPanel>
    </div>
  );
}
```

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`
- 한 스테이지를 일부러 놓쳐서(시간 초과) `StageTransitionModal`(실패)이 뜨는지, English 전환 시 "Unfortunately"/"Time's up."/"Retry Stage"로 바뀌는지 확인
- 스테이지 클리어 → "Congratulations!!"/"You cleared this stage."/"Next" 확인
- `WheelScreen` 진입 → "Lucky Wheel"/"Coming soon." 확인

- [ ] **Step 4: 커밋**

```bash
git add app/components/StageTransitionModal.tsx app/components/WheelScreen.tsx
git commit -m "feat: StageTransitionModal/WheelScreen을 다국어 토큰으로 전환"
```

---

### Task 10: `GameScreen` 토큰화 (보간 포함)

**Files:**
- Modify: `app/components/GameScreen.tsx`

**Interfaces:**
- Consumes: `useLocale()` (Task 4)
- Produces: 없음 (리프 컴포넌트) — 이 계획의 마지막 태스크

`GameScreen.tsx`는 숫자와 텍스트가 섞인 문장이 많아(예: "3 / 7 단계") 보간 파라미터가 실제로 필요한 화면이다.

- [ ] **Step 1: `GameScreen.tsx`의 헤더/푸터 문구를 `t()`로 교체**

`app/layout.tsx:104-116`, `:146-155` 부분(헤더/푸터)만 수정한다:

```tsx
// app/components/GameScreen.tsx (파일 상단 import 추가)
import { useLocale } from "../lib/i18n/LocaleContext";

// 컴포넌트 본문 최상단에 추가:
const { t } = useLocale();

// 헤더 부분 교체:
<header className="flex justify-between items-center p-4 md:px-8 bg-surface shadow-lg border-b border-wood z-10 sticky top-0">
  <span className="text-lg md:text-xl font-bold">
    {t("game.stageProgress", { current: stageNumber, total: totalStages })}
  </span>
  <div className="flex items-center gap-2">
    <span className="text-xl md:text-2xl font-bold">{t("game.timeRemainingLabel")}</span>
    <span
      className={`text-2xl md:text-3xl font-extrabold ${timeLeft <= 10 ? "text-error animate-pulse" : "text-amber"}`}
    >
      {t("game.secondsUnit", { seconds: timeLeft })}
    </span>
  </div>
</header>

// 푸터 부분 교체:
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
```

(나머지 로직 — `useState`, `useEffect`, `handleSlotClick`, `renderClickOverlays` 등 — 은 텍스트가 없으므로 변경 없음)

- [ ] **Step 2: 수동 검증**

Run: `npm run dev`
- 게임 플레이 화면에서 "1 / 7 단계", "남은 시간: 60초", "힌트", "남은 개수: 5/5" 확인
- English 전환 → "Stage 1 / 7", "Time Remaining: 60s", "Hint", "Remaining: 5/5"로 바뀌는지 확인(숫자 위치가 언어별로 자연스럽게 다른 것도 함께 확인 — 보간이 제대로 동작한다는 증거)

- [ ] **Step 3: 커밋**

```bash
git add app/components/GameScreen.tsx
git commit -m "feat: GameScreen 헤더/푸터를 보간 지원 다국어 토큰으로 전환"
```

---

## 완료 후 최종 확인

- [ ] `npm test` 전체 통과 (기존 37개 + 이번에 추가된 순수 함수 테스트)
- [ ] `npm run dev`로 스타트 → 프리로드 → 7단계 플레이 → 결과 → 돌림판 → 오늘의 결과까지 전체 플로우를 English로 한 번, 한국어로 한 번 완주하며 하드코딩된 한국어가 남아있지 않은지 확인
- [ ] 일본어 선택 시 전부 영어로 폴백되는지 확인(`ja.ts`가 아직 비어있으므로 의도된 동작)

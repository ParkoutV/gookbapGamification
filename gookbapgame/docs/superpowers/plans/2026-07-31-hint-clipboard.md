# 힌트 클립보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임 화면의 힌트 버튼을 누르면 클립보드 이미지 오버레이가 떠서, 이번 스테이지의 차이 나는 슬롯들의 파츠 카테고리명을 영수증처럼 한 줄씩 보여준다.

**Architecture:** 로케일 해석 로직은 순수 함수로 분리해 `node --test`로 테스트한다. `app/actions.ts`는 `part_categories`를 한 번 더 쿼리해 jsonb 원본 맵을 `GameSlot.categoryName`으로 클라이언트에 그대로 내려보낸다. 오버레이는 `StageTransitionModal`과 동일한 `fixed inset-0 z-50` 백드롭 패턴을 쓰는 새 컴포넌트 `HintClipboard`로 만들고, `GameScreen`이 boolean state 하나로 토글한다.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript 5, Tailwind CSS 4, Supabase JS, `node --test` + `--experimental-strip-types`

## Global Constraints

- 스펙 원본: `docs/superpowers/specs/2026-07-31-hint-clipboard-design.md`
- 표시 대상은 `part_categories.name`이며 **`parts.name`은 절대 노출하지 않는다** (정답 유출).
- **줄 수 == 차이 슬롯 개수.** 카테고리명이 중복돼도 dedupe 하지 않는다.
- 로케일 fallback 순서: `name[locale] → name.ko → "—"`. 빈 줄로 만들어 줄 수를 줄이지 않는다.
- 폰트는 CSS 범용 패밀리 키워드 `monospace`만 쓴다. 폰트 파일 추가·구체적 폰트명 지정 금지.
- 힌트는 무료·무제한 토글이다. 점수/시간/오답 패널티 없음.
- 오버레이가 열린 동안 씬 클릭이 오답으로 집계되면 안 된다 (백드롭이 가로막는 구조).
- 신규 i18n 키는 `ko.ts`와 `en.ts`에만 추가한다. `ja.ts`는 의도적으로 비어 있고 `translate.ts`가 `ja → en → ko`로 폴백한다.
- 테스트 파일을 새로 만들면 `package.json`의 `test` 스크립트 목록에 반드시 추가한다 (자동 발견 없음).
- 종이 위 글자에 `text-ink`를 쓰지 않는다. 테마 `--ink`는 `#F3E9DC`(밝은색)라 흰 종이에서 안 보인다.
- 애셋은 이미 커밋되어 있다: `public/icons/hint-clipboard.webp` (1626×2624, alpha).

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `app/lib/i18n/localizedName.ts` | 생성 | DB jsonb 이름 맵 → 현재 로케일 문자열 (순수 함수) |
| `app/lib/i18n/localizedName.test.ts` | 생성 | 위 함수의 단위 테스트 |
| `package.json` | 수정 | `test` 스크립트에 새 테스트 파일 등록 |
| `app/actions.ts` | 수정 | `part_categories` 쿼리 추가, `GameSlot.categoryName` 필드 추가 |
| `app/lib/i18n/locales/ko.ts` | 수정 | `game.hintTitle`, `game.hintCloseAria` 추가 |
| `app/lib/i18n/locales/en.ts` | 수정 | 동일 키 추가 |
| `app/components/HintClipboard.tsx` | 생성 | 클립보드 오버레이 (백드롭 + 이미지 + 종이 위 텍스트) |
| `app/components/GameScreen.tsx` | 수정 | 힌트 토글 state, 버튼 `onClick`, `HintClipboard` 렌더 |

---

### Task 1: 로케일 이름 해석 순수 함수

DB의 jsonb 이름 맵을 현재 로케일 문자열로 바꾸는 순수 함수. `app/actions.ts`는 서버 액션이고 `useLocale()`은 클라이언트 전용이라, 해석은 클라이언트에서 일어난다. 로직만 떼어내 테스트 가능하게 만든다.

**Files:**
- Create: `app/lib/i18n/localizedName.ts`
- Test: `app/lib/i18n/localizedName.test.ts`
- Modify: `package.json` (`scripts.test`)

**Interfaces:**
- Consumes: `Locale` 타입 (`app/lib/i18n/types.ts` — `"ko" | "en" | "ja"`)
- Produces:
  - `export type LocalizedName = Record<string, string> | null | undefined`
  - `export const MISSING_NAME_PLACEHOLDER = "—"`
  - `export function resolveLocalizedName(name: LocalizedName, locale: Locale): string`

- [ ] **Step 1: Write the failing test**

`app/lib/i18n/localizedName.test.ts` 생성:

```ts
// app/lib/i18n/localizedName.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLocalizedName, MISSING_NAME_PLACEHOLDER } from "./localizedName.ts";

test("현재 로케일의 값이 있으면 그것을 쓴다", () => {
  const name = { ko: "국밥그릇", en: "Gukbap Bowl", ja: "クッパの器" };
  assert.equal(resolveLocalizedName(name, "en"), "Gukbap Bowl");
  assert.equal(resolveLocalizedName(name, "ja"), "クッパの器");
});

test("현재 로케일 키가 없으면 ko로 폴백한다", () => {
  const name = { ko: "국밥그릇" };
  assert.equal(resolveLocalizedName(name, "ja"), "국밥그릇");
});

test("현재 로케일 값이 빈 문자열이면 ko로 폴백한다", () => {
  const name = { ko: "국밥그릇", en: "" };
  assert.equal(resolveLocalizedName(name, "en"), "국밥그릇");
});

test("공백만 있는 값도 없는 것으로 보고 ko로 폴백한다", () => {
  const name = { ko: "국밥그릇", en: "   " };
  assert.equal(resolveLocalizedName(name, "en"), "국밥그릇");
});

test("ko도 없으면 플레이스홀더를 반환한다(빈 문자열이 아니다)", () => {
  assert.equal(resolveLocalizedName({ fr: "Bol" }, "en"), MISSING_NAME_PLACEHOLDER);
});

test("null이면 플레이스홀더를 반환한다", () => {
  assert.equal(resolveLocalizedName(null, "ko"), MISSING_NAME_PLACEHOLDER);
});

test("undefined면 플레이스홀더를 반환한다", () => {
  assert.equal(resolveLocalizedName(undefined, "ko"), MISSING_NAME_PLACEHOLDER);
});

test("빈 객체면 플레이스홀더를 반환한다", () => {
  assert.equal(resolveLocalizedName({}, "ko"), MISSING_NAME_PLACEHOLDER);
});

test("플레이스홀더는 빈 문자열이 아니다 — 줄이 사라지면 안 되기 때문", () => {
  assert.notEqual(MISSING_NAME_PLACEHOLDER, "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd gookbapgame && node --experimental-strip-types --test app/lib/i18n/localizedName.test.ts
```
Expected: FAIL — `Cannot find module ... localizedName.ts`

- [ ] **Step 3: Write minimal implementation**

`app/lib/i18n/localizedName.ts` 생성:

```ts
// app/lib/i18n/localizedName.ts
import type { Locale } from "./types.ts";

/** DB에 jsonb로 저장된 이름 맵. 키는 국가 코드 없는 언어 코드다: {"ko": "...", "en": "..."} */
export type LocalizedName = Record<string, string> | null | undefined;

/**
 * 이름을 찾지 못했을 때 쓰는 문자열.
 * 빈 문자열이면 안 된다 — 힌트 목록의 줄 수는 차이 슬롯 개수와 항상 같아야 하고,
 * 줄이 사라지면 플레이어가 문제를 다 찾은 것으로 착각한다.
 */
export const MISSING_NAME_PLACEHOLDER = "—";

const FALLBACK_LOCALE = "ko";

function pick(name: NonNullable<LocalizedName>, key: string): string | null {
  const value = name[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function resolveLocalizedName(name: LocalizedName, locale: Locale): string {
  if (!name) return MISSING_NAME_PLACEHOLDER;
  return pick(name, locale) ?? pick(name, FALLBACK_LOCALE) ?? MISSING_NAME_PLACEHOLDER;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd gookbapgame && node --experimental-strip-types --test app/lib/i18n/localizedName.test.ts
```
Expected: PASS — 9 tests pass

- [ ] **Step 5: Register the test file in package.json**

`package.json`의 `scripts.test` 값 끝(`app/lib/participantToken.test.ts` 뒤)에 ` app/lib/i18n/localizedName.test.ts`를 덧붙인다. 이 프로젝트는 테스트 파일을 자동 발견하지 않고 목록에 나열된 파일만 실행한다.

- [ ] **Step 6: Run the full suite**

Run:
```bash
cd gookbapgame && npm test
```
Expected: PASS — 기존 테스트 전부 + 새 9개

- [ ] **Step 7: Commit**

```bash
git add gookbapgame/app/lib/i18n/localizedName.ts gookbapgame/app/lib/i18n/localizedName.test.ts gookbapgame/package.json
git commit -m "i18n: DB jsonb 이름 맵의 로케일 해석 함수 추가"
```

---

### Task 2: `part_categories` 조회와 `GameSlot.categoryName` 배선

`part_categories` 테이블은 현재 코드베이스 어디서도 쿼리하지 않는다. 슬롯에 카테고리 이름 맵을 실어 클라이언트로 내려보낸다. 해석은 하지 않는다 — 서버 액션에 로케일을 배선하지 않기 위해 jsonb 원본을 그대로 전달한다.

**Files:**
- Modify: `app/actions.ts` (`GameSlot` 타입, `slotBuilders`, base_image 루프 이후 쿼리 추가)

**Interfaces:**
- Consumes: `LocalizedName` 타입 (Task 1, `app/lib/i18n/localizedName.ts`)
- Produces: `GameSlot`에 `categoryName: LocalizedName` 필드. Task 3의 `HintClipboard`가 이 필드를 읽는다.

**주의:** 이 파일은 Supabase와 외부 이미지 합성 API에 의존해서 순수 단위 테스트 대상이 아니다 (`app/lib/` 아래 테스트들은 전부 순수 로직이다). 검증은 타입 체크와 린트, 그리고 Task 3 완료 후 수동 확인으로 한다.

- [ ] **Step 1: `LocalizedName` 타입을 import 한다**

`app/actions.ts` 상단 import 블록(`import { requestNicknameAssign } from "./lib/nicknameApi";` 근처)에 추가:

```ts
import type { LocalizedName } from "./lib/i18n/localizedName";
```

- [ ] **Step 2: `GameSlot` 타입에 필드를 추가한다**

`app/actions.ts:11-19`의 `GameSlot`을 다음으로 바꾼다:

```ts
export type GameSlot = {
  slotId: number;
  x: number;
  y: number;
  slotScale: number;
  isDifference: boolean;
  leftHitPolygon: Point[] | null;
  rightHitPolygon: Point[] | null;
  /** part_categories.name의 jsonb 원본. 로케일 해석은 클라이언트에서 한다. */
  categoryName: LocalizedName;
};
```

- [ ] **Step 3: base_image 선택 루프 뒤에서 카테고리를 조회한다**

`app/actions.ts`에서 아래 기존 블록을 찾는다 (base_image 루프 직후):

```ts
    if (!selectedBaseImage || validSlots.length === 0) {
      console.error("No valid base image found with at least 1 valid slot.");
      return null;
    }
```

이 블록 **바로 아래**에 삽입한다:

```ts
    // 힌트 클립보드에 표시할 카테고리명. 이 조회가 실패해도 게임 진행은 막지 않고,
    // 해당 슬롯의 categoryName을 null로 두어 클라이언트가 플레이스홀더를 그리게 한다.
    const usedCategoryIds = Array.from(new Set(validSlots.map((s) => s.category_id)));
    const { data: categoryRows, error: categoriesErr } = await supabase
      .from("part_categories")
      .select("id,name")
      .in("id", usedCategoryIds);

    if (categoriesErr) {
      console.warn("[fetchGameData] part_categories 조회 실패 — 힌트에 카테고리명이 비게 된다:", categoriesErr);
    }

    const categoryNameById = new Map<number, LocalizedName>(
      (categoryRows ?? []).map((row) => [row.id as number, row.name as LocalizedName])
    );
```

- [ ] **Step 4: `slotBuilders`가 `categoryName`을 나르게 한다**

`slotBuilders` 배열의 타입 선언(`app/actions.ts:144-152`)에 필드를 추가한다:

```ts
    const slotBuilders: {
      slotId: number;
      x: number;
      y: number;
      slotScale: number;
      leftPart: PartRow;
      rightPart: PartRow;
      categoryName: LocalizedName;
    }[] = [];
```

같은 함수의 `slotBuilders.push({...})` 호출에 필드를 추가한다:

```ts
      slotBuilders.push({
        slotId: slot.id,
        x: slot.x_coordinate,
        y: slot.y_coordinate,
        slotScale: slot.scale ?? 1.0,
        leftPart,
        rightPart,
        categoryName: categoryNameById.get(slot.category_id) ?? null,
      });
```

- [ ] **Step 5: 최종 `GameSlot` 조립에 필드를 넘긴다**

`const slots: GameSlot[] = await Promise.all(...)` 안의 `return { ... }` 객체에 한 줄 추가:

```ts
        return {
          slotId: builder.slotId,
          x: builder.x,
          y: builder.y,
          slotScale: builder.slotScale,
          isDifference: builder.leftPart.id !== builder.rightPart.id,
          leftHitPolygon,
          rightHitPolygon,
          categoryName: builder.categoryName,
        };
```

- [ ] **Step 6: 타입 체크와 린트로 검증한다**

Run:
```bash
cd gookbapgame && npx tsc --noEmit && npm run lint
```
Expected: 에러 없음. `GameSlot`을 만드는 다른 곳이 있다면 여기서 "`categoryName` 누락" 에러가 뜬다 — 그 자리도 채운다.

- [ ] **Step 7: 기존 테스트가 깨지지 않았는지 확인한다**

Run:
```bash
cd gookbapgame && npm test
```
Expected: PASS (전부)

- [ ] **Step 8: Commit**

```bash
git add gookbapgame/app/actions.ts
git commit -m "actions: 슬롯에 part_categories 이름 맵(categoryName) 실어 보내기"
```

---

### Task 3: 힌트 클립보드 오버레이

클립보드 오버레이 컴포넌트를 만들고 `GameScreen`에 붙인다.

**Files:**
- Create: `app/components/HintClipboard.tsx`
- Modify: `app/lib/i18n/locales/ko.ts`, `app/lib/i18n/locales/en.ts`
- Modify: `app/components/GameScreen.tsx`

**Interfaces:**
- Consumes:
  - `GameSlot.categoryName` (Task 2)
  - `resolveLocalizedName(name, locale)` (Task 1)
  - `useLocale()` → `{ locale, t }` (`app/lib/i18n/LocaleContext.tsx`)
- Produces: `export default function HintClipboard(props: { names: string[]; onClose: () => void })`

**핵심 함정:** `GameScreen.tsx:183`과 `:201`의 양쪽 씬 컨테이너에 `onClick={handleBackgroundClick(side)}`가 걸려 있고, 이건 `registerWrongTouch()` → 10점 감점 + 스테이지당 3회 제한 카운트 증가로 이어진다. 백드롭 없이 오버레이를 얹으면 힌트를 열고 닫는 것만으로 오답 처리된다. 반드시 전체 화면 백드롭으로 씬 클릭을 가로막아야 한다.

- [ ] **Step 1: i18n 키를 추가한다**

`app/lib/i18n/locales/ko.ts`의 `"game.wrongTouchAria"` 줄 뒤에 추가:

```ts
  "game.hintTitle": "오늘의 주문서",
  "game.hintCloseAria": "힌트 닫기",
```

`app/lib/i18n/locales/en.ts`의 같은 위치에 추가:

```ts
  "game.hintTitle": "TODAY'S ORDER",
  "game.hintCloseAria": "Close hint",
```

`ja.ts`는 건드리지 않는다 — 의도적으로 비어 있고 `translate.ts`가 `ja → en → ko`로 폴백한다.

- [ ] **Step 2: `HintClipboard` 컴포넌트를 만든다**

`app/components/HintClipboard.tsx` 생성:

```tsx
"use client";

import React from "react";
import { useLocale } from "../lib/i18n/LocaleContext";

interface HintClipboardProps {
  /** 차이 슬롯당 한 줄. 중복 이름이어도 합치지 않는다. */
  names: string[];
  onClose: () => void;
}

// 애셋 원본 크기 1626x2624 기준 종이 영역의 대략적 위치(래퍼 대비 백분율).
// top이 26%인 것은 금속 집게가 종이 상단을 덮기 때문이다.
const PAPER_INSET = { left: "13%", right: "18%", top: "26%", bottom: "14%" };

// 감열지 인쇄 느낌의 잉크색. 테마의 --ink는 어두운 배경용 밝은 색이라 흰 종이에서 안 보인다.
const PAPER_INK = "#3A2E24";

export default function HintClipboard({ names, onClose }: HintClipboardProps) {
  const { t } = useLocale();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/70"
      onClick={onClose}
      role="button"
      tabIndex={0}
      aria-label={t("game.hintCloseAria")}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onClose();
      }}
    >
      <div
        className="relative"
        // 세로로 긴 애셋(1626x2624)이라 기본은 높이 기준이되, 좁은 화면에서는 폭 기준으로 줄인다.
        // 중요: maxWidth로 자르면 안 된다. 폭이 잘린 래퍼는 애셋보다 가로가 넓어지고,
        // object-contain이 이미지를 위아래 레터박스로 축소시킨다. 그런데 아래 PAPER_INSET은
        // 이미지가 아니라 "래퍼" 기준 백분율이라, 글자 블록이 종이에서 떨어져 나간다.
        // aspectRatio로 래퍼를 항상 애셋 비율과 정확히 같게 유지해야 백분율이 성립한다.
        style={{
          aspectRatio: "1626 / 2624",
          height: "min(88vh, calc(92vw * 2624 / 1626))",
          width: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src="/icons/hint-clipboard.webp"
          alt=""
          className="w-full h-full object-contain select-none pointer-events-none"
        />

        <div
          className="absolute flex flex-col justify-start overflow-hidden"
          style={{
            ...PAPER_INSET,
            color: PAPER_INK,
            fontFamily: "monospace",
            // 예산: 종이 세로 = (100-26-14)% × 88vh = 52.8vh.
            // 줄 높이 1.8 × 2.2vh = 3.96vh, 10줄 = 39.6vh, 헤더+여백 ≈ 4.5vh → 약 44vh.
            // 52.8vh 안에 여유 있게 들어간다. 이 값들을 키우려면 다시 계산할 것.
            fontSize: "min(2.2vh, 3.0vw)",
            lineHeight: 1.8,
          }}
        >
          <div className="font-bold tracking-widest border-b border-dashed border-current pb-1 mb-2">
            {t("game.hintTitle")}
          </div>
          {names.map((name, i) => (
            <div key={i} className="break-words">
              {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `GameScreen`에 토글 state와 import를 추가한다**

`app/components/GameScreen.tsx` 상단 import에 두 줄 추가:

```tsx
import HintClipboard from "./HintClipboard";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
```

`const { t } = useLocale();`를 `locale`도 꺼내도록 바꾼다:

```tsx
  const { t, locale } = useLocale();
```

`const [foundSlots, ...]` 근처 state 선언들 뒤에 추가:

```tsx
  const [isHintOpen, setIsHintOpen] = useState(false);
```

- [ ] **Step 4: 힌트 줄 목록을 계산한다**

`const differenceSlots = session.slots.filter((s) => s.isDifference);` 바로 아래에 추가:

```tsx
  // 차이 슬롯 1개당 정확히 한 줄. 이름이 겹쳐도 dedupe 하지 않는다 —
  // 줄이 줄어들면 플레이어가 문제를 다 찾은 것으로 착각한다.
  const hintNames = differenceSlots.map((slot) => resolveLocalizedName(slot.categoryName, locale));
```

- [ ] **Step 5: 힌트 버튼에 토글을 연결한다**

`app/components/GameScreen.tsx:213-217`의 버튼을 바꾼다:

```tsx
        <PixelPanel size="btn">
          <button
            type="button"
            className="w-full font-bold text-ink"
            onClick={() => setIsHintOpen((prev) => !prev)}
            aria-expanded={isHintOpen}
          >
            {t("game.hintButton")}
          </button>
        </PixelPanel>
```

- [ ] **Step 6: 오버레이를 렌더한다**

`GameScreen`의 최상위 `return (...)` 안, `</footer>` 바로 다음 줄(바깥 `</div>` 직전)에 추가:

```tsx
      {isHintOpen && <HintClipboard names={hintNames} onClose={() => setIsHintOpen(false)} />}
```

- [ ] **Step 7: 스테이지가 넘어갈 때 힌트를 닫는다**

`page.tsx:44`가 `key={`${game.stageNumber}-${game.loadNonce}`}`로 스테이지마다 `GameScreen`을 리마운트하므로 다음 스테이지로 state가 새지는 않는다. 하지만 `page.tsx:41-42`를 보면 `stageClear` 단계 동안 `GameScreen`이 블러 처리된 채 그대로 남아 있고, 그 구간에 `z-50` 오버레이가 열려 있으면 클리어 모달과 겹쳐 지저분해진다. 그래서 아래 리셋은 필요하다.

`registerWrongTouch` 안의 3회 도달 분기에서 `setIsShaking(true);` 바로 앞에 추가:

```tsx
      setIsHintOpen(false);
```

그리고 스테이지 클리어를 감지하는 `useEffect` 안, `onStageClear(foundSlots.size);` 바로 앞에도 추가:

```tsx
      setIsHintOpen(false);
```

- [ ] **Step 8: 타입 체크와 린트**

Run:
```bash
cd gookbapgame && npx tsc --noEmit && npm run lint
```
Expected: 에러 없음

- [ ] **Step 9: 전체 테스트**

Run:
```bash
cd gookbapgame && npm test
```
Expected: PASS (전부)

- [ ] **Step 10: 수동 확인**

Run: `cd gookbapgame && npm run dev` 후 게임 화면까지 진행한다. 확인 항목:

1. 힌트 버튼을 누르면 클립보드가 뜨고, 다시 누르면 닫힌다.
2. 종이 위에 줄이 있고, **줄 수가 하단의 "남은 개수" 총계와 같다**.
3. 글자가 종이 밖으로 넘치지 않는다 (집게에 가리지 않고, 아래로 삐져나오지 않는다).
4. **클립보드를 클릭해도, 바깥을 클릭해 닫아도 오답 카운터(하단 아이콘)가 늘지 않는다.** 이게 이 태스크의 핵심 검증이다.
5. 브라우저 창을 좁게/짧게 줄여도 클립보드가 화면을 넘지 않는다.
6. 언어 토글로 en/ja를 눌러도 줄 수가 유지된다 (ja는 번역이 없으면 ko 값이 그대로 보이는 게 정상).

3번이 어긋나면 `HintClipboard.tsx`의 `PAPER_INSET`을 눈으로 맞춘다. 이 값은 추정치다.
단 `fontSize`를 키울 때는 Step 2의 예산 주석을 다시 계산할 것 — 10줄이 들어가야 한다.

- [ ] **Step 11: 10줄 한계를 실제로 확인한다**

Step 10은 실제 스테이지(`diffCount: 5`)로만 돌아서 10줄 요구사항을 전혀 건드리지 못한다. 직접 시험해야 한다.

`HintClipboard.tsx`의 텍스트 블록에서 `overflow-hidden`을 **잠시 제거**하고(넘침이 조용히 잘리는 대신 눈에 보이게), `GameScreen.tsx`의 `hintNames` 계산을 임시로 아래로 바꾼다:

```tsx
  const hintNames = [
    "메인 국밥그릇", "깍두기 접시", "밥공기", "숟가락 받침", "다진양념 종지",
    "Extra Long Category Name That Should Wrap Onto Two Lines", "새우젓 종지",
    "고춧가루 통", "물컵", "휴지통",
  ];
```

확인:
1. 10줄이 전부 보이고 종이 밖으로 넘치지 않는다 (긴 영문 줄은 두 줄로 접히고, 그 상태로도 종이 안이다).
2. 브라우저 창을 세로로 길고 좁게(모바일 비율, 예: 400×900) 만들어도 여전히 종이 안이다. **이 비율에서 예전 `maxWidth` 방식이 깨졌던 지점이므로 반드시 확인한다.**

넘치면 `fontSize`를 낮추고 Step 2 주석의 계산을 갱신한다.

확인이 끝나면 **`hintNames`를 원래대로 되돌리고 `overflow-hidden`도 복구한다.** 되돌리지 않은 채 커밋하지 말 것.

- [ ] **Step 12: Commit**

```bash
git add gookbapgame/app/components/HintClipboard.tsx gookbapgame/app/components/GameScreen.tsx gookbapgame/app/lib/i18n/locales/ko.ts gookbapgame/app/lib/i18n/locales/en.ts
git commit -m "feat: 힌트 클립보드 오버레이 — 차이 슬롯 카테고리명을 영수증처럼 표시"
```

---

## 완료 조건

- `npm test` 전부 통과
- `npx tsc --noEmit`, `npm run lint` 에러 없음
- Task 3 Step 10의 수동 확인 6항목 전부 통과 (특히 4번 — 힌트 여닫기가 오답으로 집계되지 않을 것)
- Task 3 Step 11의 10줄 한계 확인 통과, 그리고 임시 코드가 원복되었을 것

# 게임 화면 HUD 개편 · 폴라로이드 프레임 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임 화면의 HUD(단계·시간·힌트·문항 표시)를 재배치하고, 좌/우 장면을 폴라로이드 사진 프레임으로 바꾸며, 단계 전환에 하향 크로스페이드를 넣는다.

**Architecture:** 표시 로직을 순수 함수(`app/lib/`)로 먼저 뽑아 단위 테스트하고, 그 다음 `GameScreen.tsx`가 그것을 소비하도록 바꾼다. 시각적 스타일(프레임·전환)은 `globals.css`에 클래스로 두어 컴포넌트가 레이아웃 분기를 몰라도 되게 한다. 게임 규칙·점수·판정 로직과 `page.tsx`의 리마운트 구조는 건드리지 않는다.

**Tech Stack:** Next.js 16 / React 19 / Tailwind v4 / TypeScript / `node --test` (`--experimental-strip-types`)

**Spec:** `docs/superpowers/specs/2026-08-09-game-screen-hud-redesign-design.md`

## Global Constraints

- **테스트 러너에 새 파일을 등록해야 한다.** `package.json`의 `test` 스크립트는 파일을 **명시적으로 나열**한다. 새 `.test.ts`를 만들고 여기 추가하지 않으면 **조용히 실행되지 않는다.**
- **i18n 키를 새로 추가하지 않는다.** 기존 키(`game.stageProgress`, `game.remainingCount`, `game.timeRemainingLabel`, `game.secondsUnit`, `game.hintButton`, `game.wrongTouchAria`)를 `aria-label`로 재사용한다. 부득이 추가할 경우 ko/en/ja **세 로케일 모두 같은 커밋**에 넣는다(`translateWith`가 ja→en→ko로 폴백해서 ko만 넣으면 테스트는 통과하고 사용자에게만 한국어가 노출된다).
- **`app/lib/hitTarget.ts`의 상수를 바꾸지 않는다** (`MIN_TOUCH_TARGET_PX=56`, `SAFE_ZONE_PX=5`, `DEAD_ZONE_PX=5`).
- **`page.tsx:236`의 `key={stageNumber-loadNonce}`를 건드리지 않는다.** 단계별 상태 초기화가 이 리마운트에 의존한다.
- **정답/오답 마커를 히트 영역(`renderClickOverlays`) 자식으로 넣지 않는다.** `clip-path`가 서브트리 전체에 적용되어 마커가 잘린다.
- 레이아웃 분기는 `@media (width >= theme(--breakpoint-md))`를 쓴다. `768px`을 손으로 적지 않는다.
- 애니메이션은 `@media (prefers-reduced-motion: reduce)`에서 비활성화한다.
- 커밋 메시지는 한국어로, 기존 관례를 따른다.

## File Structure

**신규**
- `app/lib/hudIndicators.ts` — 문항 인디케이터 칸 상태와 타이머 게이지 비율을 계산하는 순수 함수. UI를 모른다.
- `app/lib/hudIndicators.test.ts` — 위 테스트.

**수정**
- `app/lib/stageConfig.ts` — 인디케이터 칸 상한 상수 추가.
- `app/globals.css` — 폴라로이드 프레임, 사진 전환 키프레임, 게이지 방향 분기.
- `app/components/GameScreen.tsx` — HUD 재배치, 프레임 적용, 전환 연결.
- `package.json` — 새 테스트 파일 등록.

---

### Task 1: 인디케이터·게이지 순수 함수

**Files:**
- Create: `app/lib/hudIndicators.ts`
- Create: `app/lib/hudIndicators.test.ts`
- Modify: `app/lib/stageConfig.ts` (상수 추가)
- Modify: `package.json` (테스트 등록)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `INDICATOR_SLOT_CAP: number` (= 9, `stageConfig.ts`)
  - `type IndicatorCell = "filled" | "empty" | "hidden"`
  - `resolveIndicatorCells(total: number, found: number, cap?: number): IndicatorCell[]`
  - `resolveGaugeRatio(remainingSec: number, limitSec: number): number`
  - `isTimeCritical(remainingSec: number): boolean`
  - `TIME_CRITICAL_SEC: number` (= 30)

- [ ] **Step 1: 상한 상수 추가**

`app/lib/stageConfig.ts` 끝에 추가:

```typescript
/**
 * 문항 인디케이터가 기본으로 그리는 칸 수.
 *
 * 현재 DB에 등록된 최대 문항 수는 7개다(2026-08-09). 9는 여유분이다.
 *
 * **DB에 하드 상한은 없다** — `validate_base_image_questions_count` 트리거는
 * `questions_count`가 연결된 `image_slots` 개수 이하인지만 검증한다
 * (`gookbapanalyze/AGENTS.md`). 즉 7은 콘텐츠 관행이지 제약이 아니며, 슬롯을
 * 충분히 만든 이미지라면 그 이상도 설정될 수 있다. 그래서 이 값을 넘는 경우
 * `resolveIndicatorCells`는 칸을 **잘라내지 않고** 실제 개수만큼 돌려준다.
 */
export const INDICATOR_SLOT_CAP = 9;
```

- [ ] **Step 2: 실패하는 테스트 작성**

`app/lib/hudIndicators.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveIndicatorCells,
  resolveGaugeRatio,
  isTimeCritical,
  TIME_CRITICAL_SEC,
} from "./hudIndicators.ts";
import { INDICATOR_SLOT_CAP, GLOBAL_TIME_LIMIT_SEC } from "./stageConfig.ts";

const count = (cells: string[], kind: string) => cells.filter((c) => c === kind).length;

test("문항 5개면 상한까지 나머지 칸은 hidden", () => {
  const cells = resolveIndicatorCells(5, 0);
  assert.equal(cells.length, INDICATOR_SLOT_CAP);
  assert.equal(count(cells, "hidden"), INDICATOR_SLOT_CAP - 5);
  assert.equal(count(cells, "empty"), 5);
});

test("문항 7개(현재 DB 최대)면 8·9번 칸만 hidden", () => {
  const cells = resolveIndicatorCells(7, 0);
  assert.deepEqual(cells.slice(7), ["hidden", "hidden"]);
});

test("찾은 개수만큼 앞에서부터 채운다", () => {
  const cells = resolveIndicatorCells(5, 2);
  assert.deepEqual(cells.slice(0, 5), ["filled", "filled", "empty", "empty", "empty"]);
});

test("다 찾으면 보이는 칸이 전부 filled", () => {
  const cells = resolveIndicatorCells(5, 5);
  assert.equal(count(cells, "filled"), 5);
  assert.equal(count(cells, "empty"), 0);
});

test("상한을 넘으면 잘라내지 않고 실제 개수만큼 돌려준다", () => {
  const cells = resolveIndicatorCells(10, 0);
  assert.equal(cells.length, 10);
  assert.equal(count(cells, "hidden"), 0);
});

test("찾은 수가 문항 수보다 커도 칸 수를 넘겨 채우지 않는다", () => {
  const cells = resolveIndicatorCells(5, 99);
  assert.equal(count(cells, "filled"), 5);
});

test("문항이 0개면 전부 hidden", () => {
  const cells = resolveIndicatorCells(0, 0);
  assert.equal(count(cells, "hidden"), INDICATOR_SLOT_CAP);
});

test("게이지 비율은 0~1로 잘린다", () => {
  assert.equal(resolveGaugeRatio(GLOBAL_TIME_LIMIT_SEC, GLOBAL_TIME_LIMIT_SEC), 1);
  assert.equal(resolveGaugeRatio(0, GLOBAL_TIME_LIMIT_SEC), 0);
  assert.equal(resolveGaugeRatio(-5, GLOBAL_TIME_LIMIT_SEC), 0);
  assert.equal(resolveGaugeRatio(999, GLOBAL_TIME_LIMIT_SEC), 1);
});

test("게이지 비율 중간값", () => {
  assert.equal(resolveGaugeRatio(150, 300), 0.5);
});

test("limitSec이 0이면 0을 돌려준다(0으로 나누지 않는다)", () => {
  assert.equal(resolveGaugeRatio(10, 0), 0);
});

test("경고 임계값은 30초 이하 포함", () => {
  assert.equal(TIME_CRITICAL_SEC, 30);
  assert.equal(isTimeCritical(31), false);
  assert.equal(isTimeCritical(30), true);
  assert.equal(isTimeCritical(0), true);
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './hudIndicators.ts'`

(주의: Step 5에서 `package.json`에 등록하기 전까지는 이 파일이 아예 실행되지 않는다. 이 단계에서는 아래 명령으로 직접 돌려 확인한다.)

Run: `node --experimental-strip-types --test app/lib/hudIndicators.test.ts`
Expected: FAIL

- [ ] **Step 4: 구현**

`app/lib/hudIndicators.ts`:

```typescript
import { INDICATOR_SLOT_CAP } from "./stageConfig.ts";

/** 남은 시간이 이 값 이하면 경고 표시로 바뀐다. */
export const TIME_CRITICAL_SEC = 30;

export type IndicatorCell = "filled" | "empty" | "hidden";

/**
 * 문항 인디케이터의 칸별 상태.
 *
 * 기본은 `cap`개를 그리고 문항 수를 넘는 칸을 `hidden`으로 둔다 — 칸 수를 실제로
 * 늘렸다 줄이면 단계마다 레이아웃 폭이 출렁이기 때문이다. 그래서 호출부는
 * `hidden`을 `display: none`이 아니라 `opacity: 0`으로 그려야 한다(자리는 유지).
 *
 * **문항이 `cap`을 넘으면 잘라내지 않고 실제 개수만큼 돌려준다.** 이때만 폭이
 * 달라지는데, 조용히 잘려서 사용자가 원 개수를 목표로 삼았다가 "다 채웠는데
 * 안 끝나는" 상황이 되는 것보다 낫다.
 */
export function resolveIndicatorCells(
  total: number,
  found: number,
  cap: number = INDICATOR_SLOT_CAP
): IndicatorCell[] {
  const visible = Math.max(0, total);
  const length = Math.max(cap, visible);
  const filled = Math.min(Math.max(0, found), visible);

  return Array.from({ length }, (_, i) => {
    if (i >= visible) return "hidden";
    return i < filled ? "filled" : "empty";
  });
}

/** 타이머 게이지 채움 비율(0~1). limitSec이 0 이하면 0. */
export function resolveGaugeRatio(remainingSec: number, limitSec: number): number {
  if (limitSec <= 0) return 0;
  return Math.min(1, Math.max(0, remainingSec / limitSec));
}

export function isTimeCritical(remainingSec: number): boolean {
  return remainingSec <= TIME_CRITICAL_SEC;
}
```

- [ ] **Step 5: 테스트 러너에 등록**

`package.json`의 `test` 스크립트 맨 끝(`app/lib/sfx.test.ts` 뒤)에 ` app/lib/hudIndicators.test.ts`를 추가한다.

- [ ] **Step 6: 전체 테스트 통과 확인**

Run: `npm test 2>&1 | tail -20`
Expected: PASS — 새 테스트가 실행 목록에 포함되어 모두 통과

- [ ] **Step 7: 커밋**

```bash
git add app/lib/hudIndicators.ts app/lib/hudIndicators.test.ts app/lib/stageConfig.ts package.json
git commit -m "게임 HUD: 문항 인디케이터·타이머 게이지 계산 함수 추가"
```

---

### Task 2: 폴라로이드 프레임 CSS

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: 없음
- Produces: CSS 클래스 `.photo-frame`(바깥 인화지), `.photo-frame__photo`(사진 영역). Task 4가 `GameScreen.tsx`에서 쓴다.

- [ ] **Step 1: 색 변수 추가**

`app/globals.css`의 `:root` 블록(3~15줄) 안, `--error` 다음 줄에 추가:

```css
  /* 폴라로이드 인화지. 순백(#FFF)은 어두운 화면에서 너무 튀어 사진보다 먼저
     눈에 들어온다. 살짝 탁한 값이 실제 인화지에 가깝다. */
  --photo-paper: #EDE7DC;
```

- [ ] **Step 2: 프레임 클래스 추가**

`app/globals.css`의 `.hint-clipboard` 블록(132~137줄) **바로 뒤**에 추가:

```css
/* 폴라로이드 사진 프레임(GameScreen의 좌/우 장면 전용).
 *
 * 게임 화면의 그림 2장에만 쓴다 — 다른 화면은 .pixel-frame이 전역 디자인 언어다.
 *
 * 하단 여백만 1.2배인 것은 폴라로이드의 비대칭을 재현하기 위한 것이다. 실물은
 * 하단이 20~25%지만 그만큼 주면 그림 영역이 깎이고, 슬롯이 작아지면
 * resolveHitTargetBox의 56px 보정에 걸리는 슬롯이 늘어 실루엣 정밀도가 낮아진다.
 * 1.2배면 "아래가 더 두껍다"는 신호는 서고 그림은 거의 안 깎인다.
 *
 * 하단 여백은 비워 둔다. 캡션에 넣을 정보가 없다 — "그림 1/2"는 좌우 배치로
 * 이미 자명하고 단계 표시는 우상단에 있다.
 */
.photo-frame {
  --photo-pad: 10px;
  background: var(--photo-paper);
  padding: var(--photo-pad) var(--photo-pad) calc(var(--photo-pad) * 1.2);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
}

/* 사진 영역.
 *
 * 배경이 검은 이유가 두 가지다.
 * 1) DB 이미지 중 일부는 캔버스 비율(1200/800)에 맞지 않아 투명 영역이 남는다.
 *    object-contain이라 그 자리는 레터박스가 되는데, 인화지 흰색이 비치면
 *    사진이 잘린 것처럼 보인다.
 * 2) 단계 전환에서 새 사진이 내려오는 동안 위쪽이 잠깐 비는데, 같은 검정이
 *    그 자리도 덮는다.
 *
 * aspect-ratio는 프레임이 아니라 **여기**에 건다. 프레임 전체에 걸면 여백만큼
 * 사진이 찌그러진다.
 *
 * overflow: hidden은 전환 중 사진이 프레임 밖으로 새는 것을 막는다.
 */
.photo-frame__photo {
  position: relative;
  aspect-ratio: 1200 / 800;
  background: #000;
  overflow: hidden;
  /* 인화지에 눌린 깊이감. 얕게 유지할 것 — 이 게임은 다른 그림 찾기라
     그림자가 짙으면 가장자리 정답 슬롯의 판별을 방해한다. */
  box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.5);
}
```

- [ ] **Step 3: 빌드가 깨지지 않는지 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (CSS만 바꿨으므로 통과해야 한다)

- [ ] **Step 4: 커밋**

```bash
git add app/globals.css
git commit -m "게임 HUD: 폴라로이드 사진 프레임 스타일 추가"
```

---

### Task 3: 단계 전환 애니메이션 CSS

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `.photo-frame__photo` (Task 2)
- Produces: CSS 클래스 `.photo-swap__incoming`, `.photo-swap__outgoing`. Task 5가 쓴다.

- [ ] **Step 1: 키프레임과 클래스 추가**

Task 2에서 추가한 `.photo-frame__photo` 블록 **바로 뒤**에 추가:

```css
/* 단계 전환. 프레임은 고정이고 안쪽 사진만 갈린다 — 액자에 사진을 갈아끼우는
 * 연출이라 폴라로이드 컨셉과 맞는다.
 *
 * 방향은 **하향 고정**이다(세로·가로 레이아웃 동일). 필름 스트립에서 "위에 있는
 * 사진으로 올라간다"는 은유이며, 그래서 콘텐츠는 아래로 흐른다 — 레벨 상승으로
 * 읽힌다(2026-08-09, 이란토).
 *
 * 횡축을 쓰지 않는 이유: 사진 영역이 가로로 길어(1200/800) 이동 거리가 길고,
 * 0.3s 안에 긴 거리를 움직이면 오히려 부자연스럽다. 짧은 축이 이 duration에 맞는다.
 * 가로 레이아웃에서 두 그림을 바깥으로 벌리는 안은 폐기했다 — 좌우 배치에서만
 * 자연스럽고 세로에서는 두 그림이 반대로 움직여 화면이 갈라져 보인다.
 * 하향 고정이면 레이아웃 분기 자체가 없다.
 */
@keyframes photo-swap-in {
  from {
    opacity: 0;
    transform: translateY(-12%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes photo-swap-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.92);
  }
}

.photo-swap__incoming {
  animation: photo-swap-in 0.3s ease-in-out;
}

/* 빠져나가는 사진. absolute로 띄워 들어오는 사진과 같은 자리에 겹친다.
   pointer-events: none이라 전환 중 클릭을 가로채지 않는다. */
.photo-swap__outgoing {
  position: absolute;
  inset: 0;
  pointer-events: none;
  animation: photo-swap-out 0.3s ease-in-out forwards;
}

@media (prefers-reduced-motion: reduce) {
  .photo-swap__incoming,
  .photo-swap__outgoing {
    animation: none;
  }
  /* 애니메이션이 없으면 빠져나가는 사진이 그대로 남아 새 사진을 덮는다. */
  .photo-swap__outgoing {
    display: none;
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/globals.css
git commit -m "게임 HUD: 단계 전환 하향 크로스페이드 추가"
```

---

### Task 4: HUD 재배치 (header · 게이지 · 힌트 · 인디케이터)

**Files:**
- Modify: `app/components/GameScreen.tsx`

**Interfaces:**
- Consumes: `resolveIndicatorCells`, `resolveGaugeRatio`, `isTimeCritical` (Task 1); `.photo-frame`, `.photo-frame__photo` (Task 2)
- Produces: 없음(컴포넌트 내부 변경)

**주의:** 이 태스크는 마크업만 바꾼다. 클릭 핸들러(`handleSlotClick`, `handleBackgroundClick`), `renderClickOverlays`, `renderDeadZones`, `renderFoundMarks`, `renderWrongMarks`의 **내용은 그대로 둔다.** 위치만 새 프레임 구조 안으로 옮긴다.

- [ ] **Step 1: import 추가**

`app/components/GameScreen.tsx` 상단 import 블록에 추가:

```typescript
import { resolveIndicatorCells, resolveGaugeRatio, isTimeCritical } from "../lib/hudIndicators";
import { GLOBAL_TIME_LIMIT_SEC } from "../lib/stageConfig";
```

기존 `import { WRONG_TOUCH_LIMIT_PER_LEVEL } from "../lib/stageConfig";`는 위 줄과 합쳐도 된다.

- [ ] **Step 2: header 교체**

267~279줄의 `<header>` 전체를 아래로 교체:

```tsx
      <header className="relative flex justify-end items-center p-4 md:px-8 bg-surface shadow-lg border-b border-wood z-10 sticky top-0">
        {/* Lv 표시 + 진행 칩. 칩은 시각 정보라 스크린리더에는 기존 문장을 남긴다. */}
        <div
          className="flex flex-col items-end gap-1"
          aria-label={t("game.stageProgress", { current: stageNumber, total: totalStages })}
        >
          <span className="text-xl md:text-2xl font-bold leading-none">Lv.{stageNumber}</span>
          <div className="flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: totalStages }).map((_, i) => (
              <span
                key={i}
                className={`w-3 h-3 md:w-4 md:h-4 ${i < stageNumber ? "bg-accent" : "bg-wood/30"}`}
              />
            ))}
          </div>
        </div>
      </header>
```

- [ ] **Step 3: 게이지와 힌트 버튼을 두 그림 사이에 두는 마크업 준비**

`<main>` 시작 태그(281줄) 바로 다음, 첫 번째 그림 `<div>` 앞에 들어갈 조각이 아니라 **두 그림 사이**에 들어간다. Step 4에서 전체 구조를 한 번에 교체하므로 여기서는 아래 JSX를 준비만 한다:

```tsx
        {/* 힌트 버튼 + 타이머 게이지. 두 그림 사이에 놓인다.
            세로 배치에서는 가로 바, 가로 배치(md 이상)에서는 세로 바가 된다. */}
        <div className="flex md:flex-col items-center gap-2 w-full md:w-auto md:h-full md:justify-center">
          <PixelPanel size="btn" className="min-w-12 shrink-0">
            <button
              type="button"
              className="w-full font-bold text-ink text-xl leading-none py-1"
              onClick={() => setIsHintOpen((prev) => !prev)}
              aria-expanded={isHintOpen}
              aria-label={t("game.hintButton")}
            >
              ?
            </button>
          </PixelPanel>

          {/* 게이지. 세로 배치에서는 남은 시간이 왼→오른쪽으로 줄고,
              가로 배치에서는 위→아래로 준다(모래시계). */}
          <div
            className="relative flex-1 md:flex-none h-3 w-full md:h-40 md:w-3 bg-wood/30 overflow-hidden"
            role="img"
            aria-label={`${t("game.timeRemainingLabel")} ${t("game.secondsUnit", { seconds: remainingTimeSec })}`}
          >
            <div
              className={`absolute left-0 top-0 md:bottom-0 md:top-auto w-full h-full transition-[width,height] duration-500 ease-linear ${
                timeCritical ? "bg-error" : "bg-amber"
              }`}
              style={{
                width: `${gaugeRatio * 100}%`,
                height: "100%",
              }}
            />
          </div>

          <span
            className={`text-lg md:text-xl font-extrabold shrink-0 ${
              timeCritical ? "text-error animate-pulse" : "text-amber"
            }`}
          >
            {t("game.secondsUnit", { seconds: remainingTimeSec })}
          </span>
        </div>
```

**중요:** 위 게이지는 세로 배치(가로 바) 기준으로 `width`를 인라인 스타일로 준다. 가로 배치(세로 바)에서는 `height`가 비율이 되어야 하므로, Step 5에서 CSS 변수로 넘겨 미디어쿼리가 축을 고르게 바꾼다. 이 단계에서는 일단 가로 바로 동작하게 두고 Step 5에서 마무리한다.

- [ ] **Step 4: main과 footer 전체 교체**

281~347줄(`<main>` 시작부터 `</footer>`까지)을 아래로 교체:

```tsx
      <main className="flex-1 flex flex-col md:flex-row items-center justify-center p-4 gap-3 md:gap-4 overflow-auto">
        {/* 왼쪽(세로 배치에서는 위쪽) 장면 + 그 아래 문항 인디케이터 */}
        <div className="flex flex-col items-center gap-2 w-full max-w-[1200px]">
          <div
            ref={containerRef}
            className="photo-frame w-full cursor-pointer"
            onClick={handleBackgroundClick("left")}
          >
            <div className="photo-frame__photo">
              <img
                src={session.leftSceneUrl}
                alt="Scene Left"
                className="w-full h-full object-contain select-none pointer-events-none"
                onLoad={handleImageLoad}
              />
              {renderDeadZones("left")}
              {renderClickOverlays("left")}
              {renderFoundMarks()}
              {renderWrongMarks("left")}
            </div>
          </div>

          {/* 문항 인디케이터. 가로 배치에서는 왼쪽 그림 아래에 붙는다.
              hidden 칸도 자리를 차지해야 하므로 display가 아니라 opacity로 감춘다. */}
          <div
            className="flex items-center gap-1 self-start"
            aria-label={t("game.remainingCount", {
              found: totalDifferences - foundSlots.size,
              total: totalDifferences,
            })}
          >
            {indicatorCells.map((cell, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`w-4 h-4 rounded-full border-2 border-wood ${
                  cell === "filled" ? "bg-accent" : "bg-transparent"
                } ${cell === "hidden" ? "opacity-0" : "opacity-100"}`}
              />
            ))}
          </div>
        </div>

        {/* 힌트 + 게이지 (두 그림 사이) */}
        <div className="flex md:flex-col items-center gap-2 w-full md:w-auto md:self-stretch md:justify-center shrink-0">
          <PixelPanel size="btn" className="min-w-12 shrink-0">
            <button
              type="button"
              className="w-full font-bold text-ink text-xl leading-none py-1"
              onClick={() => setIsHintOpen((prev) => !prev)}
              aria-expanded={isHintOpen}
              aria-label={t("game.hintButton")}
            >
              ?
            </button>
          </PixelPanel>

          <div
            className="time-gauge relative flex-1 md:flex-none h-3 w-full md:h-40 md:w-3 bg-wood/30 overflow-hidden"
            style={{ ["--gauge-ratio" as string]: gaugeRatio }}
            role="img"
            aria-label={`${t("game.timeRemainingLabel")} ${t("game.secondsUnit", { seconds: remainingTimeSec })}`}
          >
            <div className={`time-gauge__fill ${timeCritical ? "bg-error" : "bg-amber"}`} />
          </div>

          <span
            className={`text-lg md:text-xl font-extrabold shrink-0 ${
              timeCritical ? "text-error animate-pulse" : "text-amber"
            }`}
          >
            {t("game.secondsUnit", { seconds: remainingTimeSec })}
          </span>
        </div>

        {/* 오른쪽(세로 배치에서는 아래쪽) 장면 + 그 아래 오답 인디케이터 */}
        <div className="flex flex-col items-center gap-2 w-full max-w-[1200px]">
          <div
            className="photo-frame w-full cursor-pointer"
            onClick={handleBackgroundClick("right")}
          >
            <div className="photo-frame__photo">
              <img
                src={session.rightSceneUrl}
                alt="Scene Right"
                className="w-full h-full object-contain select-none pointer-events-none"
              />
              {renderDeadZones("right")}
              {renderClickOverlays("right")}
              {renderFoundMarks()}
              {renderWrongMarks("right")}
            </div>
          </div>

          <div
            className="flex items-center gap-1 self-end"
            aria-label={t("game.wrongTouchAria", {
              count: wrongTouchCount,
              limit: WRONG_TOUCH_LIMIT_PER_LEVEL,
            })}
          >
            {Array.from({ length: WRONG_TOUCH_LIMIT_PER_LEVEL }).map((_, i) => (
              <img
                key={i}
                src="/icons/check-failed.svg"
                alt=""
                aria-hidden="true"
                className={`w-5 h-5 ${i < wrongTouchCount ? "opacity-100" : "opacity-20"}`}
              />
            ))}
          </div>
        </div>
      </main>
```

`<footer>` 전체는 **삭제한다** — 힌트 버튼은 게이지 옆으로, 두 인디케이터는 각 그림 아래로 옮겨졌다.

- [ ] **Step 5: 파생값 계산 추가**

`GameScreen` 함수 본문에서 `const hintNames = ...` (54줄) 다음에 추가:

```typescript
  const indicatorCells = resolveIndicatorCells(totalDifferences, foundSlots.size);
  const gaugeRatio = resolveGaugeRatio(remainingTimeSec, GLOBAL_TIME_LIMIT_SEC);
  const timeCritical = isTimeCritical(remainingTimeSec);
```

- [ ] **Step 6: 게이지 축 분기 CSS 추가**

`app/globals.css`의 Task 3에서 추가한 블록 뒤에 추가:

```css
/* 타이머 게이지 채움. 세로 배치에서는 가로로(왼→오른쪽) 줄고, 가로 배치에서는
   세로로(위→아래) 준다 — 모래시계. 축이 다르므로 채움 방향도 다르다.
   비율은 --gauge-ratio(0~1)로 들어온다. */
.time-gauge__fill {
  position: absolute;
  left: 0;
  top: 0;
  width: calc(var(--gauge-ratio, 1) * 100%);
  height: 100%;
  transition: width 0.5s linear;
}

@media (width >= theme(--breakpoint-md)) {
  .time-gauge__fill {
    /* 위에서 아래로 줄어들려면 아래쪽에 붙어 자란다. */
    top: auto;
    bottom: 0;
    width: 100%;
    height: calc(var(--gauge-ratio, 1) * 100%);
    transition: height 0.5s linear;
  }
}

@media (prefers-reduced-motion: reduce) {
  .time-gauge__fill {
    transition: none;
  }
}
```

- [ ] **Step 7: 타입 검사와 테스트**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`
Expected: 타입 에러 없음, 테스트 전부 통과

- [ ] **Step 8: 린트**

Run: `npm run lint`
Expected: 새 에러 없음

- [ ] **Step 9: 커밋**

```bash
git add app/components/GameScreen.tsx app/globals.css
git commit -m "게임 HUD: Lv 칩·타이머 게이지·인디케이터 재배치, 폴라로이드 프레임 적용"
```

---

### Task 5: 단계 전환 연결

**Files:**
- Modify: `app/components/GameScreen.tsx`

**Interfaces:**
- Consumes: `.photo-swap__incoming`, `.photo-swap__outgoing` (Task 3)
- Produces: 없음

**배경:** `page.tsx:236`의 `key`가 단계마다 GameScreen을 리마운트한다. 그래서 "이전 화면 전체가 빠져나가는" 연출은 불가능하고, **이전 사진 URL만** 컴포넌트 안에서 짧게 붙잡아 둔다. 마커는 붙잡지 않는다 — 사진이 축소되는데 마커는 제자리 크기로 남아 분리돼 보이기 때문이다(스펙 §5.1).

- [ ] **Step 1: 이전 사진 URL을 붙잡는 상태 추가**

`GameScreen` 함수 본문의 `const [isHintOpen, setIsHintOpen] = useState(false);` (44줄) 다음에 추가:

```typescript
  // 단계 전환 연출용. 리마운트되므로 "이전 단계"가 아니라 **이 컴포넌트가 처음
  // 그려질 때 겹쳐 보여줄 직전 사진**을 page.tsx가 아니라 여기서 들고 있는다.
  //
  // prevSceneUrls가 null이면 전환 연출 없이 그냥 그린다(첫 단계 또는 연출 종료 후).
  const [prevSceneUrls, setPrevSceneUrls] = useState<{ left: string; right: string } | null>(null);
```

- [ ] **Step 2: 이전 사진을 모듈 스코프에 기억**

`GameScreen` 컴포넌트 **바깥**(24줄 `const FORCE_ADVANCE_DELAY_MS = 400;` 다음)에 추가:

```typescript
/**
 * 직전 단계의 장면 URL. 모듈 스코프에 두는 이유는 GameScreen이 단계마다
 * 리마운트되기 때문이다(page.tsx의 key). 컴포넌트 상태로는 이전 단계 값을
 * 넘겨받을 수 없다.
 *
 * page.tsx에 상태를 추가하지 않는 이유는 그쪽이 GameScreen 두 개를 동시에
 * 살리는 구조로 번지기 쉬워서다 — 그러면 타이머 effect와 onStageClear 콜백이
 * 둘씩 살아난다(useGameProgress.ts:111~114의 stale closure 주석 참고).
 */
let lastSceneUrls: { left: string; right: string } | null = null;
```

- [ ] **Step 3: 마운트 시 전환 시작, 0.3s 후 종료**

`useEffect` 블록들 사이(91줄 `}, []);` 다음)에 추가:

```typescript
  // 마운트 시점에 직전 단계 사진이 있으면 겹쳐 놓고 0.3s 뒤에 치운다.
  // CSS 애니메이션 duration(photo-swap-out)과 같은 값이어야 한다.
  useEffect(() => {
    const incoming = { left: session.leftSceneUrl, right: session.rightSceneUrl };
    const previous = lastSceneUrls;
    lastSceneUrls = incoming;

    // 같은 사진이면(첫 단계, 또는 리마운트가 단계 변경이 아닌 경우) 연출하지 않는다.
    if (!previous || (previous.left === incoming.left && previous.right === incoming.right)) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회, 외부(모듈 스코프) 값을 React로 들여오는 처리
    setPrevSceneUrls(previous);
    const timeoutId = setTimeout(() => setPrevSceneUrls(null), 300);
    return () => clearTimeout(timeoutId);
  }, [session.leftSceneUrl, session.rightSceneUrl]);
```

- [ ] **Step 4: 두 `<img>`에 전환 클래스와 이전 사진 레이어 추가**

Task 4에서 만든 왼쪽 `<div className="photo-frame__photo">` 안의 `<img>`를 아래로 교체:

```tsx
              {prevSceneUrls && (
                <img
                  src={prevSceneUrls.left}
                  alt=""
                  aria-hidden="true"
                  className="photo-swap__outgoing w-full h-full object-contain select-none"
                />
              )}
              <img
                src={session.leftSceneUrl}
                alt="Scene Left"
                className={`w-full h-full object-contain select-none pointer-events-none ${
                  prevSceneUrls ? "photo-swap__incoming" : ""
                }`}
                onLoad={handleImageLoad}
              />
```

오른쪽도 같은 방식으로 교체(`prevSceneUrls.right`, `session.rightSceneUrl`, `alt="Scene Right"`, `onLoad` 없음):

```tsx
              {prevSceneUrls && (
                <img
                  src={prevSceneUrls.right}
                  alt=""
                  aria-hidden="true"
                  className="photo-swap__outgoing w-full h-full object-contain select-none"
                />
              )}
              <img
                src={session.rightSceneUrl}
                alt="Scene Right"
                className={`w-full h-full object-contain select-none pointer-events-none ${
                  prevSceneUrls ? "photo-swap__incoming" : ""
                }`}
              />
```

- [ ] **Step 5: 타입 검사와 테스트**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`
Expected: 타입 에러 없음, 테스트 전부 통과

- [ ] **Step 6: 린트**

Run: `npm run lint`
Expected: 새 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add app/components/GameScreen.tsx
git commit -m "게임 HUD: 단계 전환 시 이전 사진 크로스페이드 연결"
```

---

### Task 6: 실제 화면 확인과 미세 조정

**Files:**
- Modify: `app/globals.css` (필요 시 수치만)

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 없음

**주의:** 이 태스크는 **단위 테스트로 검증할 수 없는 것**만 다룬다. 서버 두 개를 띄워야 한다 — `docs/local-test-setup.md`를 먼저 읽을 것. `gookbapgame` 단독으로는 시작 화면에서 "N단계 게임 데이터를 불러올 수 없습니다"가 뜬다.

- [ ] **Step 1: 서버 두 개 띄우기**

`docs/local-test-setup.md`의 절차를 따른다. `gookbapanalyze`(generate-unified API)와 `gookbapgame` 양쪽이 떠야 한다.

- [ ] **Step 2: 세로 화면(모바일 폭) 확인**

브라우저를 393px 폭(iPhone 16 Pro)으로 두고 확인:

- 그림 2장이 세로로 쌓이고 각각 폴라로이드 프레임 안에 있는가
- 하단 여백이 다른 세 변보다 눈에 띄게 두꺼운가(1.2배)
- 문항 인디케이터가 왼쪽 그림 아래, 오답 X가 오른쪽 그림 아래에 있는가
- 문항 5개인 단계에서 원이 5개만 보이되 **폭은 9칸 자리를 유지**하는가
- 힌트 `?`와 가로 게이지가 두 그림 사이에 있는가
- 게이지가 왼→오른쪽으로 줄어드는가

- [ ] **Step 3: 가로 화면(md 이상) 확인**

브라우저 폭을 1024px 이상으로 넓히고 확인:

- 그림 2장이 좌우로 놓이는가
- 힌트 `?`와 **세로** 게이지가 두 그림 사이에 있는가
- 게이지가 위→아래로 줄어드는가(모래시계)

- [ ] **Step 4: 단계 전환 확인**

한 단계를 클리어해서 다음 단계로 넘어갈 때:

- 프레임은 제자리에 있고 **안쪽 사진만** 갈리는가
- 새 사진이 위에서 아래로 내려오며 페이드인하는가
- 이전 사진이 축소되며 사라지는가
- 마커(정답 체크·오답 X)가 사진과 **함께 즉시** 사라지는가(따로 떠 있지 않은가)

- [ ] **Step 5: 판정이 깨지지 않았는지 확인**

- 정답 슬롯을 눌렀을 때 체크 마커가 **온전한 크기로** 뜨는가(잘리지 않았는가)
- 배경을 눌렀을 때 오답 X가 뜨고 카운트가 오르는가
- 슬롯 가장자리 바로 바깥(무판정 구역)을 눌렀을 때 **아무 일도 없는가**

- [ ] **Step 6: inset shadow 세기 조정**

가장자리 근처에 정답 슬롯이 있는 단계에서, 그림자가 판별을 방해하지 않는지 본다. 방해되면 `app/globals.css`의 `.photo-frame__photo`에서 `box-shadow`의 알파를 낮춘다(0.5 → 0.3). 반대로 질감이 안 보이면 3px → 4px까지 올린다.

- [ ] **Step 7: 하단 여백 조정(선택)**

폴라로이드 느낌이 약하면 `.photo-frame`의 `calc(var(--photo-pad) * 1.2)`에서 배수를 1.4까지 올려도 된다. **1.5를 넘기지 말 것** — 그림 영역이 깎여 56px 보정에 걸리는 슬롯이 늘어난다.

- [ ] **Step 8: 조정한 것이 있으면 커밋**

```bash
git add app/globals.css
git commit -m "게임 HUD: 실화면 확인 후 여백·그림자 수치 조정"
```

(조정할 것이 없었으면 이 단계는 건너뛴다.)

---

## Self-Review

**스펙 커버리지**

| 스펙 항목 | 담당 태스크 |
|---|---|
| §3 폴라로이드 프레임(각진 모서리, 흰 인화지, 하단 1.2배, drop/inset shadow) | Task 2, Task 6 |
| §4.1 Lv 칩 | Task 4 |
| §4.2 타이머 게이지(세로=가로바, 가로=세로바, 경고색) | Task 1, Task 4 |
| §4.3 힌트 버튼 이동 | Task 4 |
| §4.4 문항 인디케이터(상한 9, 초과 시 미절단) | Task 1, Task 4 |
| §4.5 배치(세로/가로) | Task 4 |
| §5 전환(0.3s 하향 크로스페이드, reduced-motion) | Task 3, Task 5 |
| §5.1 히트영역·마커 즉시 교체 | Task 5 (마커를 붙잡지 않음으로써 자동 충족) |
| §5.2 사진 영역 검은 배경 | Task 2 |
| §6 상태 스냅샷(사진 URL만) | Task 5 |
| §7 리마운트 계약 유지 | Global Constraints + Task 5 Step 2 주석 |
| §8 테스트 | Task 1(단위), Task 6(시각) |
| §9 i18n 키 추가 없음 | Global Constraints |

**타입 일관성**
- `resolveIndicatorCells` / `resolveGaugeRatio` / `isTimeCritical` — Task 1에서 정의, Task 4에서 같은 이름으로 소비. 일치.
- `IndicatorCell` 값 `"filled" | "empty" | "hidden"` — Task 1 테스트와 Task 4 마크업에서 같은 문자열 사용. 일치.
- `INDICATOR_SLOT_CAP` — `stageConfig.ts`에 정의, `hudIndicators.ts`가 import. 일치.
- `--gauge-ratio` CSS 변수 — Task 4 Step 4에서 인라인 스타일로 주고 Step 6 CSS가 읽는다. 일치.
- `.photo-swap__incoming` / `.photo-swap__outgoing` — Task 3에서 정의, Task 5에서 사용. 일치.

**알려진 위험**
- Task 4 Step 3의 JSX는 Step 4에서 통째로 대체된다(준비용). 실행자는 Step 3을 별도 편집으로 적용하지 말 것.
- `lastSceneUrls`가 모듈 스코프라 같은 탭에서 게임을 새로 시작하면 직전 게임의 마지막 사진이 남아 있다. 첫 단계에서 URL이 다르면 전환이 한 번 발생할 수 있는데, 연출일 뿐 상태에는 영향이 없다. 거슬리면 Task 6에서 확인 후 `stageNumber === 1`일 때 건너뛰는 조건을 추가한다.

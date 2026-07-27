# 프리로딩 로딩화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임 시작 시 레벨 1~7 전체 이미지를 전체화면 로딩화면에서 미리 불러온 뒤 플레이를 시작해, 스테이지 전환 중 이미지 로딩이 화면에 노출되지 않게 한다.

**Architecture:** `useGameProgress` 훅에 `"loading"` phase를 추가하고, 순수 함수 `preloadAllStages()`가 7단계 세션 데이터(DB 조회, 병렬)와 14장 이미지(동시 4개 제한 큐)를 게임 시작 전에 전부 확정한다. 스테이지 전환은 이후 이미 확정된 배열에서 꺼내 쓰는 동기 처리로 단순화된다. 부수적으로 `/api/scene`의 `fetchImageBuffer`가 파츠 단위로 실패 원인을 구분하도록 보강한다.

**Tech Stack:** Next.js 16.2.9 / React 19.2.4 (App Router, Server Actions), TypeScript, Node 내장 테스트 러너(`node --experimental-strip-types --test`, 커스텀 프레임워크 없음).

## Global Constraints

- 스펙 문서: `docs/superpowers/specs/2026-07-27-preload-loading-screen-design.md`
- `/api/scene`의 `Cache-Control: public, max-age=3600` 헤더는 이미 충분하므로 변경하지 않는다.
- 프리로드 이미지 동시성은 4로 고정한다(배치 대기가 아니라, 4개 워커가 큐에서 계속 다음 항목을 당겨오는 방식).
- 로딩화면 UI에는 진행률(숫자/프로그레스바)을 표시하지 않는다 — 스피너 + 고정 문구만.
- 스테이지 실패 후 재도전 시 재롤 없이 이미 프리로드된 동일 세트를 재사용한다.
- Node 테스트 러너로 직접 로드되는 파일(`app/lib/*.ts`)의 상대 import는 반드시 `.ts` 확장자를 명시한다. Next.js 번들러는 확장자 생략을 지원하지만, plain Node ESM 로더는 지원하지 않는다. `app/actions.ts`는 내부적으로 확장자 없는 `./lib/db` import를 쓰기 때문에 런타임으로 직접 import하면 깨진다 — 타입만 필요하면 `import type`을 써서 런타임 로드 자체를 소거해야 한다(이 패턴은 이미 검증됨).

---

### Task 1: `fetchImageBuffer` 추출 + 파츠 단위 에러 라벨링

**Files:**
- Create: `app/lib/fetchImageBuffer.ts`
- Test: `app/lib/fetchImageBuffer.test.ts`
- Modify: `package.json` (test 스크립트에 새 테스트 파일 추가)

**Interfaces:**
- Produces: `fetchImageBuffer(url: string, label: string): Promise<Buffer>` — 실패 시 `label`과 HTTP 상태코드를 포함한 `Error`를 던진다. Task 2(`route.ts`)가 이 함수를 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/fetchImageBuffer.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchImageBuffer } from "./fetchImageBuffer.ts";

test("fetchImageBuffer: 응답이 ok가 아니면 label과 상태코드를 포함한 에러를 던진다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchImageBuffer("https://example.com/missing.png", "part(slot=1, part=2)"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /part\(slot=1, part=2\)/);
        assert.match(err.message, /404/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchImageBuffer: 응답이 ok면 Buffer를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  const bytes = new Uint8Array([1, 2, 3]);
  globalThis.fetch = (async () => new Response(bytes)) as typeof fetch;
  try {
    const buffer = await fetchImageBuffer("https://example.com/ok.png", "base_image(1)");
    assert.deepEqual(Uint8Array.from(buffer), bytes);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --experimental-strip-types --test app/lib/fetchImageBuffer.test.ts`
Expected: FAIL — `Cannot find module './fetchImageBuffer.ts'` (아직 구현 파일 없음)

- [ ] **Step 3: 최소 구현 작성**

`app/lib/fetchImageBuffer.ts`:
```ts
export async function fetchImageBuffer(url: string, label: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${label} image (${res.status}): ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --experimental-strip-types --test app/lib/fetchImageBuffer.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: package.json test 스크립트에 추가**

`package.json`의 `"test"` 스크립트를 다음으로 교체(기존 항목 뒤에 이번 테스트 파일 추가):
```json
"test": "node --experimental-strip-types --test app/lib/composeScene.test.ts app/lib/stageConfig.test.ts app/lib/nickname.test.ts app/lib/gameSelection.test.ts app/lib/fetchImageBuffer.test.ts test/pipeline-visual.test.ts"
```

- [ ] **Step 6: 커밋**

```bash
git add app/lib/fetchImageBuffer.ts app/lib/fetchImageBuffer.test.ts package.json
git commit -m "feat: fetchImageBuffer를 파츠 단위 에러 라벨과 함께 추출"
```

---

### Task 2: `route.ts`가 `fetchImageBuffer`를 쓰도록 교체 + 실패 시 502 응답

**Files:**
- Modify: `app/api/scene/route.ts` (전체)

**Interfaces:**
- Consumes: `fetchImageBuffer(url, label): Promise<Buffer>` (Task 1)

- [ ] **Step 1: `route.ts` 전체를 아래 내용으로 교체**

```ts
import { NextRequest } from "next/server";
import { supabase } from "@/app/lib/db";
import { composeScene, ScenePart } from "@/app/lib/composeScene";
import { fetchImageBuffer } from "@/app/lib/fetchImageBuffer";

export async function GET(request: NextRequest) {
  const baseImageId = request.nextUrl.searchParams.get("base");
  const partsParam = request.nextUrl.searchParams.get("parts");

  if (!baseImageId || !partsParam) {
    return new Response("Missing base or parts query parameter", { status: 400 });
  }

  const slotPartPairs = partsParam.split(",").map((pair) => {
    const [slotId, partId] = pair.split(":").map(Number);
    return { slotId, partId };
  });

  if (slotPartPairs.some((p) => Number.isNaN(p.slotId) || Number.isNaN(p.partId))) {
    return new Response("Invalid parts format", { status: 400 });
  }

  const { data: baseImage, error: baseErr } = await supabase
    .from("base_images")
    .select("image_url")
    .eq("id", Number(baseImageId))
    .single();

  if (baseErr || !baseImage) {
    return new Response("Base image not found", { status: 404 });
  }

  // 같은 슬롯/파츠가 여러 쌍에서 재사용될 수 있으므로(예: 두 슬롯이 같은 category의
  // 같은 파츠를 가리키는 경우), 요청 개수와 결과 개수를 비교하지 않고 Set으로
  // "요청한 ID가 전부 결과에 존재하는지"만 확인한다 — 길이 비교는 중복 ID가 있을 때
  // .in()이 distinct 없이 매칭 행만 반환해 오탐 404를 낼 수 있다.
  const slotIds = [...new Set(slotPartPairs.map((p) => p.slotId))];
  const { data: slots, error: slotsErr } = await supabase
    .from("image_slots")
    .select("*")
    .in("id", slotIds);

  const foundSlotIds = new Set((slots ?? []).map((s) => s.id));
  if (slotsErr || !slots || slotIds.some((id) => !foundSlotIds.has(id))) {
    return new Response("One or more slots not found", { status: 404 });
  }

  const partIds = [...new Set(slotPartPairs.map((p) => p.partId))];
  const { data: partRows, error: partsErr } = await supabase
    .from("parts")
    .select("*")
    .in("id", partIds);

  const foundPartIds = new Set((partRows ?? []).map((p) => p.id));
  if (partsErr || !partRows || partIds.some((id) => !foundPartIds.has(id))) {
    return new Response("One or more parts not found", { status: 404 });
  }

  try {
    const baseImageBuffer = await fetchImageBuffer(
      baseImage.image_url,
      `base_image(${baseImageId})`
    );

    const sceneParts: ScenePart[] = await Promise.all(
      slotPartPairs.map(async ({ slotId, partId }) => {
        const slot = slots.find((s) => s.id === slotId)!;
        const part = partRows.find((p) => p.id === partId)!;
        const imageBuffer = await fetchImageBuffer(
          part.image_url,
          `part(slot=${slotId}, part=${partId})`
        );

        return {
          slotId,
          x: slot.x_coordinate,
          y: slot.y_coordinate,
          slotScale: slot.scale ?? 1.0,
          offsetX: part.offset_x ?? 0,
          offsetY: part.offset_y ?? 0,
          partScale: part.scale ?? 1.0,
          imageBuffer,
          zIndex: slot.z_index ?? 1,
        };
      })
    );

    const composed = await composeScene(baseImageBuffer, sceneParts);

    return new Response(new Uint8Array(composed), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown image composition error";
    console.error(`[/api/scene] Failed to compose scene (base=${baseImageId}):`, message);
    return new Response(`Failed to compose scene: ${message}`, { status: 502 });
  }
}
```

이 변경으로 파츠 하나가 fetch 실패해도 무차별 500 대신 어떤 라벨(`base_image(...)` 또는 `part(slot=..., part=...)`)이 문제인지 응답 바디에 남는 502가 뜬다.

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (route.ts 관련 타입 에러 없어야 함)

Route 핸들러 자체는 `next/server`의 `NextRequest`를 import하기 때문에 Node 테스트 러너로 직접 로드할 수 없다(Next.js 번들러 전용 모듈 해석 필요) — 기존 코드베이스에도 route 핸들러 자동 테스트 사례가 없다. 이 파일의 검증은 타입 체크 + Task 9의 수동 골든패스로 갈음한다.

- [ ] **Step 3: 커밋**

```bash
git add app/api/scene/route.ts
git commit -m "fix: fetchImageBuffer 실패를 파츠 단위로 구분하고 502로 응답"
```

---

### Task 3: 동시성 제한 큐 유틸리티

**Files:**
- Create: `app/lib/concurrencyLimit.ts`
- Test: `app/lib/concurrencyLimit.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `runWithConcurrencyLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void>` — `limit`개 워커가 `items` 큐에서 계속 다음 항목을 당겨 처리한다. `worker`가 하나라도 reject하면 그 시점 이후 새로 시작되지 않은 항목은 건너뛰고, 전체 `Promise`가 그 첫 에러로 reject된다. Task 4(`preloadGame.ts`)가 이 함수를 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/concurrencyLimit.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { runWithConcurrencyLimit } from "./concurrencyLimit.ts";

test("동시 실행 개수가 limit을 넘지 않고, 아이템이 충분하면 limit까지 올라간다", async () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  let active = 0;
  let peak = 0;
  await runWithConcurrencyLimit(items, 4, async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
  });
  assert.ok(peak <= 4, `peak concurrency ${peak}가 4를 넘으면 안됨`);
  assert.equal(peak, 4);
});

test("실패가 없으면 모든 아이템을 처리한다", async () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  const processed: number[] = [];
  await runWithConcurrencyLimit(items, 4, async (item) => {
    processed.push(item);
  });
  assert.deepEqual(processed.slice().sort((a, b) => a - b), items);
});

test("하나 실패하면 아직 시작 안 한 나머지는 처리되지 않고 전체가 reject된다", async () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  const started: number[] = [];
  await assert.rejects(
    () =>
      runWithConcurrencyLimit(items, 2, async (item) => {
        started.push(item);
        if (item === 0) throw new Error("boom");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }),
    /boom/
  );
  assert.ok(started.length < items.length, "일부 아이템은 시작되지 않아야 함");
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --experimental-strip-types --test app/lib/concurrencyLimit.test.ts`
Expected: FAIL — `Cannot find module './concurrencyLimit.ts'`

- [ ] **Step 3: 최소 구현 작성**

`app/lib/concurrencyLimit.ts`:
```ts
export async function runWithConcurrencyLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  let aborted = false;
  let firstError: unknown = null;

  async function runNext(): Promise<void> {
    if (aborted) return;
    const current = nextIndex++;
    if (current >= items.length) return;

    try {
      await worker(items[current]);
    } catch (err) {
      if (!aborted) {
        aborted = true;
        firstError = err;
      }
      return;
    }

    await runNext();
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));

  if (aborted) {
    throw firstError;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --experimental-strip-types --test app/lib/concurrencyLimit.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: package.json test 스크립트에 추가**

```json
"test": "node --experimental-strip-types --test app/lib/composeScene.test.ts app/lib/stageConfig.test.ts app/lib/nickname.test.ts app/lib/gameSelection.test.ts app/lib/fetchImageBuffer.test.ts app/lib/concurrencyLimit.test.ts test/pipeline-visual.test.ts"
```

- [ ] **Step 6: 커밋**

```bash
git add app/lib/concurrencyLimit.ts app/lib/concurrencyLimit.test.ts package.json
git commit -m "feat: 동시성 제한 큐 유틸리티 추가"
```

---

### Task 4: `preloadAllStages` 오케스트레이션

**Files:**
- Create: `app/lib/preloadGame.ts`
- Test: `app/lib/preloadGame.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `STAGE_CONFIG: StageDef[]` (`app/lib/stageConfig.ts`, 기존), `runWithConcurrencyLimit` (Task 3), `GameSession` 타입(`app/actions.ts`, 기존 — **타입만** 사용, 런타임 import 아님)
- Produces:
  - `type FetchSessionFn = (level: number, targetDiffCount: number) => Promise<GameSession | null>`
  - `type LoadImageFn = (url: string) => Promise<void>`
  - `type PreloadResult = { ok: true; sessions: GameSession[] } | { ok: false; error: string }`
  - `loadImageInBrowser(url: string): Promise<void>` — 브라우저 `Image()` 기반 기본 로더
  - `preloadAllStages(fetchSession: FetchSessionFn, loadImage?: LoadImageFn): Promise<PreloadResult>`
  - Task 6(`useGameProgress.ts`)이 `preloadAllStages(fetchGameData)` 형태로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/preloadGame.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGE_CONFIG } from "./stageConfig.ts";
import { preloadAllStages } from "./preloadGame.ts";

test("모든 레벨/이미지가 성공하면 세션 7개를 반환하고 이미지 14장을 전부 로드한다", async () => {
  const fakeSessions = STAGE_CONFIG.map((cfg) => ({
    level: cfg.level,
    leftSceneUrl: `/api/scene?level=${cfg.level}&side=left`,
    rightSceneUrl: `/api/scene?level=${cfg.level}&side=right`,
    slots: [],
  }));
  const loadedUrls: string[] = [];

  const result = await preloadAllStages(
    async (level) => fakeSessions.find((s) => s.level === level) ?? null,
    async (url) => {
      loadedUrls.push(url);
    }
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.sessions.length, STAGE_CONFIG.length);
  }
  assert.equal(loadedUrls.length, STAGE_CONFIG.length * 2);
});

test("특정 레벨 세션 조회가 null이면 실패로 처리하고 해당 레벨을 메시지에 포함한다", async () => {
  const result = await preloadAllStages(
    async (level) =>
      level === 3 ? null : { level, leftSceneUrl: "x", rightSceneUrl: "y", slots: [] },
    async () => {}
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /3단계/);
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
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --experimental-strip-types --test app/lib/preloadGame.test.ts`
Expected: FAIL — `Cannot find module './preloadGame.ts'`

- [ ] **Step 3: 최소 구현 작성**

`app/lib/preloadGame.ts`:
```ts
import { STAGE_CONFIG } from "./stageConfig.ts";
import { runWithConcurrencyLimit } from "./concurrencyLimit.ts";
import type { GameSession } from "../actions.ts";

export type FetchSessionFn = (
  level: number,
  targetDiffCount: number
) => Promise<GameSession | null>;

export type LoadImageFn = (url: string) => Promise<void>;

export type PreloadResult =
  | { ok: true; sessions: GameSession[] }
  | { ok: false; error: string };

const PRELOAD_IMAGE_CONCURRENCY = 4;

export function loadImageInBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${url}`));
    img.src = url;
  });
}

export async function preloadAllStages(
  fetchSession: FetchSessionFn,
  loadImage: LoadImageFn = loadImageInBrowser
): Promise<PreloadResult> {
  const sessions = await Promise.all(
    STAGE_CONFIG.map((cfg) => fetchSession(cfg.level, cfg.diffCount))
  );

  const missingIndex = sessions.findIndex((s) => s === null);
  if (missingIndex !== -1) {
    return {
      ok: false,
      error: `${STAGE_CONFIG[missingIndex].level}단계 게임 데이터를 불러오지 못했습니다.`,
    };
  }

  const confirmedSessions = sessions as GameSession[];
  const urls = confirmedSessions.flatMap((s) => [s.leftSceneUrl, s.rightSceneUrl]);

  try {
    await runWithConcurrencyLimit(urls, PRELOAD_IMAGE_CONCURRENCY, loadImage);
  } catch {
    return {
      ok: false,
      error: "이미지를 불러오는데 실패했습니다. 네트워크 상태를 확인해주세요.",
    };
  }

  return { ok: true, sessions: confirmedSessions };
}
```

`import type { GameSession } from "../actions.ts"`는 타입 전용이라 strip-types 단계에서 완전히 소거되며, `app/actions.ts`의 런타임 모듈(확장자 없는 `./lib/db` import 포함)을 실제로 로드하지 않는다 — 이미 별도로 검증됨.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --experimental-strip-types --test app/lib/preloadGame.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: package.json test 스크립트에 추가**

```json
"test": "node --experimental-strip-types --test app/lib/composeScene.test.ts app/lib/stageConfig.test.ts app/lib/nickname.test.ts app/lib/gameSelection.test.ts app/lib/fetchImageBuffer.test.ts app/lib/concurrencyLimit.test.ts app/lib/preloadGame.test.ts test/pipeline-visual.test.ts"
```

- [ ] **Step 6: 전체 테스트 스위트 통과 확인**

Run: `node --experimental-strip-types --test app/lib/composeScene.test.ts app/lib/stageConfig.test.ts app/lib/nickname.test.ts app/lib/gameSelection.test.ts app/lib/fetchImageBuffer.test.ts app/lib/concurrencyLimit.test.ts app/lib/preloadGame.test.ts test/pipeline-visual.test.ts`
Expected: PASS (35 tests: 기존 27 + 신규 8)

- [ ] **Step 7: 커밋**

```bash
git add app/lib/preloadGame.ts app/lib/preloadGame.test.ts package.json
git commit -m "feat: 레벨 1~7 세션+이미지를 미리 확정하는 preloadAllStages 추가"
```

---

### Task 5: `PreloadScreen` 컴포넌트

**Files:**
- Create: `app/components/PreloadScreen.tsx`

**Interfaces:**
- Consumes: 없음 (props만)
- Produces: `PreloadScreen({ loadError: string | null; onRetry: () => void }): JSX.Element`. Task 8(`page.tsx`)이 소비한다.

- [ ] **Step 1: 컴포넌트 작성**

`app/components/PreloadScreen.tsx`:
```tsx
"use client";

import PixelPanel from "./PixelPanel";

interface PreloadScreenProps {
  loadError: string | null;
  onRetry: () => void;
}

export default function PreloadScreen({ loadError, onRetry }: PreloadScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <PixelPanel size="card" className="max-w-sm w-full mx-4 text-center">
        {loadError ? (
          <>
            <p className="text-error mb-6 text-lg">{loadError}</p>
            <button
              onClick={onRetry}
              className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
            >
              다시 시도
            </button>
          </>
        ) : (
          <>
            <div className="animate-spin text-6xl mb-4">🍚</div>
            <p className="text-ink text-lg font-bold">국밥 준비 중...</p>
          </>
        )}
      </PixelPanel>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/components/PreloadScreen.tsx
git commit -m "feat: 전체화면 프리로드 로딩 컴포넌트 추가"
```

---

### Task 6: `useGameProgress` — loading phase + 세션 배열 프리로드

**Files:**
- Modify: `app/hooks/useGameProgress.ts` (전체)

**Interfaces:**
- Consumes: `preloadAllStages(fetchSession, loadImage?)` (Task 4), `fetchGameData` (기존 `app/actions.ts`)
- Produces: 훅 반환값에 `retryPreload: () => void` 추가, `GamePhase`에 `"loading"` 추가, `session`은 `sessions[stageIndex]`에서 파생. Task 8(`page.tsx`)이 소비한다. 기존 반환 필드(`phase`, `nickname`, `stageNumber`, `loadNonce`, `totalStages`, `timeLimitSec`, `session`, `isLoading`, `loadError`, `scoreBreakdown`, `gukbapTier`, `startGame`, `recordWrongTouch`, `handleStageClear`, `handleStageTimeout`, `advanceToNextStage`, `retryFromStageOne`, `proceedToWheel`, `proceedToDailyResult`, `resetToStart`, `regenerateNickname`)는 이름과 타입을 그대로 유지한다(단 `startGame`/`advanceToNextStage`/`retryFromStageOne`은 더 이상 `Promise`를 반환하지 않음 — 호출부는 반환값을 쓰지 않으므로 무해).

- [ ] **Step 1: `useGameProgress.ts` 전체를 아래 내용으로 교체**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchGameData, GameSession } from "../actions";
import { preloadAllStages } from "../lib/preloadGame";
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
  | "loading"
  | "playing"
  | "stageClear"
  | "stageFail"
  | "gameResult"
  | "wheel"
  | "dailyResult";

export function useGameProgress() {
  const [phase, setPhase] = useState<GamePhase>("start");
  const [nickname, setNickname] = useState<string>("");
  const [stageIndex, setStageIndex] = useState(0);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [remainingTimeByStage, setRemainingTimeByStage] = useState<number[]>([]);
  const [hadWrongTouch, setHadWrongTouch] = useState(false);
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);
  const [gukbapTier, setGukbapTier] = useState<GukbapTier | null>(null);

  const session = sessions[stageIndex] ?? null;

  useEffect(() => {
    setNickname(loadOrCreateNickname());
  }, []);

  const runPreload = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const result = await preloadAllStages(fetchGameData);
    setIsLoading(false);
    if (result.ok) {
      setSessions(result.sessions);
      setLoadNonce((n) => n + 1);
      setPhase("playing");
    } else {
      setLoadError(result.error);
    }
  }, []);

  const startGame = useCallback(() => {
    setPhase("loading");
    setStageIndex(0);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    setScoreBreakdown(null);
    setGukbapTier(null);
    void runPreload();
  }, [runPreload]);

  const retryPreload = useCallback(() => {
    void runPreload();
  }, [runPreload]);

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

  const advanceToNextStage = useCallback(() => {
    const nextIndex = stageIndex + 1;
    if (nextIndex < STAGE_CONFIG.length) {
      setStageIndex(nextIndex);
      setLoadNonce((n) => n + 1);
      setPhase("playing");
      return;
    }
    const breakdown = calcFinalScore(remainingTimeByStage, hadWrongTouch);
    setScoreBreakdown(breakdown);
    setGukbapTier(calcGukbapTier(breakdown.total));
    setPhase("gameResult");
  }, [stageIndex, remainingTimeByStage, hadWrongTouch]);

  const retryFromStageOne = useCallback(() => {
    setStageIndex(0);
    setRemainingTimeByStage([]);
    setHadWrongTouch(false);
    setLoadNonce((n) => n + 1);
    setPhase("playing");
  }, []);

  const proceedToWheel = useCallback(() => setPhase("wheel"), []);
  const proceedToDailyResult = useCallback(() => setPhase("dailyResult"), []);

  const resetToStart = useCallback(() => {
    setPhase("start");
    setStageIndex(0);
    setSessions([]);
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
    loadNonce,
    totalStages: STAGE_CONFIG.length,
    timeLimitSec: STAGE_CONFIG[stageIndex].timeLimitSec,
    session,
    isLoading,
    loadError,
    scoreBreakdown,
    gukbapTier,
    startGame,
    retryPreload,
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

`retryFromStageOne`과 `advanceToNextStage`는 더 이상 `fetchGameData`를 호출하지 않는다 — 이미 `sessions` 배열에 확정된 세션을 인덱스로 꺼내 쓰기 때문에 네트워크 호출도, 재롤도 없다(스펙의 "동일 세트 재사용" 결정 반영).

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 — 이 시점에 `page.tsx`/`StartScreen.tsx`가 아직 옛 시그니처(`isLoading`/`loadError` prop, `"loading"` 미처리)를 쓰고 있어서 타입 에러가 날 수 있다. Task 7~8에서 해소되므로, 여기서는 `useGameProgress.ts` 자체의 타입 에러(문법 오류, 존재하지 않는 필드 참조 등)만 없는지 확인하면 된다.

- [ ] **Step 3: 커밋**

```bash
git add app/hooks/useGameProgress.ts
git commit -m "feat: useGameProgress에 loading phase와 프리로드 세션 배열 도입"
```

---

### Task 7: `StartScreen` 단순화

**Files:**
- Modify: `app/components/StartScreen.tsx` (전체)

**Interfaces:**
- Produces: `StartScreen({ nickname, onRegenerateNickname, onStart }): JSX.Element` — `isLoading`/`loadError` prop 제거(로딩 상태는 이제 `PreloadScreen`이 전담).

- [ ] **Step 1: `StartScreen.tsx` 전체를 아래 내용으로 교체**

```tsx
"use client";

import PixelPanel from "./PixelPanel";

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
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
          다른그림찾기
        </h1>
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-ink">{nickname} 님 환영합니다</span>
          <button
            type="button"
            onClick={onRegenerateNickname}
            aria-label="닉네임 다시 생성"
            className="text-xl"
          >
            🔄
          </button>
        </div>
        <button
          onClick={onStart}
          className="pixel-mask-btn-solid w-full py-4 px-6 bg-accent text-accent-ink text-xl font-bold transition-opacity active:scale-95 mb-4"
        >
          게임 시작
        </button>
        <div className="flex gap-3 w-full">
          <PixelPanel size="btn" className="flex-1">
            <button type="button" className="w-full font-bold text-ink">내 결과</button>
          </PixelPanel>
          <PixelPanel size="btn" className="flex-1">
            <button type="button" className="w-full font-bold text-ink">랭킹</button>
          </PixelPanel>
        </div>
      </PixelPanel>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/components/StartScreen.tsx
git commit -m "refactor: StartScreen에서 isLoading/loadError 제거(PreloadScreen으로 이관)"
```

---

### Task 8: `page.tsx` 배선

**Files:**
- Modify: `app/page.tsx` (전체)

**Interfaces:**
- Consumes: `PreloadScreen` (Task 5), `useGameProgress`의 `phase === "loading"`, `retryPreload` (Task 6), `StartScreen` (Task 7)

- [ ] **Step 1: `page.tsx` 전체를 아래 내용으로 교체**

```tsx
"use client";

import StartScreen from "./components/StartScreen";
import PreloadScreen from "./components/PreloadScreen";
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
        />
      )}

      {game.phase === "loading" && (
        <PreloadScreen loadError={game.loadError} onRetry={game.retryPreload} />
      )}

      {(game.phase === "playing" ||
        game.phase === "stageClear" ||
        game.phase === "stageFail") &&
        game.session && (
          <div className={game.phase !== "playing" ? "blur-sm pointer-events-none" : undefined}>
            <GameScreen
              key={`${game.stageNumber}-${game.loadNonce}`}
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

`StageTransitionModal`의 `isLoading`/`loadError` prop은 선택적(optional)이므로 생략해도 된다 — 이제 이 경로들은 네트워크 호출이 없어 항상 즉시 완료되기 때문에 의미가 없어졌다(컴포넌트 자체는 수정하지 않음).

- [ ] **Step 2: 전체 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (Task 6~8이 모두 반영된 시점이라 이제 전체가 타입 정합해야 함)

- [ ] **Step 3: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: PreloadScreen을 loading phase에 배선"
```

---

### Task 9: 수동 골든패스 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 유닛 테스트 재확인**

Run: `npm test` (또는 `node --experimental-strip-types --test app/lib/*.test.ts test/pipeline-visual.test.ts`)
Expected: 전체 PASS

- [ ] **Step 2: 로컬 Supabase 기동 확인**

`gookbapgame/.env.local`이 `127.0.0.1:54321`을 가리키는지 확인하고, 로컬 Docker Supabase가 떠 있는지 확인([[project_gookbapgame_local_supabase_seed]] 참고 — 레벨 1~7 시드 데이터 이미 존재).

- [ ] **Step 3: 개발 서버 기동**

Run: `npm run dev`

- [ ] **Step 4: 정상 흐름 확인**

브라우저로 접속해:
1. "게임 시작" 클릭 → 즉시 전체화면 로딩화면(스피너 + "국밥 준비 중...")으로 전환되는지 확인
2. 로딩 완료 후 Stage 1 플레이 화면으로 전환되는지, 이때 이미지가 이미 다 로드되어 있어 로딩 지연이 안 보이는지 확인
3. Stage 1~7을 순서대로 클리어하며 스테이지 전환 시(다음 단계 진입) 이미지 로딩이 전혀 보이지 않는지 확인
4. Stage 7까지 클리어 후 게임결과 → 돌림판 → 오늘의결과까지 도달하는지 확인

- [ ] **Step 5: 재도전(스테이지 실패) 흐름 확인**

임의 스테이지에서 시간을 초과시켜(또는 오답 없이 대기) "재도전" 모달을 띄우고, 재도전 클릭 시:
1. 네트워크 탭에서 `fetchGameData`(서버 액션 호출) 재요청이 발생하지 않는지 확인
2. Stage 1의 이미지 조합이 최초 프리로드 때와 동일한지(같은 URL) 확인

- [ ] **Step 6: 프리로드 실패 흐름 확인**

브라우저 개발자도구 네트워크 탭에서 오프라인 모드를 켜고 "게임 시작" 클릭:
1. 로딩화면에 에러 문구 + "다시 시도" 버튼이 뜨는지 확인
2. 오프라인 모드를 끄고 "다시 시도" 클릭 시 정상적으로 로딩이 재시작되어 플레이 화면까지 도달하는지 확인

- [ ] **Step 7: `/api/scene` 502 응답 확인 (선택, 시간 되면)**

로컬 Supabase의 `parts` 테이블에서 임의 파츠 하나의 `image_url`을 일시적으로 존재하지 않는 URL로 바꾼 뒤 해당 조합을 요청해, 응답이 무차별 500이 아니라 502 + `part(slot=..., part=...)` 라벨이 포함된 바디로 오는지 확인. 확인 후 값을 원복한다.

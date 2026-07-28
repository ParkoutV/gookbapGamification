# /api/scene → /api/generate-unified 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gookbapgame`이 자체 sharp 합성(`/api/scene`) 대신, `gookbapanalyze`에 이미 구현된 캐시 기반 `/api/generate-unified` API를 호출해 좌/우 씬 이미지를 받아오도록 전환한다.

**Architecture:** `app/actions.ts`의 `fetchGameData`가 슬롯별 선택 결과를 `category_id` 키의 `imageSlots` 객체 2개(좌/우)로 만들어 새 헬퍼 `requestUnifiedImage`(`app/lib/generateUnified.ts`)를 통해 `GENERATE_UNIFIED_API_URL`로 병렬 POST한다. 응답 URL을 그대로 `leftSceneUrl`/`rightSceneUrl`로 쓴다. 이후 더 이상 쓰이지 않는 자체 합성 경로(`app/api/scene`, `composeScene.ts`, `fetchImageBuffer.ts`와 그 테스트, `pipeline-visual.test.ts`)를 제거한다.

**Tech Stack:** Next.js Route Handler / Server Action, `node:test`(내장 테스트 러너, `--experimental-strip-types`로 `.ts` 직접 실행), 전역 `fetch`.

## Global Constraints

- gookbapgame은 Supabase `ANON_KEY`만 사용한다(`SERVICE_ROLE_KEY` 사용 금지) — 이번 작업은 Supabase를 직접 호출하지 않고 외부 HTTP API만 호출하므로 이 정책과 무관하다.
- `image_slots`는 `base_image_id`당 `category_id`가 1:1이므로, `imageSlots` 객체는 `{ [category_id]: partId }` 형태로 키 충돌 없이 만들 수 있다.
- 신규 env var `GENERATE_UNIFIED_API_URL`(예: `https://<gookbapanalyze-domain>/api/generate-unified`, 전체 경로 포함)은 `process.env`에서 직접 읽는다. 실제 값은 이란토가 별도로 `.env.local`/Vercel에 채워 넣는다 — 이 플랜에서는 값을 채우지 않는다.
- 테스트는 `node --experimental-strip-types --test <파일...>`로 실행하며, `package.json`의 `test` 스크립트에 파일 경로를 명시적으로 나열해야 실행된다(glob 아님). 새 테스트 파일을 추가하거나 기존 파일을 지울 때마다 이 스크립트도 같이 갱신해야 한다.
- 기존 코드 스타일을 따른다: 세미콜론 사용, `"use server"` 액션 파일은 얇게 유지하고 로직은 `app/lib/*.ts`로 분리, 테스트는 `globalThis.fetch`를 몽키패치하는 기존 패턴(`app/lib/fetchImageBuffer.test.ts` 참고)을 그대로 따른다.

---

### Task 1: `requestUnifiedImage` 헬퍼 작성 (`app/lib/generateUnified.ts`)

**Files:**
- Create: `app/lib/generateUnified.ts`
- Create: `app/lib/generateUnified.test.ts`
- Modify: `package.json:10` (test 스크립트에 새 테스트 파일 추가)

**Interfaces:**
- Produces: `type ImageSlots = Record<number, number>` — key는 `category_id`, value는 `part.id`.
- Produces: `type GenerateUnifiedResult = { ok: true; url: string } | { ok: false; error: string }`
- Produces: `async function requestUnifiedImage(apiUrl: string, baseImageId: number, imageSlots: ImageSlots): Promise<GenerateUnifiedResult>` — Task 2가 이 시그니처로 호출한다.

- [ ] **Step 1: 베이스라인 확인 — 기존 테스트가 전부 통과하는지 먼저 확인**

Run: `npm test`
Expected: 기존 테스트(10개 파일) 전부 PASS. 실패하는 게 있으면 이 플랜을 시작하기 전에 먼저 원인을 확인할 것.

- [ ] **Step 2: 실패하는 테스트 작성 (`app/lib/generateUnified.test.ts`)**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { requestUnifiedImage } from "./generateUnified.ts";

const API_URL = "https://analyze.example.com/api/generate-unified";

test("requestUnifiedImage: 성공 응답이면 ok:true와 url을 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return new Response(
      JSON.stringify({ success: true, url: "https://storage.example.com/game_assets/unified_cache/base1_x.webp" }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const result = await requestUnifiedImage(API_URL, 1, { 1: 2, 2: 5 });
    assert.deepEqual(result, {
      ok: true,
      url: "https://storage.example.com/game_assets/unified_cache/base1_x.webp",
    });
    assert.equal(capturedInit?.method, "POST");
    assert.equal(
      (capturedInit?.headers as Record<string, string>)["Content-Type"],
      "application/json"
    );
    assert.deepEqual(JSON.parse(capturedInit?.body as string), {
      baseImageId: 1,
      imageSlots: { 1: 2, 2: 5 },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestUnifiedImage: API가 {error} JSON을 반환하면 그 메시지를 그대로 담는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Base image not found" }), { status: 404 })) as typeof fetch;

  try {
    const result = await requestUnifiedImage(API_URL, 999, { 1: 2 });
    assert.deepEqual(result, { ok: false, error: "Base image not found" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestUnifiedImage: fetch 자체가 실패하면(네트워크 오류) 에러 메시지를 담는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network unreachable");
  }) as typeof fetch;

  try {
    const result = await requestUnifiedImage(API_URL, 1, { 1: 2 });
    assert.deepEqual(result, { ok: false, error: "network unreachable" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestUnifiedImage: 200이지만 success/url이 없는 이상 응답이면 상태코드를 담은 에러를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;

  try {
    const result = await requestUnifiedImage(API_URL, 1, { 1: 2 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /200/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `node --experimental-strip-types --test app/lib/generateUnified.test.ts`
Expected: FAIL — `Cannot find module './generateUnified.ts'` (파일이 아직 없음)

- [ ] **Step 4: 최소 구현 작성 (`app/lib/generateUnified.ts`)**

```typescript
export type ImageSlots = Record<number, number>;

export type GenerateUnifiedResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function requestUnifiedImage(
  apiUrl: string,
  baseImageId: number,
  imageSlots: ImageSlots
): Promise<GenerateUnifiedResult> {
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseImageId, imageSlots }),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown fetch error" };
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: `Invalid JSON response (status ${res.status})` };
  }

  if (!res.ok || body?.success !== true || typeof body?.url !== "string") {
    const message = typeof body?.error === "string" ? body.error : `Unexpected response (status ${res.status})`;
    return { ok: false, error: message };
  }

  return { ok: true, url: body.url };
}
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `node --experimental-strip-types --test app/lib/generateUnified.test.ts`
Expected: PASS (4개 테스트 전부)

- [ ] **Step 6: `package.json`의 `test` 스크립트에 새 파일 추가**

`package.json:10`의 `"test"` 스크립트 문자열 안, `"app/lib/concurrencyLimit.test.ts"` 뒤에 `"app/lib/generateUnified.test.ts"`를 추가:

```json
"test": "node --experimental-strip-types --test app/lib/composeScene.test.ts app/lib/stageConfig.test.ts app/lib/nickname.test.ts app/lib/gameSelection.test.ts app/lib/fetchImageBuffer.test.ts app/lib/concurrencyLimit.test.ts app/lib/generateUnified.test.ts app/lib/preloadGame.test.ts app/lib/i18n/detectLocale.test.ts app/lib/i18n/translate.test.ts app/lib/i18n/gukbapTierKey.test.ts test/pipeline-visual.test.ts"
```

(이 시점엔 아직 `composeScene.test.ts`/`fetchImageBuffer.test.ts`/`pipeline-visual.test.ts`를 지우지 않았으니 그대로 둔다 — Task 3에서 제거한다.)

- [ ] **Step 7: 전체 테스트 실행해서 전부 통과 확인**

Run: `npm test`
Expected: 전체 PASS (기존 10개 + 신규 1개 = 11개 파일)

- [ ] **Step 8: 커밋**

```bash
git add app/lib/generateUnified.ts app/lib/generateUnified.test.ts package.json
git commit -m "feat: generate-unified API 호출 헬퍼 추가"
```

---

### Task 2: `fetchGameData`가 `/api/scene` 대신 `requestUnifiedImage`를 쓰도록 전환

**Files:**
- Modify: `app/actions.ts:1-139`

**Interfaces:**
- Consumes: `requestUnifiedImage(apiUrl: string, baseImageId: number, imageSlots: ImageSlots): Promise<GenerateUnifiedResult>` (Task 1에서 정의)
- `GameSession`/`GameSlot` 타입은 변경하지 않는다 — `leftSceneUrl`/`rightSceneUrl`은 여전히 `string`.

- [ ] **Step 1: `app/actions.ts` 수정**

상단 import에 추가 (`app/actions.ts:1-4`):

```typescript
"use server";

import { supabase } from "./lib/db";
import { clampDifferenceCount } from "./lib/gameSelection";
import { requestUnifiedImage, type ImageSlots } from "./lib/generateUnified";
```

`app/actions.ts:91-127`의 슬롯 루프 + URL 생성 블록을 다음으로 교체:

```typescript
    const slots: GameSlot[] = [];
    const leftImageSlots: ImageSlots = {};
    const rightImageSlots: ImageSlots = {};

    for (let i = 0; i < N; i++) {
      const slot = validSlots[i];
      const slotParts = validParts.filter((p) => p.category_id === slot.category_id);

      const isDifference = diffIndices.includes(i);
      let leftPart;
      let rightPart;

      if (isDifference && slotParts.length >= 2) {
        const shuffledSlotParts = [...slotParts].sort(() => 0.5 - Math.random());
        leftPart = shuffledSlotParts[0];
        rightPart = shuffledSlotParts[1];
      } else {
        const randomPart = slotParts[Math.floor(Math.random() * slotParts.length)];
        leftPart = randomPart;
        rightPart = randomPart;
      }

      slots.push({
        slotId: slot.id,
        x: slot.x_coordinate,
        y: slot.y_coordinate,
        slotScale: slot.scale ?? 1.0,
        isDifference: leftPart.id !== rightPart.id,
      });

      leftImageSlots[slot.category_id] = leftPart.id;
      rightImageSlots[slot.category_id] = rightPart.id;
    }

    const baseImageId = selectedBaseImage.id;

    const apiUrl = process.env.GENERATE_UNIFIED_API_URL;
    if (!apiUrl) {
      console.error("Missing GENERATE_UNIFIED_API_URL environment variable.");
      return null;
    }

    const [leftResult, rightResult] = await Promise.all([
      requestUnifiedImage(apiUrl, baseImageId, leftImageSlots),
      requestUnifiedImage(apiUrl, baseImageId, rightImageSlots),
    ]);

    if (!leftResult.ok || !rightResult.ok) {
      console.error(
        `[fetchGameData] generate-unified 호출 실패 (base=${baseImageId}): left=${
          leftResult.ok ? "ok" : leftResult.error
        }, right=${rightResult.ok ? "ok" : rightResult.error}`
      );
      return null;
    }

    return {
      level,
      leftSceneUrl: leftResult.url,
      rightSceneUrl: rightResult.url,
      slots,
    };
```

(이 블록은 기존 `app/actions.ts:129-134`의 `return` 문까지 대체한다. 그 아래 `catch` 블록은 그대로 둔다.)

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`ImageSlots`의 키가 `number`이지만 JS 객체 키는 런타임에 문자열로 저장됨 — `Record<number, number>`는 TypeScript가 허용하는 관용적 표현이라 문제 없음.)

- [ ] **Step 3: 전체 테스트 실행**

Run: `npm test`
Expected: 전부 PASS.

(참고: `fetchGameData` 자체를 좌/우 중 하나만 실패하는 시나리오까지 포함해 단위 테스트하려면 `supabase` 클라이언트를 모킹해야 하는데, 기존 코드베이스에 그런 패턴이 없다 — `gameSelection.test.ts`도 `fetchGameData`에서 추출된 순수 함수 `clampDifferenceCount`만 테스트한다. 이 관례를 따라 `requestUnifiedImage`(Task 1)만 단위 테스트하고, `fetchGameData`의 좌/우 조합 로직은 Step 4의 수동 확인 + 코드 리뷰로 검증한다.)

- [ ] **Step 4: (환경변수가 로컬에 설정되어 있다면) 수동 통합 확인**

`.env.local`에 `GENERATE_UNIFIED_API_URL`이 설정돼 있다면:

Run: `npm run dev`, 브라우저에서 게임 진입 → 좌/우 이미지가 정상 표시되는지, 개발자도구 Network 탭에서 이미지 URL이 `.../storage/v1/object/public/game_assets/unified_cache/...` 형태인지 확인.

설정돼 있지 않다면 이 단계는 건너뛰고 이란토에게 "로컬에 `GENERATE_UNIFIED_API_URL`을 채운 뒤 직접 확인해달라"고 알린다 — 이 값은 이 플랜 범위 밖에서 이란토가 채워 넣기로 했다.

- [ ] **Step 5: 커밋**

```bash
git add app/actions.ts
git commit -m "refactor: fetchGameData가 자체 합성 대신 generate-unified API를 호출하도록 전환"
```

---

### Task 3: 레거시 자체 합성 경로 제거

**Files:**
- Delete: `app/api/scene/route.ts`
- Delete: `app/lib/composeScene.ts`
- Delete: `app/lib/composeScene.test.ts`
- Delete: `app/lib/fetchImageBuffer.ts`
- Delete: `app/lib/fetchImageBuffer.test.ts`
- Delete: `test/pipeline-visual.test.ts`
- Delete: `test/fixtures/` (디렉터리 전체 — `pipeline-visual.test.ts` 전용 픽스처만 있음, Task 2 이전에 이미 확인함)
- Modify: `package.json` (`test` 스크립트, `dependencies`/`devDependencies`)

**Interfaces:** 없음 — 이 태스크는 순수 삭제이며, Task 2 완료 후 이 파일들을 참조하는 곳이 남아있지 않음을 전제로 한다.

- [ ] **Step 1: 참조가 정말 없는지 재확인**

Run: `grep -rln "composeScene\|fetchImageBuffer\|api/scene" app test --include="*.ts" --include="*.tsx"`
Expected: 이 태스크에서 지울 파일들 자신만 나와야 한다(`app/api/scene/route.ts`, `app/lib/composeScene.ts`, `app/lib/composeScene.test.ts`, `app/lib/fetchImageBuffer.ts`, `app/lib/fetchImageBuffer.test.ts`, `test/pipeline-visual.test.ts`). 다른 파일이 나오면 삭제를 멈추고 그 참조부터 처리한다.

- [ ] **Step 2: 파일 삭제**

```bash
git rm -r app/api/scene app/lib/composeScene.ts app/lib/composeScene.test.ts app/lib/fetchImageBuffer.ts app/lib/fetchImageBuffer.test.ts test/pipeline-visual.test.ts test/fixtures
```

- [ ] **Step 3: `package.json`의 `test` 스크립트에서 삭제된 파일 3개 제거**

`composeScene.test.ts`, `fetchImageBuffer.test.ts`, `test/pipeline-visual.test.ts`를 목록에서 빼고 나머지는 그대로 둔다:

```json
"test": "node --experimental-strip-types --test app/lib/stageConfig.test.ts app/lib/nickname.test.ts app/lib/gameSelection.test.ts app/lib/concurrencyLimit.test.ts app/lib/generateUnified.test.ts app/lib/preloadGame.test.ts app/lib/i18n/detectLocale.test.ts app/lib/i18n/translate.test.ts app/lib/i18n/gukbapTierKey.test.ts"
```

- [ ] **Step 4: `package.json`에서 더 이상 쓰이지 않는 의존성 제거**

`dependencies`에서 `"sharp": "^0.34.5"` 제거. `devDependencies`에서 `"pixelmatch": "^7.2.0"`, `"pngjs": "^7.0.0"`, `"@types/pngjs": "^6.0.5"` 제거.

- [ ] **Step 5: lockfile 갱신**

Run: `npm install`
Expected: `package-lock.json`이 갱신되고 에러 없이 완료됨.

- [ ] **Step 6: 전체 테스트 + 빌드 확인**

Run: `npm test`
Expected: 전부 PASS (8개 파일 — 삭제 후 남은 목록).

Run: `npx tsc --noEmit`
Expected: 에러 없음 (특히 `sharp`/`pixelmatch`/`pngjs` import가 남아있지 않은지 타입 체크로 재확인).

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "chore: 레거시 /api/scene 자체 합성 경로 및 관련 의존성 제거"
```

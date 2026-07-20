# 서버 측 이미지 합성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 다른그림찾기 게임에서 파츠 이미지가 개별적으로 로딩되며 "조립 과정"이 노출되는 문제를, 서버(Route Handler)에서 sharp로 배경+파츠를 픽셀 합성한 완성 이미지 1장을 온디맨드로 응답하는 방식으로 해결한다.

**Architecture:** `fetchGameData`(서버 액션)는 기존처럼 랜덤 조합을 결정하되, 파츠 개별 URL 대신 `/api/scene` Route Handler를 가리키는 쿼리 URL 2개(좌/우)만 클라이언트에 반환한다. Route Handler는 쿼리의 `slotId:partId` 조합으로 DB를 재조회하고, sharp로 대시보드 편집 화면과 동일한 CSS 파이프라인(object-contain fit → 중심기준 scale → offset → 슬롯 박스 클립)을 픽셀 연산으로 재현해 WebP를 응답한다. `GameScreen.tsx`는 완성 이미지 2장만 렌더링하고, 정답 판정용 투명 클릭 오버레이만 별도로 얹는다.

**Tech Stack:** Next.js 16 Route Handler, sharp 0.34 (이미지 합성), `node --test` + `node:assert` (테스트, 신규 의존성 없음), `pixelmatch` (신규 devDependency, 픽셀 diff 검증 전용), Playwright MCP (실측 검증용 스크린샷)

## Global Constraints

- 합성 해상도는 1200×800 고정 (native 해상도 변환 없음).
- 출력 포맷은 WebP.
- 좌표 계산은 `object-contain` fit → 중심기준 scale → offset 이동 → 슬롯 박스 클립 순서로, 대시보드(`gookbapanalyze/app/main/spot-difference/edit/[id]/page.tsx`)의 CSS 렌더링과 동일한 결과를 내야 한다.
- **배경(base) 이미지도 파츠와 동일하게 `object-contain`으로 1200×800 안에 배치한다 (강제로 늘리지 않는다).** `GameScreen.tsx`와 대시보드 편집 화면 둘 다 base `<img>`에 `object-contain`을 쓰고 있으므로(임의 비율의 base 업로드를 지원), sharp에서 `fit: "fill"`로 늘리면 base가 정확히 3:2가 아닐 때 CSS와 다른 픽셀 결과가 나온다. 반드시 `fit: "contain"`을 사용한다.
- Supabase 테이블 스키마, RLS 정책, `gookbapanalyze` 프로젝트는 변경하지 않는다.
- 영속 캐시(Storage 저장)는 이번 범위에 포함하지 않는다.
- 프론트엔드는 `ANON_KEY`만 사용한다 (`SUPABASE_URL`/`SUPABASE_ANON_KEY` 환경변수, `app/lib/db.ts`의 기존 `supabase` 클라이언트를 그대로 사용).
- 커스텀 `.mjs` 스크립트는 `/scripts/`에 두고 버전 관리 제외 대상이다 (`AGENTS.md`). 이번 계획에서는 해당 스크립트를 만들지 않는다.

---

## File Structure

- **Create** `app/lib/composeScene.ts` — 좌표 계산 순수 함수 + sharp 합성 함수. DB/네트워크 의존 없음(합성 함수는 이미 로드된 이미지 버퍼를 받는다).
- **Create** `app/lib/composeScene.test.ts` — `composeScene.ts`의 좌표 계산 단위 테스트.
- **Create** `app/api/scene/route.ts` — Route Handler. 쿼리 파싱 → DB 조회 → `composeScene.ts` 호출 → WebP 응답.
- **Modify** `app/actions.ts` — `GamePart`/`GameSession` 타입을 축소하고, 파츠 개별 URL 대신 `/api/scene` 쿼리 URL을 만들어 반환.
- **Modify** `app/components/GameScreen.tsx` — 파츠별 `<img>` 오버레이 렌더링 제거, 완성 이미지 2장 + 투명 클릭 오버레이로 교체.
- **Modify** `package.json` — `sharp`를 `dependencies`에 명시 추가(현재 간접 설치만 되어 있음), `pixelmatch`와 `pngjs`를 `devDependencies`에 추가, `"test": "node --test"` 스크립트 추가.
- **Create** (테스트 전용, 커밋 대상) `test/fixtures/dummy-base.png`(3:2), `test/fixtures/dummy-base-nonstandard.png`(5:4, 레터박스 검증용), `test/fixtures/dummy-part-a.png`(80×80, 좌상단만 마커가 있는 비대칭 이미지), `test/fixtures/reference-scene.html`, `test/fixtures/reference-scene-nonstandard-base.html` — 실측 검증용 정적 더미 이미지 및 정답 마크업.
- **Create** `test/pipeline-visual.test.ts` — Playwright로 캡처한 CSS 렌더링(리팩터링 전 `GameScreen.tsx` 마크업을 그대로 옮긴 것)과 sharp 합성 결과를 pixelmatch로 비교하는 실측 검증 테스트.

---

### Task 1: 좌표 계산 순수 함수

**Files:**
- Create: `app/lib/composeScene.ts`
- Test: `app/lib/composeScene.test.ts`

**Interfaces:**
- Produces:
  - `type PartPlacement = { x: number; y: number; slotScale: number; offsetX: number; offsetY: number; partScale: number; partNaturalWidth: number; partNaturalHeight: number; }`
  - `type PlacementResult = { left: number; top: number; width: number; height: number; clipLeft: number; clipTop: number; clipWidth: number; clipHeight: number; }`
  - `function computePlacement(p: PartPlacement): PlacementResult`

`computePlacement`는 스펙의 좌표 파이프라인(`B = 100*slotScale`, `fit = min(B/pw, B/ph)`, `w = pw*fit*partScale`, `h = ph*fit*partScale`, `left = x + (B-w)/2 + offsetX`, `top = y + (B-h)/2 + offsetY`)을 계산하고, 슬롯 박스 클립 영역(`clipLeft = x, clipTop = y, clipWidth = B, clipHeight = B`)도 함께 반환한다.

- [ ] **Step 1: Write the failing test**

`app/lib/composeScene.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePlacement } from "./composeScene";

test("정사각형 파츠, scale 1, offset 0 - 슬롯 박스에 꽉 참", () => {
  const result = computePlacement({
    x: 100,
    y: 50,
    slotScale: 1,
    offsetX: 0,
    offsetY: 0,
    partScale: 1,
    partNaturalWidth: 100,
    partNaturalHeight: 100,
  });
  assert.equal(result.width, 100);
  assert.equal(result.height, 100);
  assert.equal(result.left, 100);
  assert.equal(result.top, 50);
  assert.equal(result.clipLeft, 100);
  assert.equal(result.clipTop, 50);
  assert.equal(result.clipWidth, 100);
  assert.equal(result.clipHeight, 100);
});

test("가로가 긴 파츠 - object-contain으로 너비 기준 축소", () => {
  // B = 100*1.5 = 150, part는 200x100 (2:1) -> fit = min(150/200, 150/100) = 0.75
  // w = 200*0.75*1 = 150, h = 100*0.75*1 = 75
  const result = computePlacement({
    x: 0,
    y: 0,
    slotScale: 1.5,
    offsetX: 0,
    offsetY: 0,
    partScale: 1,
    partNaturalWidth: 200,
    partNaturalHeight: 100,
  });
  assert.equal(result.width, 150);
  assert.equal(result.height, 75);
  // 세로 중앙 정렬: top = y + (B-h)/2 = 0 + (150-75)/2 = 37.5
  assert.equal(result.left, 0);
  assert.equal(result.top, 37.5);
});

test("partScale 2배 - 중심 기준으로 확대되고 박스는 원래 크기로 클립됨", () => {
  // B = 100, part 100x100, fit = 1, partScale = 2 -> w = h = 200
  // left = x + (100-200)/2 + offsetX = x - 50 + offsetX
  const result = computePlacement({
    x: 10,
    y: 10,
    slotScale: 1,
    offsetX: 0,
    offsetY: 0,
    partScale: 2,
    partNaturalWidth: 100,
    partNaturalHeight: 100,
  });
  assert.equal(result.width, 200);
  assert.equal(result.height, 200);
  assert.equal(result.left, -40); // 10 - 50
  assert.equal(result.top, -40);
  // 클립 영역은 슬롯 박스 그대로 (확대된 파츠를 자름)
  assert.equal(result.clipLeft, 10);
  assert.equal(result.clipTop, 10);
  assert.equal(result.clipWidth, 100);
  assert.equal(result.clipHeight, 100);
});

test("offset 적용 - left/top에 그대로 더해짐", () => {
  const result = computePlacement({
    x: 100,
    y: 50,
    slotScale: 1,
    offsetX: 5,
    offsetY: -3,
    partScale: 1,
    partNaturalWidth: 100,
    partNaturalHeight: 100,
  });
  assert.equal(result.left, 105);
  assert.equal(result.top, 47);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/lib/composeScene.test.ts`
Expected: FAIL — `composeScene.ts` 모듈이 없거나 `computePlacement`가 export되지 않아 에러.

- [ ] **Step 3: Write minimal implementation**

`app/lib/composeScene.ts`:

```ts
export type PartPlacement = {
  x: number;
  y: number;
  slotScale: number;
  offsetX: number;
  offsetY: number;
  partScale: number;
  partNaturalWidth: number;
  partNaturalHeight: number;
};

export type PlacementResult = {
  left: number;
  top: number;
  width: number;
  height: number;
  clipLeft: number;
  clipTop: number;
  clipWidth: number;
  clipHeight: number;
};

export function computePlacement(p: PartPlacement): PlacementResult {
  const box = 100 * p.slotScale;
  const fit = Math.min(box / p.partNaturalWidth, box / p.partNaturalHeight);
  const width = p.partNaturalWidth * fit * p.partScale;
  const height = p.partNaturalHeight * fit * p.partScale;
  const left = p.x + (box - width) / 2 + p.offsetX;
  const top = p.y + (box - height) / 2 + p.offsetY;

  return {
    left,
    top,
    width,
    height,
    clipLeft: p.x,
    clipTop: p.y,
    clipWidth: box,
    clipHeight: box,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test app/lib/composeScene.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/lib/composeScene.ts app/lib/composeScene.test.ts
git commit -m "feat: 슬롯/파츠 좌표를 합성 배치값으로 변환하는 순수 함수 추가"
```

---

### Task 2: sharp 합성 함수

**Files:**
- Modify: `app/lib/composeScene.ts`
- Modify: `app/lib/composeScene.test.ts`
- Modify: `package.json` (sharp를 dependencies로 명시)

**Interfaces:**
- Consumes: Task 1의 `computePlacement`, `PartPlacement`
- Produces:
  - `type ScenePart = { slotId: number; x: number; y: number; slotScale: number; offsetX: number; offsetY: number; partScale: number; imageBuffer: Buffer; zIndex: number; }`
  - `async function composeScene(baseImageBuffer: Buffer, parts: ScenePart[]): Promise<Buffer>` — 1200×800 WebP 버퍼를 반환.

**Step 1 먼저: `package.json`에 `sharp` 의존성 명시.**

현재 `sharp`는 `image-size`의 간접 의존성으로만 `node_modules`에 존재한다(`npm install` 로그에서 확인됨). 직접 `import`하려면 `dependencies`에 명시해야 한다.

- [ ] **Step 1: sharp를 dependencies에 추가**

```bash
npm install sharp@^0.34.5
```

Run 후 `package.json`의 `dependencies`에 `"sharp": "^0.34.5"`가 추가됐는지 확인.

- [ ] **Step 2: Write the failing test**

`app/lib/composeScene.test.ts`에 추가 (파일 상단 import에 `composeScene` 추가):

```ts
import sharp from "sharp";
import { computePlacement, composeScene } from "./composeScene";

test("composeScene - 배경 위에 파츠를 합성해 1200x800 WebP를 만든다", async () => {
  const baseImageBuffer = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const redPartBuffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const result = await composeScene(baseImageBuffer, [
    {
      slotId: 1,
      x: 100,
      y: 100,
      slotScale: 1,
      offsetX: 0,
      offsetY: 0,
      partScale: 1,
      imageBuffer: redPartBuffer,
      zIndex: 1,
    },
  ]);

  const meta = await sharp(result).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 800);
  assert.equal(meta.format, "webp");

  // 파츠가 배치된 좌표(120,120)의 픽셀이 빨간색인지 확인
  const { data, info } = await sharp(result)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => {
    const idx = (y * info.width + x) * info.channels;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
  };
  const sampled = px(150, 150); // 슬롯 박스(100,100)-(200,200) 중앙
  assert.equal(sampled.r, 255);
  assert.equal(sampled.g, 0);
  assert.equal(sampled.b, 0);

  // 슬롯 박스 밖(0,0)은 배경색(흰색) 그대로
  const outside = px(5, 5);
  assert.equal(outside.r, 255);
  assert.equal(outside.g, 255);
  assert.equal(outside.b, 255);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test app/lib/composeScene.test.ts`
Expected: FAIL — `composeScene` is not exported.

- [ ] **Step 4: Write minimal implementation**

`app/lib/composeScene.ts`에 추가:

```ts
import sharp from "sharp";

export type ScenePart = {
  slotId: number;
  x: number;
  y: number;
  slotScale: number;
  offsetX: number;
  offsetY: number;
  partScale: number;
  imageBuffer: Buffer;
  zIndex: number;
};

const SCENE_WIDTH = 1200;
const SCENE_HEIGHT = 800;

export async function composeScene(
  baseImageBuffer: Buffer,
  parts: ScenePart[]
): Promise<Buffer> {
  // base도 파츠와 동일하게 object-contain으로 배치한다 (강제로 늘리지 않음).
  // fit:"fill"을 쓰면 base가 3:2가 아닐 때 CSS(object-contain) 렌더링과 어긋난다.
  const base = sharp(baseImageBuffer).resize(SCENE_WIDTH, SCENE_HEIGHT, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  const sortedParts = [...parts].sort((a, b) => a.zIndex - b.zIndex);

  const overlays = (
    await Promise.all(
      sortedParts.map(async (part) => {
        const meta = await sharp(part.imageBuffer).metadata();
        const naturalWidth = meta.width ?? 100;
        const naturalHeight = meta.height ?? 100;

        const placement = computePlacement({
          x: part.x,
          y: part.y,
          slotScale: part.slotScale,
          offsetX: part.offsetX,
          offsetY: part.offsetY,
          partScale: part.partScale,
          partNaturalWidth: naturalWidth,
          partNaturalHeight: naturalHeight,
        });

        const resizedPart = await sharp(part.imageBuffer)
          .resize(Math.round(placement.width), Math.round(placement.height))
          .toBuffer();

        // 슬롯 박스(overflow:hidden)로 클립: 확대된 파츠(partScale>1)는 박스 밖으로
        // 나가므로, 파츠와 박스의 교집합 영역만 잘라내 박스 좌표에 배치한다.
        // sharp의 composite는 overlay가 base 경계를 벗어나면 에러를 던지므로
        // (확대 시 left = x - (width-box)/2 는 거의 항상 음수), extract로 먼저
        // 보이는 영역만 잘라내는 방식이 유일하게 안전한 구현이다.
        const clipLeft = Math.round(placement.clipLeft);
        const clipTop = Math.round(placement.clipTop);
        const clipWidth = Math.round(placement.clipWidth);
        const clipHeight = Math.round(placement.clipHeight);

        const partLeft = Math.round(placement.left);
        const partTop = Math.round(placement.top);
        const partWidth = Math.round(placement.width);
        const partHeight = Math.round(placement.height);

        const extractLeft = Math.max(0, clipLeft - partLeft);
        const extractTop = Math.max(0, clipTop - partTop);
        const extractRight = Math.min(partWidth, clipLeft + clipWidth - partLeft);
        const extractBottom = Math.min(partHeight, clipTop + clipHeight - partTop);
        const extractWidth = Math.max(0, extractRight - extractLeft);
        const extractHeight = Math.max(0, extractBottom - extractTop);

        if (extractWidth === 0 || extractHeight === 0) {
          return null;
        }

        const visiblePart = await sharp(resizedPart)
          .extract({ left: extractLeft, top: extractTop, width: extractWidth, height: extractHeight })
          .toBuffer();

        return {
          input: visiblePart,
          left: clipLeft + extractLeft,
          top: clipTop + extractTop,
        };
      })
    )
  ).filter((overlay): overlay is { input: Buffer; left: number; top: number } => overlay !== null);

  return base.composite(overlays).webp().toBuffer();
}
```

- [ ] **Step 5: 확대(partScale > 1) 클리핑 케이스 테스트 추가 및 검증**

`app/lib/composeScene.test.ts`에 추가:

```ts
test("composeScene - partScale 2배로 확대된 파츠는 슬롯 박스 밖으로 나가지 않는다", async () => {
  const baseImageBuffer = await sharp({
    create: { width: 1200, height: 800, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
  })
    .png()
    .toBuffer();

  const redPartBuffer = await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();

  const result = await composeScene(baseImageBuffer, [
    {
      slotId: 1,
      x: 500,
      y: 400,
      slotScale: 1,
      offsetX: 0,
      offsetY: 0,
      partScale: 2, // 박스보다 커짐 -> 클립되어야 함
      imageBuffer: redPartBuffer,
      zIndex: 1,
    },
  ]);

  const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => {
    const idx = (y * info.width + x) * info.channels;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
  };

  // 슬롯 박스(500,400)-(600,500) 중앙은 빨간색
  assert.deepEqual(px(550, 450), { r: 255, g: 0, b: 0 });
  // 박스 밖(499, 400)은 배경(파란색) 그대로 - 확대된 파츠가 넘치지 않음
  assert.deepEqual(px(499, 400), { r: 0, g: 0, b: 255 });
});
```

Run: `node --test app/lib/composeScene.test.ts`
Expected: 모든 테스트 PASS (Step 4의 구현이 이미 `.extract()` 기반 클리핑을 쓰므로 추가 수정 없이 통과해야 한다).

- [ ] **Step 6: Commit**

```bash
git add app/lib/composeScene.ts app/lib/composeScene.test.ts package.json package-lock.json
git commit -m "feat: sharp 기반 씬 합성 함수 추가"
```

---

### Task 3: Route Handler — `/api/scene`

**Files:**
- Create: `app/api/scene/route.ts`

**Interfaces:**
- Consumes: Task 2의 `composeScene`, `ScenePart`; `app/lib/db.ts`의 `supabase` 클라이언트
- Produces: `GET /api/scene?base=<baseImageId>&side=left|right&parts=<slotId>:<partId>,<slotId>:<partId>,...` → `image/webp` 바이트 응답

**슬롯 z_index는 DB의 `image_slots.z_index` 컬럼 값을 그대로 사용한다** (`find_differences_db_schema.md`에 정의된 `DEFAULT 1` 컬럼).

- [ ] **Step 1: Route Handler 작성**

`app/api/scene/route.ts`:

```ts
import { NextRequest } from "next/server";
import { supabase } from "@/app/lib/db";
import { composeScene, ScenePart } from "@/app/lib/composeScene";

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

  const baseImageBuffer = await fetchImageBuffer(baseImage.image_url);

  const sceneParts: ScenePart[] = await Promise.all(
    slotPartPairs.map(async ({ slotId, partId }) => {
      const slot = slots.find((s) => s.id === slotId)!;
      const part = partRows.find((p) => p.id === partId)!;
      const imageBuffer = await fetchImageBuffer(part.image_url);

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

  return new Response(composed, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
```

**`immutable`을 쓰지 않는 이유:** URL은 `base_image_id`/`slot_id`/`part_id`만 인코딩하고, 파츠나 슬롯의 실제 이미지·좌표는 아니다. 관리자가 `gookbapanalyze` 대시보드에서 같은 `part_id`의 이미지 파일이나 좌표를 교체하면 URL은 그대로인데 내용이 바뀐다 — `immutable`(사실상 영구 캐시)을 쓰면 브라우저가 옛 이미지를 계속 서빙한다. `max-age=3600`(1시간) 정도로 짧게 잡아 최신 편집 반영과 캐시 이득 사이에서 균형을 맞춘다.

- [ ] **Step 2: 개발 서버로 수동 검증**

Run: `npm run dev`

로컬 Supabase 연결(`db.properties` 또는 `.env.local`의 `SUPABASE_URL`/`SUPABASE_ANON_KEY`)이 설정되어 있다면:

```bash
curl -I "http://localhost:3000/api/scene?base=1&side=left&parts=1:1"
```

Expected: 실제 DB에 해당 ID가 있으면 `Content-Type: image/webp`와 `Cache-Control` 헤더가 포함된 200 응답. ID가 없으면 404.

로컬 Supabase 연결이 없다면 이 스텝은 건너뛰고 Task 5(실측 검증)에서 더미 데이터로 검증한다.

```bash
curl -I "http://localhost:3000/api/scene"
```

Expected: `400 Missing base or parts query parameter` (연결 여부와 무관하게 검증 가능).

- [ ] **Step 3: Commit**

```bash
git add app/api/scene/route.ts
git commit -m "feat: 씬 합성 이미지를 응답하는 /api/scene Route Handler 추가"
```

---

### Task 4: `fetchGameData` 반환 타입 축소

**Files:**
- Modify: `app/actions.ts`

**Interfaces:**
- Consumes: 없음 (기존 Supabase 조회 로직 재사용)
- Produces:
  - `type GameSlot = { slotId: number; x: number; y: number; slotScale: number; isDifference: boolean; leftSceneUrl: string; rightSceneUrl: string; }` — **주의: `leftSceneUrl`/`rightSceneUrl`은 슬롯마다가 아니라 세션 전체에 1개씩만 필요하므로, 아래처럼 `GameSession` 레벨로 옮긴다.**
  - `type GameSlot = { slotId: number; x: number; y: number; slotScale: number; isDifference: boolean; }`
  - `type GameSession = { leftSceneUrl: string; rightSceneUrl: string; slots: GameSlot[]; }`
  - `async function fetchGameData(): Promise<GameSession | null>` (시그니처 유지)

**Step 1: 실패하는 부분 먼저 확인 — 기존 테스트 없음, 이 Task는 타입 변경이 컴파일 타임에 드러나므로 `tsc`로 검증한다.**

- [ ] **Step 1: 변경 전 타입체크 통과 확인 (베이스라인)**

Run: `npx tsc --noEmit`
Expected: 현재 코드 기준 에러 없음 (있다면 기존 에러 목록을 기록해두고, 이후 스텝에서 새로 생긴 에러만 비교).

- [ ] **Step 2: `app/actions.ts` 수정**

`app/actions.ts` 전체를 아래로 교체:

```ts
"use server";

import { supabase } from "./lib/db";

export type GameSlot = {
  slotId: number;
  x: number;
  y: number;
  slotScale: number;
  isDifference: boolean;
};

export type GameSession = {
  leftSceneUrl: string;
  rightSceneUrl: string;
  slots: GameSlot[];
};

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

    let selectedBaseImage = null;
    let validSlots: any[] = [];
    let validParts: any[] = [];

    // 2. Find the first base_image that meets the minimum requirements
    for (const base of shuffledBaseImages) {
      const { data: slots, error: slotsErr } = await supabase
        .from("image_slots")
        .select("*")
        .eq("base_image_id", base.id);

      if (slotsErr || !slots || slots.length === 0) continue;

      const categoryIds = slots.map((s) => s.category_id);

      const { data: parts, error: partsErr } = await supabase
        .from("parts")
        .select("*")
        .in("category_id", categoryIds);

      if (partsErr || !parts || parts.length === 0) continue;

      const currentValidSlots = slots.filter((slot) => {
        const slotParts = parts.filter((p) => p.category_id === slot.category_id);
        return slotParts.length >= 2;
      });

      if (currentValidSlots.length >= 1) {
        selectedBaseImage = base;
        validSlots = currentValidSlots;
        validParts = parts;
        break;
      }
    }

    if (!selectedBaseImage || validSlots.length === 0) {
      console.error("No valid base image found with at least 1 valid slot.");
      return null;
    }

    // 3. Determine differences
    const N = validSlots.length;
    const numDifferences = Math.max(1, Math.round(N * (2 / 3)));

    const diffIndices = [...Array(N).keys()].sort(() => 0.5 - Math.random()).slice(0, numDifferences);

    const slots: GameSlot[] = [];
    const leftPairs: string[] = [];
    const rightPairs: string[] = [];

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

      leftPairs.push(`${slot.id}:${leftPart.id}`);
      rightPairs.push(`${slot.id}:${rightPart.id}`);
    }

    const baseImageId = selectedBaseImage.id;
    const leftSceneUrl = `/api/scene?base=${baseImageId}&side=left&parts=${leftPairs.join(",")}`;
    const rightSceneUrl = `/api/scene?base=${baseImageId}&side=right&parts=${rightPairs.join(",")}`;

    return {
      leftSceneUrl,
      rightSceneUrl,
      slots,
    };
  } catch (error) {
    console.error("Error in fetchGameData:", error);
    return null;
  }
}
```

**변경 요지:** `isDifference` 판정을 기존의 `leftPart.image_url !== rightPart.image_url`(URL 문자열 비교)에서 `leftPart.id !== rightPart.id`(PK 비교)로 바꿨다 — 파츠 URL을 더 이상 클라이언트로 보내지 않으므로 서버 내부 판정도 더 안정적인 PK 비교를 쓰는 것이 자연스럽다. 동작은 동일하다(같은 파츠면 같은 URL이었으므로).

- [ ] **Step 3: 타입체크로 검증**

Run: `npx tsc --noEmit`
Expected: `app/components/GameScreen.tsx`에서 `session.parts`, `part.leftPartUrl` 등 삭제된 필드를 참조하는 에러가 발생함 (Task 5에서 해결). `app/actions.ts` 자체에는 새 에러가 없어야 한다.

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "refactor: fetchGameData가 파츠 개별 URL 대신 합성 씬 URL을 반환하도록 변경"
```

---

### Task 5: `GameScreen.tsx` 리팩터링

**Files:**
- Modify: `app/components/GameScreen.tsx`

**Interfaces:**
- Consumes: Task 4의 `GameSession { leftSceneUrl, rightSceneUrl, slots: GameSlot[] }`, `GameSlot { slotId, x, y, slotScale, isDifference }`

- [ ] **Step 1: `GameScreen.tsx` 전체를 아래로 교체**

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { GameSession } from "../actions";

interface GameScreenProps {
  session: GameSession;
  onSuccess: (timeElapsed: number) => void;
  onFail: () => void;
}

export default function GameScreen({ session, onSuccess, onFail }: GameScreenProps) {
  const [timeLeft, setTimeLeft] = useState(30);
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

  const timeElapsed = 30 - timeLeft;

  useEffect(() => {
    if (timeLeft <= 0) {
      onFail();
      return;
    }

    if (totalDifferences > 0 && foundSlots.size >= totalDifferences) {
      onSuccess(timeElapsed);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, foundSlots.size, onFail, onSuccess, timeElapsed]);

  const handleSlotClick = (slotId: number, isDifference: boolean) => {
    if (isDifference && !foundSlots.has(slotId)) {
      setFoundSlots((prev) => {
        const newSet = new Set(prev);
        newSet.add(slotId);
        return newSet;
      });
    }
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
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl font-bold">찾은 개수:</span>
          <div className="flex gap-1">
            {Array.from({ length: totalDifferences }).map((_, i) => (
              <div
                key={i}
                className={`w-6 h-6 md:w-8 md:h-8 rounded-full border-2 border-indigo-500 flex items-center justify-center ${i < foundSlots.size ? "bg-indigo-500 text-white" : "bg-transparent text-transparent"}`}
              >
                ✓
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl font-bold">남은 시간:</span>
          <span className={`text-2xl md:text-3xl font-extrabold ${timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-green-400"}`}>
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
    </div>
  );
}
```

**변경 요지:** 좌/우 각각 파츠별 `<img>` N개를 렌더링하던 것을, 완성된 씬 이미지 1장(`leftSceneUrl`/`rightSceneUrl`) + 투명 클릭 오버레이(`renderClickOverlays`, 좌우 공통 — 클릭 판정 좌표는 좌우 동일하므로 함수로 추출)로 교체했다. `next/image` import는 애초에 미사용이었으므로 제거.

- [ ] **Step 2: 타입체크로 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Lint 검증**

Run: `npm run lint`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add app/components/GameScreen.tsx
git commit -m "refactor: GameScreen이 파츠별 오버레이 대신 합성 씬 이미지를 렌더링하도록 변경"
```

---

### Task 6: 픽셀 파이프라인 실측 검증

**Files:**
- Create: `test/fixtures/dummy-base.png` (1200×800, 3:2 — 일반 케이스)
- Create: `test/fixtures/dummy-base-nonstandard.png` (1000×800, 5:4 — non-3:2 케이스, object-contain 레터박스 검증용)
- Create: `test/fixtures/dummy-part-a.png`
- Create: `test/fixtures/reference-scene.html`
- Create: `test/pipeline-visual.test.ts`
- Modify: `package.json` (devDependencies에 `pixelmatch`, `pngjs` 추가, `test` 스크립트 추가)

**목적:** Task 1~2에서 구현한 `computePlacement`/`composeScene`이, 실제 `GameScreen.tsx`가 그리던 CSS 렌더링과 동일한 결과를 내는지 실측으로 확인한다. 단위 테스트(Task 1, 2)는 손으로 계산한 기대값과 비교했을 뿐이라, 두 가지를 이 Task에서 별도로 검증한다: (a) 좌표 파이프라인이 실제 마크업과 일치하는가, (b) base 이미지가 정확히 3:2가 아닐 때도 CSS의 `object-contain`과 sharp의 `fit: "contain"`이 같은 레터박스 결과를 내는가.

**정답지는 새로 작성하지 않고, 리팩터링 전 `GameScreen.tsx`의 실제 슬롯/파츠 렌더링 마크업을 그대로 옮긴다 — CSS 계산을 재해석하지 않는다.** 이 Task는 Task 5(GameScreen 리팩터링) 이후에 실행되므로 해당 마크업은 이미 작업 트리에 없다. Task 5의 커밋에서 `git show <Task5의-커밋-해시>^:app/components/GameScreen.tsx` (또는 `git log --oneline`으로 Task 5 커밋 직전 커밋을 찾아 `git show <직전-커밋>:app/components/GameScreen.tsx`)로 리팩터링 전 원본을 확인할 수 있다. 아래 인용은 그 원본의 좌측 이미지 블록(슬롯 렌더링 부분)이며, Step 3의 HTML은 이 마크업의 CSS 클래스/인라인 스타일 값을 그대로 정적 CSS로 옮긴 것이다:

```jsx
<div className="relative ..." style={{ aspectRatio: '1200 / 800' }}>
  <img src={session.baseImageUrl} className="w-full h-full object-contain ..." />
  {session.parts.map((part) => (
    <div className="absolute cursor-pointer overflow-hidden" style={{
      left: `${part.x * scale}px`, top: `${part.y * scale}px`,
      width: `${100 * part.slotScale * scale}px`, height: `${100 * part.slotScale * scale}px`
    }}>
      <img src={part.leftPartUrl} className="w-full h-full object-contain ..." style={{
        transform: `translate(${part.leftOffsetX * scale}px, ${part.leftOffsetY * scale}px) scale(${part.leftPartScale})`
      }} />
    </div>
  ))}
</div>
```

`scale = 1`(컨테이너 너비 1200px)로 고정하면 이 마크업은 1200×800 좌표계와 1:1 대응한다. 이 구조를 그대로 정적 HTML로 옮긴다(재해석하지 않고 클래스/스타일 값만 등가 CSS로 치환).

**픽스처 설계 원칙 — 파트는 반드시 박스보다 작고 비대칭이어야 한다.** 파트가 슬롯 박스를 단색으로 꽉 채우면, 배치 공식이 틀려도(예: `scale`의 기준점을 중심이 아니라 좌상단으로 잘못 구현해도) 박스 안이 여전히 같은 단색으로 채워져 diff가 거의 0이 되어 버그를 놓친다. 아래 파트 이미지는 (a) 박스보다 작은 크기(`partScale=1`에서도 여백이 남게), (b) 좌상단에만 마커가 있는 비대칭 모양으로 만들어, 중심-기준 스케일/오프셋이 잘못되면 마커 위치가 눈에 띄게 어긋나 diff가 커지도록 한다.

- [ ] **Step 1: 더미 이미지 픽스처 생성**

```bash
mkdir -p test/fixtures
node -e "
const sharp = require('sharp');
(async () => {
  await sharp({ create: { width: 1200, height: 800, channels: 4, background: { r: 34, g: 139, b: 34, alpha: 1 } } })
    .png().toFile('test/fixtures/dummy-base.png');
  await sharp({ create: { width: 1000, height: 800, channels: 4, background: { r: 34, g: 139, b: 34, alpha: 1 } } })
    .png().toFile('test/fixtures/dummy-base-nonstandard.png');

  // 80x80 파트: 우하단 2/3은 투명, 좌상단 40x40만 crimson 마커.
  // 박스(120x120, contain 후 80x80)보다 작게 남겨 배치 오차가 초록 배경 위에 드러나게 하고,
  // 마커를 좌상단에만 둬 중심-기준 scale/offset이 틀리면 마커 위치가 어긋나도록 한다.
  const svg = Buffer.from(
    '<svg width=\"80\" height=\"80\" xmlns=\"http://www.w3.org/2000/svg\">' +
    '<rect width=\"80\" height=\"80\" fill=\"none\"/>' +
    '<rect x=\"0\" y=\"0\" width=\"40\" height=\"40\" fill=\"rgb(220,20,60)\"/>' +
    '</svg>'
  );
  await sharp(svg).png().toFile('test/fixtures/dummy-part-a.png');

  console.log('fixtures created');
})();
"
```

Expected 출력: `fixtures created`. 세 PNG 파일이 `test/fixtures/`에 생성됨. `dummy-base-nonstandard.png`는 1000×800(5:4 비율)로, 1200×800 씬에 `object-contain`/`fit:"contain"`으로 배치하면 좌우에 레터박스(빈 공간)가 생겨야 하는 케이스다. `dummy-part-a.png`는 80×80 투명 캔버스에 좌상단 40×40만 crimson인 비대칭 마커다.

- [ ] **Step 2: pixelmatch, pngjs를 devDependencies에 추가**

```bash
npm install --save-dev pixelmatch@^7 pngjs@^7
```

- [ ] **Step 3: `GameScreen.tsx` 마크업을 그대로 옮긴 정적 HTML 작성**

`test/fixtures/reference-scene.html` — 위에서 인용한 `GameScreen.tsx`의 실제 슬롯 렌더링 구조를 그대로 옮긴다(각 CSS 클래스가 무엇을 하는지는 원본 JSX 스타일 객체와 1:1 대응):

```html
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; }
  body { width: 1200px; height: 800px; }
  .scene { position: relative; width: 1200px; height: 800px; overflow: hidden; }
  .base { width: 100%; height: 100%; object-fit: contain; position: absolute; top: 0; left: 0; }
  .slot { position: absolute; overflow: hidden; }
  .part { width: 100%; height: 100%; object-fit: contain; }
</style>
</head>
<body>
  <div class="scene">
    <img class="base" src="dummy-base.png" />
    <!-- 슬롯: x=500, y=300, slotScale=1.2 -> box = 100*1.2 = 120x120 (GameScreen.tsx의 100*part.slotScale*scale 계산과 동일, scale=1).
         파트는 80x80(contain 후에도 80x80, 박스보다 작음) x partScale=1 -> 여전히 80x80로 박스 안에 여백이 남는다.
         offset(12px, -7px)까지 준 것은 중심-기준 배치가 틀리면 마커 위치가 눈에 띄게 어긋나게 하기 위함. -->
    <div class="slot" style="left: 500px; top: 300px; width: 120px; height: 120px;">
      <img class="part" src="dummy-part-a.png" style="transform: translate(12px, -7px) scale(1); transform-origin: center;" />
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 4: non-3:2 base용 정답 HTML 작성**

`test/fixtures/reference-scene-nonstandard-base.html` — Step 3과 동일한 구조에서 `base` src만 `dummy-base-nonstandard.png`로 교체 (파츠 슬롯은 생략, base 레터박스 검증에만 집중):

```html
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; }
  body { width: 1200px; height: 800px; }
  .scene { position: relative; width: 1200px; height: 800px; overflow: hidden; background: black; }
  .base { width: 100%; height: 100%; object-fit: contain; position: absolute; top: 0; left: 0; }
</style>
</head>
<body>
  <div class="scene">
    <img class="base" src="dummy-base-nonstandard.png" />
  </div>
</body>
</html>
```

`.scene`에 `background: black`을 준 것은 sharp 쪽 `composeScene`이 레터박스 영역을 투명(`alpha: 0`)으로 채우기 때문에, 비교 시 두 이미지 모두 같은 배경 위에서 레터박스 위치/크기를 볼 수 있게 하기 위함이다 — sharp 출력도 PNG로 변환할 때 검정 배경 위에 합성해서 비교한다(Step 6에서 처리).

- [ ] **Step 5: Playwright로 두 정답 스크린샷 캡처**

Playwright MCP(`mcp__playwright__browser_navigate`, `mcp__playwright__browser_resize`, `mcp__playwright__browser_take_screenshot`)를 사용해:
1. `mcp__playwright__browser_navigate`로 `file:///<repo-root>/test/fixtures/reference-scene.html` 열기
2. `mcp__playwright__browser_resize`로 뷰포트를 1200×800으로 고정
3. `mcp__playwright__browser_take_screenshot`으로 `test/fixtures/reference-scene-expected.png` 저장 (PNG)
4. 같은 방식으로 `reference-scene-nonstandard-base.html`을 열어 `test/fixtures/reference-scene-nonstandard-base-expected.png` 저장

Expected: 두 PNG 파일이 각각 1200×800 크기로 `test/fixtures/`에 생성됨. 이 두 파일은 결과물이므로 커밋 대상이다(Step 9).

- [ ] **Step 6: sharp 합성 결과와 비교하는 테스트 작성**

`test/pipeline-visual.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { composeScene } from "../app/lib/composeScene";

const FIXTURES = path.join(__dirname, "fixtures");

// 슬롯 박스(120x120=14,400px)가 전체 프레임(1200x800=960,000px)의 1.5%뿐이라,
// 전체 프레임 기준 diff 비율 예산을 넉넉하게 잡으면(예: 1%=9,600px) 박스 안 마커가
// 통째로 어긋나도 통과해버린다. 마커 크기(40x40=1,600px)의 절반 정도만 어긋나도
// 잡히도록 0.05%(=480px)로 좁게 잡는다.
const DIFF_RATIO_BUDGET = 0.0005;

async function diffAgainstExpected(expectedPath: string, composedWebp: Buffer, label: string) {
  assert.ok(
    fs.existsSync(expectedPath),
    `${expectedPath}가 없습니다. Task 6 Step 5의 Playwright 캡처를 먼저 실행하세요.`
  );

  // sharp 출력의 투명 레터박스 영역을 검정 배경 위에 합성해 정답 HTML의 검정 배경과 맞춘다.
  const composedOnBlack = await sharp({
    create: { width: 1200, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .composite([{ input: await sharp(composedWebp).png().toBuffer() }])
    .png()
    .toBuffer();

  const expected = PNG.sync.read(fs.readFileSync(expectedPath));
  const actual = PNG.sync.read(composedOnBlack);

  assert.equal(actual.width, expected.width, `${label}: 너비 불일치`);
  assert.equal(actual.height, expected.height, `${label}: 높이 불일치`);

  const diff = new PNG({ width: expected.width, height: expected.height });
  const diffPixelCount = pixelmatch(
    expected.data,
    actual.data,
    diff.data,
    expected.width,
    expected.height,
    { threshold: 0.15 }
  );

  fs.writeFileSync(path.join(FIXTURES, `diff-output-${label}.png`), PNG.sync.write(diff));

  const totalPixels = expected.width * expected.height;
  const diffRatio = diffPixelCount / totalPixels;

  assert.ok(
    diffRatio < DIFF_RATIO_BUDGET,
    `${label}: 픽셀 diff 비율이 ${(diffRatio * 100).toFixed(3)}%로 허용치(${(DIFF_RATIO_BUDGET * 100).toFixed(3)}%)를 초과했습니다. test/fixtures/diff-output-${label}.png를 확인하세요.`
  );
}

test("sharp 합성 결과가 CSS 렌더링(정답)과 픽셀 단위로 일치한다 - 3:2 base + 비대칭 파츠 1개", async () => {
  const baseImageBuffer = fs.readFileSync(path.join(FIXTURES, "dummy-base.png"));
  const partABuffer = fs.readFileSync(path.join(FIXTURES, "dummy-part-a.png"));

  const composedWebp = await composeScene(baseImageBuffer, [
    {
      slotId: 1,
      x: 500,
      y: 300,
      slotScale: 1.2,
      offsetX: 12,
      offsetY: -7,
      partScale: 1,
      imageBuffer: partABuffer,
      zIndex: 1,
    },
  ]);

  await diffAgainstExpected(
    path.join(FIXTURES, "reference-scene-expected.png"),
    composedWebp,
    "standard-base"
  );
});

test("sharp 합성 결과가 CSS 렌더링(정답)과 픽셀 단위로 일치한다 - non-3:2 base 레터박스", async () => {
  const baseImageBuffer = fs.readFileSync(path.join(FIXTURES, "dummy-base-nonstandard.png"));

  const composedWebp = await composeScene(baseImageBuffer, []);

  await diffAgainstExpected(
    path.join(FIXTURES, "reference-scene-nonstandard-base-expected.png"),
    composedWebp,
    "nonstandard-base"
  );
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --experimental-strip-types --test test/pipeline-visual.test.ts`

Expected: 두 테스트 모두 PASS. **FAIL할 경우**, 실패한 케이스에 대응하는 `test/fixtures/diff-output-<label>.png`를 열어 어긋난 영역을 확인한다:
- `standard-base` 케이스가 실패하면 `composeScene.ts`의 좌표 계산(Task 1) 또는 클리핑 로직(Task 2)을 diff가 보여주는 방향으로 수정한다.
- `nonstandard-base` 케이스가 실패하면 base의 `fit: "contain"` 처리(Global Constraints, Task 2 Step 4)를 다시 점검한다 — 레터박스 위치나 크기가 CSS와 다르다는 뜻이다.

이 실측 결과가 스펙의 수식보다 우선한다.

- [ ] **Step 8: self-test — 이 검증이 실제로 정렬 오류를 잡아내는지 확인**

이 테스트가 Task 6의 목적(정렬 오류 검출)을 실제로 수행하는지, 고의로 버그를 심어 FAIL하는지 확인한다. `app/lib/composeScene.ts`의 `computePlacement` 호출부에서 중심-기준 오프셋 계산을 잠시 좌상단-기준으로 바꾼다:

`app/lib/composeScene.ts`에서 아래 줄을 찾아:

```ts
const left = p.x + (box - width) / 2 + p.offsetX;
const top = p.y + (box - height) / 2 + p.offsetY;
```

임시로 이렇게 바꾼다 (중심 보정 `(box - width) / 2`, `(box - height) / 2`를 제거 — 좌상단 기준 배치로 고의 회귀):

```ts
const left = p.x + p.offsetX;
const top = p.y + p.offsetY;
```

Run: `node --experimental-strip-types --test test/pipeline-visual.test.ts`

Expected: `standard-base` 테스트가 **FAIL**해야 한다 (마커가 박스 내 다른 위치에 그려져 diff 예산 초과). FAIL하지 않는다면 diff 예산(`DIFF_RATIO_BUDGET`)이나 픽스처 파라미터가 여전히 정렬 오류를 못 잡는다는 뜻이므로, 마커를 더 크게 하거나 예산을 더 좁혀 다시 확인한다.

확인 후 `computePlacement`를 원래대로 되돌린다:

```ts
const left = p.x + (box - width) / 2 + p.offsetX;
const top = p.y + (box - height) / 2 + p.offsetY;
```

Run: `node --experimental-strip-types --test test/pipeline-visual.test.ts`
Expected: 다시 PASS. (이 Step은 코드에 남기지 않는 일회성 확인이므로 커밋 대상 변경 없음 — `git diff app/lib/composeScene.ts`로 원상복구 여부를 확인한다.)

- [ ] **Step 9: `package.json`에 test 스크립트 추가**

`package.json`의 `scripts`에 추가:

```json
"test": "node --experimental-strip-types --test app/lib/composeScene.test.ts test/pipeline-visual.test.ts"
```

- [ ] **Step 10: 전체 테스트 스위트 실행 및 fixture 커밋**

Run: `npm test`
Expected: 모든 테스트 PASS (Task 1, 2, 6의 테스트 전부).

```bash
git add test/ package.json package-lock.json
git commit -m "test: CSS 렌더링과 sharp 합성 결과를 픽셀 비교하는 실측 검증 추가"
```

---

### Task 7: 수동 통합 확인 (Supabase 연결이 있는 경우)

**Files:** 없음 (검증 전용, 코드 변경 없음)

로컬에 Supabase 접속 정보(`db.properties` 또는 `.env.local`의 `SUPABASE_URL`/`SUPABASE_ANON_KEY`)가 설정된 경우에만 진행한다. 설정이 없다면 이 Task는 건너뛰고 Task 6의 실측 검증 결과로 대체한다.

- [ ] **Step 1: 개발 서버 실행**

Run: `npm run dev`

- [ ] **Step 2: 브라우저에서 실제 게임 플레이**

`http://localhost:3000`에서 "게임 시작" 클릭 → 좌/우 이미지가 각각 완성된 상태로 한 번에 나타나는지 확인 (파츠가 하나씩 나타나는 "팝콘" 현상이 없어야 함).

- [ ] **Step 3: Storage 업로드 권한 이슈가 없는지 확인**

이번 구현은 Storage에 쓰지 않고 읽기만 하므로(배경/파츠 이미지 fetch), anon 권한 문제가 애초에 발생하지 않는다. 브라우저 개발자 도구 Network 탭에서 `/api/scene` 요청이 403 없이 200을 반환하는지만 확인한다.

- [ ] **Step 4: 정답 클릭 판정 확인**

다른 부분(파츠가 실제로 다른 슬롯)을 클릭했을 때 ✅ 표시가 뜨고 카운트가 올라가는지, 같은 부분을 클릭했을 때는 아무 반응이 없는지 확인.

이 Task는 커밋할 코드 변경이 없다 — 확인만 하고 다음으로 진행한다.

---

## Self-Review 결과

**Spec coverage:**
- "온디맨드 합성 + HTTP 캐싱" → Task 3 (`Cache-Control: public, max-age=3600` — 관리자 편집 반영을 위해 `immutable` 제외, advisor 검증 반영)
- "1200×800 고정 해상도" → Task 2 `composeScene`의 `SCENE_WIDTH`/`SCENE_HEIGHT` 상수, Global Constraints에 명시
- "WebP 출력" → Task 2 `.webp()`
- "CSS 파이프라인(object-contain fit + 중심 scale + 클립) 재현" → Task 1 `computePlacement`, Task 2 `composeScene`(base도 `fit:"contain"`으로 통일, `fit:"fill"` 사용 시 non-3:2 base에서 CSS와 어긋나는 문제를 advisor 검증에서 확인 후 수정)
- "픽셀 diff 실측 검증" → Task 6 (정답지는 리팩터링 전 `GameScreen.tsx` 마크업을 그대로 이관, non-3:2 base 케이스 포함, 비대칭 마커 픽스처로 정렬 오류가 실제로 diff를 발생시키는지 self-test로 확인)
- "슬롯:파츠 ID만 URL에, Route Handler가 DB 재조회" → Task 3, Task 4의 `leftPairs`/`rightPairs` 인코딩
- "Supabase 스키마/RLS/gookbapanalyze 불변" → 모든 Task에서 DB 쓰기 없음, 읽기 전용 쿼리만 사용
- "영속 캐시 제외" → Task 3에 Storage 쓰기 코드 없음, Global Constraints에 명시

**Placeholder scan:** 없음 — 모든 스텝에 실행 가능한 코드/명령이 포함됨.

**Type consistency:** `GameSession`/`GameSlot`이 Task 4(정의)와 Task 5(소비) 간에 필드명(`leftSceneUrl`, `rightSceneUrl`, `slots`, `slotId`, `x`, `y`, `slotScale`, `isDifference`)이 일치함. `ScenePart`가 Task 2(정의)와 Task 3(소비) 간에 필드명 일치함. `PartPlacement`/`PlacementResult`가 Task 1(정의)과 Task 2(소비) 간에 일치함.

**advisor 검증 이력 (2회):**
1차 검증에서 지적된 4건 모두 반영: (a) 정답지를 재작성이 아닌 실제 마크업 이관으로, (b) base 리사이즈를 `fit:"fill"`에서 `fit:"contain"`으로 (non-3:2 base fixture로 증거 확정), (c) `.extract()` 기반 클리핑을 처음부터 primary 구현으로, (d) `Cache-Control`에서 `immutable` 제거.
2차 검증에서 지적된 1건(파트가 슬롯을 단색으로 꽉 채워 정렬 오류가 diff에 드러나지 않는 문제) 반영: 파트 픽스처를 박스보다 작은 비대칭 마커로 교체, diff 예산을 1%에서 0.05%로 축소, Task 6 Step 8에 "고의로 정렬 로직을 망가뜨려 테스트가 FAIL하는지 확인 후 원복"하는 self-test 추가. 부수적으로 지적된 Route Handler의 `.in()` 길이 비교 오탐(중복 ID 시) 문제도 Task 3에서 Set 기반 존재 확인으로 수정.

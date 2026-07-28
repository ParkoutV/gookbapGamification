# 파츠 터치 히트 영역 실루엣화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 슬롯 클릭 오버레이의 `clip-path`를 `circle(50%)`에서 파츠 PNG의 실제 알파 실루엣 기반 `polygon(...)`으로 바꿔, 근접한 슬롯끼리 터치가 씹히는 문제를 해결한다.

**Architecture:** (1) 파츠 원본 PNG의 알파 채널에서 convex hull을 뽑아 "1×1 정사각 안에 contain-fit했을 때"의 정규화 좌표로 변환하는 순수 함수(이미지 자체에만 의존, 서버 인메모리 캐시 대상), (2) 그 hull을 슬롯의 실제 배치 수식(offsetX/offsetY/partScale/slotScale)으로 변환하는 순수 함수(슬롯 인스턴스마다 즉석 계산, 캐싱 불필요)로 나눈다. `app/actions.ts`가 좌/우 파츠 각각에 대해 이 두 함수를 호출해 `GameSlot`에 폴리곤을 채워 넣고, `GameScreen.tsx`는 좌/우 오버레이에 각각 다른 폴리곤을 적용한다.

**Tech Stack:** Next.js 16 / React 19 (기존), 신규 의존성 `pngjs`(순수 JS PNG 디코더, alpha 채널 raw 픽셀 추출용 — `sharp`는 이미 이 저장소의 자매 앱 `gookbapanalyze`에서만 쓰이며 `gookbapgame`에는 의도적으로 없으므로 재도입하지 않는다), Node 내장 테스트 러너(`node --experimental-strip-types --test`, 기존 관례와 동일).

## Global Constraints

- Supabase 스키마(마이그레이션) 변경 없음 — 기존 `parts.image_url`, `parts.offset_x`, `parts.offset_y`, `parts.scale` 컬럼만 읽는다.
- 실루엣 계산 결과는 서버 프로세스 인메모리(`Map`)에만 캐싱한다. 디스크 파일 캐시나 DB 캐시는 두지 않는다(배포 환경이 Vercel 서버리스라 인스턴스 간 파일시스템이 공유되지 않음).
- 알파 임계치는 16(0~255 스케일)으로 고정한다.
- 계산이 실패하거나 결과가 없으면 항상 기존 `circle(50%)`로 폴백한다 — 이 기능이 부분적으로 실패해도 게임이 깨지면 안 된다.
- 슬롯의 `isDifference`가 true면 좌/우 파츠가 다를 수 있으므로, 폴리곤은 슬롯당 좌/우 각각 독립적으로 계산한다.
- 배치 공식(반드시 `gookbapanalyze/utils/imageProcessor.ts`와 동일하게 유지):
  ```
  W = H = 100 * slotScale
  finalW = finalH = W * partScale
  left = slotX + offsetX + (W - finalW) / 2
  top  = slotY + offsetY + (H - finalH) / 2
  ```
  `offsetX`/`offsetY`는 절대 픽셀값이며 `slotScale`에 비례하지 않는다 — 정규화 계산 시 이 사실을 무시하면 안 된다.
- 이 저장소의 `AGENTS.md`에 따라 새 Next.js API를 쓰게 되는 경우 `node_modules/next/dist/docs/`를 먼저 확인한다(이번 계획은 기존 `"use server"` 액션과 클라이언트 컴포넌트만 수정하므로 해당 사항 없을 가능성이 높다).

---

### Task 1: Convex hull 유틸리티

**Files:**
- Create: `app/lib/convexHull.ts`
- Test: `app/lib/convexHull.test.ts`
- Modify: `package.json` (테스트 스크립트에 파일 추가)

**Interfaces:**
- Produces: `export type Point = { x: number; y: number }`, `export function convexHull(points: Point[]): Point[]` (Andrew's monotone chain, 3개 미만이면 입력을 그대로 반환, 일직선 위 점들은 양 끝만 남김)

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/convexHull.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { convexHull } from "./convexHull.ts";

test("convexHull: 사각형 네 꼭짓점 + 내부 점 하나 -> 내부 점은 제외한 4개 꼭짓점만 반환", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
    { x: 5, y: 5 },
  ];

  const hull = convexHull(points);

  assert.equal(hull.length, 4);
  const hasPoint = (x: number, y: number) => hull.some((p) => p.x === x && p.y === y);
  assert.ok(hasPoint(0, 0));
  assert.ok(hasPoint(0, 10));
  assert.ok(hasPoint(10, 10));
  assert.ok(hasPoint(10, 0));
  assert.ok(!hasPoint(5, 5));
});

test("convexHull: 완전히 일직선인 점들은 양 끝 2개로 축약된다", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ];

  const hull = convexHull(points);

  assert.equal(hull.length, 2);
});

test("convexHull: 점이 3개 미만이면 그대로 반환", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];

  assert.deepEqual(convexHull(points), points);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --experimental-strip-types --test app/lib/convexHull.test.ts`
Expected: FAIL (모듈 `./convexHull.ts`를 찾을 수 없음)

- [ ] **Step 3: 최소 구현 작성**

`app/lib/convexHull.ts`:
```ts
export type Point = { x: number; y: number };

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) {
    return [...points];
  }

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --experimental-strip-types --test app/lib/convexHull.test.ts`
Expected: PASS (3개 테스트 모두)

- [ ] **Step 5: package.json 테스트 스크립트에 등록**

`package.json`의 `scripts.test`에서 `app/lib/i18n/gukbapTierKey.test.ts` 뒤에 `app/lib/convexHull.test.ts`를 추가:
```json
"test": "node --experimental-strip-types --test app/lib/stageConfig.test.ts app/lib/nickname.test.ts app/lib/gameSelection.test.ts app/lib/concurrencyLimit.test.ts app/lib/generateUnified.test.ts app/lib/preloadGame.test.ts app/lib/i18n/detectLocale.test.ts app/lib/i18n/translate.test.ts app/lib/i18n/gukbapTierKey.test.ts app/lib/convexHull.test.ts"
```

- [ ] **Step 6: 커밋**

```bash
git add app/lib/convexHull.ts app/lib/convexHull.test.ts package.json
git commit -m "feat: convex hull 유틸리티 추가"
```

---

### Task 2: 알파 채널 raw 픽셀에서 실루엣 추출 (`extractSilhouetteFromRaw`)

**Files:**
- Create: `app/lib/hitPolygon.ts`
- Create: `app/lib/hitPolygon.test.ts`
- Modify: `package.json` (테스트 스크립트에 파일 추가)

**Interfaces:**
- Consumes: `convexHull(points: Point[]): Point[]`, `type Point` (Task 1, `./convexHull.ts`)
- Produces: `export type { Point }` (재수출), `export function extractSilhouetteFromRaw(width: number, height: number, data: Uint8Array | Buffer): Point[] | null` — 알파 임계치 16 이상인 픽셀만 모아 hull을 구하고, 원본 이미지의 종횡비 기준 1×1 정사각 안에 contain-fit했을 때의 정규화 좌표(0~1)로 변환. 불투명 픽셀이 3개 미만이거나 hull이 퇴화(2개 이하)하면 `null`.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/hitPolygon.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSilhouetteFromRaw } from "./hitPolygon.ts";

function makeRawAlpha(
  width: number,
  height: number,
  isOpaque: (x: number, y: number) => boolean
): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i + 3] = isOpaque(x, y) ? 255 : 0;
    }
  }
  return data;
}

test("extractSilhouetteFromRaw: 전부 투명하면 null 반환", () => {
  const data = makeRawAlpha(4, 4, () => false);
  assert.equal(extractSilhouetteFromRaw(4, 4, data), null);
});

test("extractSilhouetteFromRaw: 완전히 일직선인 불투명 픽셀 3개는 축약되어 null 반환", () => {
  const data = makeRawAlpha(4, 4, (x, y) => x === y && x < 3);
  assert.equal(extractSilhouetteFromRaw(4, 4, data), null);
});

test("extractSilhouetteFromRaw: 가로가 긴 이미지에서 사각 블록의 실루엣을 정규화된 좌표로 반환", () => {
  // width=8, height=4 (가로가 더 김) 안에서 x:2~5, y:1~2 블록만 불투명
  const data = makeRawAlpha(8, 4, (x, y) => x >= 2 && x <= 5 && y >= 1 && y <= 2);

  const hull = extractSilhouetteFromRaw(8, 4, data);

  assert.ok(hull !== null);
  assert.equal(hull!.length, 4);

  const expected = [
    { x: 0.25, y: 0.375 },
    { x: 0.625, y: 0.375 },
    { x: 0.25, y: 0.5 },
    { x: 0.625, y: 0.5 },
  ];
  for (const e of expected) {
    const found = hull!.some((p) => Math.abs(p.x - e.x) < 1e-9 && Math.abs(p.y - e.y) < 1e-9);
    assert.ok(found, `expected point (${e.x}, ${e.y}) not found in hull`);
  }
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --experimental-strip-types --test app/lib/hitPolygon.test.ts`
Expected: FAIL (모듈 `./hitPolygon.ts`를 찾을 수 없음)

- [ ] **Step 3: 최소 구현 작성**

`app/lib/hitPolygon.ts`:
```ts
import { convexHull, type Point } from "./convexHull.ts";

export type { Point };

const ALPHA_THRESHOLD = 16;

export function extractSilhouetteFromRaw(
  width: number,
  height: number,
  data: Uint8Array | Buffer
): Point[] | null {
  const opaquePoints: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha >= ALPHA_THRESHOLD) {
        opaquePoints.push({ x, y });
      }
    }
  }

  if (opaquePoints.length < 3) {
    return null;
  }

  const hull = convexHull(opaquePoints);
  if (hull.length < 3) {
    return null;
  }

  const maxDim = Math.max(width, height);
  const padX = (maxDim - width) / 2;
  const padY = (maxDim - height) / 2;

  return hull.map((p) => ({
    x: (p.x + padX) / maxDim,
    y: (p.y + padY) / maxDim,
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --experimental-strip-types --test app/lib/hitPolygon.test.ts`
Expected: PASS (3개 테스트 모두)

- [ ] **Step 5: package.json 테스트 스크립트에 등록**

`scripts.test`에 `app/lib/hitPolygon.test.ts` 추가:
```json
"test": "node --experimental-strip-types --test app/lib/stageConfig.test.ts app/lib/nickname.test.ts app/lib/gameSelection.test.ts app/lib/concurrencyLimit.test.ts app/lib/generateUnified.test.ts app/lib/preloadGame.test.ts app/lib/i18n/detectLocale.test.ts app/lib/i18n/translate.test.ts app/lib/i18n/gukbapTierKey.test.ts app/lib/convexHull.test.ts app/lib/hitPolygon.test.ts"
```

- [ ] **Step 6: 커밋**

```bash
git add app/lib/hitPolygon.ts app/lib/hitPolygon.test.ts package.json
git commit -m "feat: 알파 채널 raw 픽셀에서 실루엣 hull 추출 함수 추가"
```

---

### Task 3: 파츠 이미지 fetch + 실루엣 계산 + 인메모리 캐싱 (`getPartSilhouette`)

**Files:**
- Modify: `app/lib/hitPolygon.ts`
- Modify: `app/lib/hitPolygon.test.ts` (테스트 추가)
- Modify: `package.json` (의존성 추가)

**Interfaces:**
- Consumes: `extractSilhouetteFromRaw` (Task 2, 같은 파일 내부)
- Produces: `export async function getPartSilhouette(imageUrl: string, fetchImpl?: typeof fetch): Promise<Point[] | null>` — `image_url` 키로 결과(성공/실패 모두)를 모듈 스코프 `Map`에 캐싱

- [ ] **Step 1: pngjs 의존성 추가**

Run: `npm install pngjs @types/pngjs --save`

- [ ] **Step 2: 실패하는 테스트 작성**

`app/lib/hitPolygon.test.ts`에 다음을 추가(기존 import문에 `PNG`와 `getPartSilhouette` 추가):
```ts
import { PNG } from "pngjs";
```
```ts
import { extractSilhouetteFromRaw, getPartSilhouette } from "./hitPolygon.ts";
```

파일 하단에 추가:
```ts
function makePngBuffer(
  width: number,
  height: number,
  isOpaque: (x: number, y: number) => boolean
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) << 2;
      png.data[i] = 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
      png.data[i + 3] = isOpaque(x, y) ? 255 : 0;
    }
  }
  return PNG.sync.write(png);
}

test("getPartSilhouette: 정상 PNG를 가져오면 실루엣을 계산하고 캐싱한다", async () => {
  const pngBuffer = makePngBuffer(8, 4, (x, y) => x >= 2 && x <= 5 && y >= 1 && y <= 2);
  let fetchCount = 0;
  const fakeFetch = (async () => {
    fetchCount += 1;
    return {
      ok: true,
      arrayBuffer: async () =>
        pngBuffer.buffer.slice(pngBuffer.byteOffset, pngBuffer.byteOffset + pngBuffer.byteLength),
    };
  }) as unknown as typeof fetch;

  const first = await getPartSilhouette("test://fixture-1.png", fakeFetch);
  const second = await getPartSilhouette("test://fixture-1.png", fakeFetch);

  assert.ok(first !== null);
  assert.equal(first!.length, 4);
  assert.deepEqual(second, first);
  assert.equal(fetchCount, 1);
});

test("getPartSilhouette: fetch 실패 시 null을 반환하고 실패도 캐싱한다", async () => {
  let fetchCount = 0;
  const fakeFetch = (async () => {
    fetchCount += 1;
    return { ok: false } as Response;
  }) as unknown as typeof fetch;

  const first = await getPartSilhouette("test://fixture-2.png", fakeFetch);
  const second = await getPartSilhouette("test://fixture-2.png", fakeFetch);

  assert.equal(first, null);
  assert.equal(second, null);
  assert.equal(fetchCount, 1);
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `node --experimental-strip-types --test app/lib/hitPolygon.test.ts`
Expected: FAIL (`getPartSilhouette`가 정의되지 않음)

- [ ] **Step 4: 최소 구현 작성**

`app/lib/hitPolygon.ts`에 추가(파일 상단 import에 `PNG` 추가, 하단에 함수 추가):
```ts
import { PNG } from "pngjs";
```
```ts
const silhouetteCache = new Map<string, Point[] | null>();

export async function getPartSilhouette(
  imageUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<Point[] | null> {
  if (silhouetteCache.has(imageUrl)) {
    return silhouetteCache.get(imageUrl) ?? null;
  }

  let result: Point[] | null = null;
  try {
    const res = await fetchImpl(imageUrl);
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      const png = PNG.sync.read(buffer);
      result = extractSilhouetteFromRaw(png.width, png.height, png.data);
    }
  } catch {
    result = null;
  }

  silhouetteCache.set(imageUrl, result);
  return result;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --experimental-strip-types --test app/lib/hitPolygon.test.ts`
Expected: PASS (5개 테스트 모두 — Task 2의 3개 + 이번 2개)

- [ ] **Step 6: 커밋**

```bash
git add app/lib/hitPolygon.ts app/lib/hitPolygon.test.ts package.json package-lock.json
git commit -m "feat: 파츠 이미지 fetch 후 실루엣 계산 및 인메모리 캐싱 추가"
```

---

### Task 4: 슬롯 배치 수식 반영 좌표 변환 (`mapSilhouetteToSlot`)

**Files:**
- Modify: `app/lib/hitPolygon.ts`
- Modify: `app/lib/hitPolygon.test.ts` (테스트 추가)

**Interfaces:**
- Consumes: 없음(순수 산술, hull 좌표 배열만 입력으로 받음)
- Produces: `export type SlotPlacement = { offsetX: number; offsetY: number; partScale: number; slotScale: number }`, `export function mapSilhouetteToSlot(hull: Point[], placement: SlotPlacement): Point[]` — Global Constraints의 배치 공식을 반영해 hull을 슬롯 박스 기준 0~1 좌표로 변환(범위 밖 값은 clamp)

- [ ] **Step 1: 실패하는 테스트 작성**

`app/lib/hitPolygon.test.ts`의 import에 `mapSilhouetteToSlot` 추가:
```ts
import {
  extractSilhouetteFromRaw,
  getPartSilhouette,
  mapSilhouetteToSlot,
} from "./hitPolygon.ts";
```

파일 하단에 추가:
```ts
test("mapSilhouetteToSlot: offsetX/offsetY/partScale/slotScale을 반영해 정규화 좌표를 계산한다", () => {
  const hull = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
  const placement = { offsetX: 10, offsetY: 5, partScale: 0.5, slotScale: 1 };

  const result = mapSilhouetteToSlot(hull, placement);

  assert.deepEqual(result, [
    { x: 0.35, y: 0.3 },
    { x: 0.85, y: 0.8 },
  ]);
});

test("mapSilhouetteToSlot: 박스를 벗어나는 극단값은 0~1로 clamp된다", () => {
  const hull = [{ x: 0, y: 0 }];
  const placement = { offsetX: 1000, offsetY: -1000, partScale: 1, slotScale: 1 };

  const result = mapSilhouetteToSlot(hull, placement);

  assert.deepEqual(result, [{ x: 1, y: 0 }]);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --experimental-strip-types --test app/lib/hitPolygon.test.ts`
Expected: FAIL (`mapSilhouetteToSlot`이 정의되지 않음)

- [ ] **Step 3: 최소 구현 작성**

`app/lib/hitPolygon.ts` 하단에 추가:
```ts
export type SlotPlacement = {
  offsetX: number;
  offsetY: number;
  partScale: number;
  slotScale: number;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function mapSilhouetteToSlot(hull: Point[], placement: SlotPlacement): Point[] {
  const boxSize = 100 * placement.slotScale;
  const scale = placement.partScale;

  return hull.map((p) => ({
    x: clamp01(placement.offsetX / boxSize + (1 - scale) / 2 + p.x * scale),
    y: clamp01(placement.offsetY / boxSize + (1 - scale) / 2 + p.y * scale),
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --experimental-strip-types --test app/lib/hitPolygon.test.ts`
Expected: PASS (7개 테스트 모두)

- [ ] **Step 5: 커밋**

```bash
git add app/lib/hitPolygon.ts app/lib/hitPolygon.test.ts
git commit -m "feat: 슬롯 배치 수식을 반영해 실루엣을 정규화 좌표로 변환하는 함수 추가"
```

---

### Task 5: `app/actions.ts`에 좌/우 hit polygon 계산 연결

**Files:**
- Modify: `app/actions.ts:1-158`

**Interfaces:**
- Consumes: `getPartSilhouette(imageUrl: string): Promise<Point[] | null>`, `mapSilhouetteToSlot(hull: Point[], placement: SlotPlacement): Point[]`, `type Point`, `type SlotPlacement` (모두 Task 2~4, `./lib/hitPolygon.ts`)
- Produces: `GameSlot`에 `leftHitPolygon: Point[] | null`, `rightHitPolygon: Point[] | null` 필드 추가 — Task 6의 `GameScreen.tsx`가 이 필드를 사용

이 파일에는 이 저장소의 자동 테스트 러너로 실행 가능한 테스트가 없다(Supabase 실제 연결이 필요한 서버 액션이라 기존에도 단위 테스트 대상이 아니었음 — `app/actions.ts`에 대응하는 `.test.ts` 파일이 존재하지 않는 것으로 확인됨). 이 태스크는 `npm run build`의 타입체크와, Task 6 완료 후의 수동 브라우저 확인으로 검증한다.

- [ ] **Step 1: `GameSlot` 타입 확장**

`app/actions.ts:7-13`을 다음으로 교체:
```ts
export type GameSlot = {
  slotId: number;
  x: number;
  y: number;
  slotScale: number;
  isDifference: boolean;
  leftHitPolygon: Point[] | null;
  rightHitPolygon: Point[] | null;
};
```

파일 상단 import 블록(3-5줄 다음)에 추가:
```ts
import { getPartSilhouette, mapSilhouetteToSlot, type Point } from "./lib/hitPolygon";
```

- [ ] **Step 2: 좌/우 폴리곤 계산 헬퍼 추가**

`fetchGameData` 함수 선언 바로 앞(22줄 이전)에 추가:
```ts
type PartRow = {
  id: number;
  image_url: string;
  offset_x: number;
  offset_y: number;
  scale: number;
};

async function computeSlotPolygons(
  leftPart: PartRow,
  rightPart: PartRow,
  slotScale: number
): Promise<{ leftHitPolygon: Point[] | null; rightHitPolygon: Point[] | null }> {
  const leftHull = await getPartSilhouette(leftPart.image_url);
  const rightHull =
    rightPart.id === leftPart.id ? leftHull : await getPartSilhouette(rightPart.image_url);

  const leftHitPolygon = leftHull
    ? mapSilhouetteToSlot(leftHull, {
        offsetX: leftPart.offset_x,
        offsetY: leftPart.offset_y,
        partScale: leftPart.scale,
        slotScale,
      })
    : null;

  const rightHitPolygon = rightHull
    ? mapSilhouetteToSlot(rightHull, {
        offsetX: rightPart.offset_x,
        offsetY: rightPart.offset_y,
        partScale: rightPart.scale,
        slotScale,
      })
    : null;

  return { leftHitPolygon, rightHitPolygon };
}
```

- [ ] **Step 3: 슬롯 조립 루프를 폴리곤 계산이 포함되도록 교체**

`app/actions.ts:92-124`(기존 `const slots: GameSlot[] = []; ... }` 블록 전체)를 다음으로 교체:
```ts
    const leftImageSlots: ImageSlots = {};
    const rightImageSlots: ImageSlots = {};

    const slotBuilders: {
      slotId: number;
      x: number;
      y: number;
      slotScale: number;
      leftPart: PartRow;
      rightPart: PartRow;
    }[] = [];

    for (let i = 0; i < N; i++) {
      const slot = validSlots[i];
      const slotParts = validParts.filter((p) => p.category_id === slot.category_id);

      const isDifference = diffIndices.includes(i);
      let leftPart: PartRow;
      let rightPart: PartRow;

      if (isDifference && slotParts.length >= 2) {
        const shuffledSlotParts = [...slotParts].sort(() => 0.5 - Math.random());
        leftPart = shuffledSlotParts[0];
        rightPart = shuffledSlotParts[1];
      } else {
        const randomPart = slotParts[Math.floor(Math.random() * slotParts.length)];
        leftPart = randomPart;
        rightPart = randomPart;
      }

      slotBuilders.push({
        slotId: slot.id,
        x: slot.x_coordinate,
        y: slot.y_coordinate,
        slotScale: slot.scale ?? 1.0,
        leftPart,
        rightPart,
      });

      leftImageSlots[slot.category_id] = leftPart.id;
      rightImageSlots[slot.category_id] = rightPart.id;
    }

    const slots: GameSlot[] = await Promise.all(
      slotBuilders.map(async (builder) => {
        const { leftHitPolygon, rightHitPolygon } = await computeSlotPolygons(
          builder.leftPart,
          builder.rightPart,
          builder.slotScale
        );

        return {
          slotId: builder.slotId,
          x: builder.x,
          y: builder.y,
          slotScale: builder.slotScale,
          isDifference: builder.leftPart.id !== builder.rightPart.id,
          leftHitPolygon,
          rightHitPolygon,
        };
      })
    );
```

- [ ] **Step 4: 타입체크 확인**

Run: `npm run build`
Expected: 빌드 성공 (타입 에러 없음). 실제 Supabase 접속이 없어도 Next.js 빌드의 타입체크 단계에서 `app/actions.ts`의 타입 오류는 여기서 잡힌다.

- [ ] **Step 5: 커밋**

```bash
git add app/actions.ts
git commit -m "feat: fetchGameData에서 좌/우 파츠 hit polygon을 계산해 GameSlot에 포함"
```

---

### Task 6: `GameScreen.tsx`에서 좌/우 각각 다른 clip-path 적용

**Files:**
- Modify: `app/components/GameScreen.tsx:82-102, 132, 144`

**Interfaces:**
- Consumes: `GameSlot.leftHitPolygon`, `GameSlot.rightHitPolygon` (Task 5, `../actions`를 통해 이미 import된 `GameSession`/`GameSlot` 타입에 포함됨)

이 컴포넌트에도 자동 테스트 러너가 없다(이 저장소는 React 컴포넌트에 대한 테스트 하네스를 갖추고 있지 않음 — `@testing-library` 등 devDependency 없음, 기존 컴포넌트들도 전부 수동 확인으로만 검증됨). 이 태스크는 아래 수동 확인 절차로 검증한다.

- [ ] **Step 1: clip-path 빌더 헬퍼 + side 인자 추가**

`app/components/GameScreen.tsx:82-102`(`renderClickOverlays` 전체)를 다음으로 교체:
```tsx
  const buildClipPath = (polygon: { x: number; y: number }[] | null): string => {
    if (!polygon || polygon.length < 3) {
      return "circle(50%)";
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
```

- [ ] **Step 2: 좌/우 호출부에 side 전달**

`app/components/GameScreen.tsx:132`의 `{renderClickOverlays()}`(왼쪽 컨테이너, `leftSceneUrl` 바로 아래)를 `{renderClickOverlays("left")}`로 교체.

`app/components/GameScreen.tsx:144`의 `{renderClickOverlays()}`(오른쪽 컨테이너, `rightSceneUrl` 바로 아래)를 `{renderClickOverlays("right")}`로 교체.

- [ ] **Step 3: 타입체크 확인**

Run: `npm run build`
Expected: 빌드 성공 (타입 에러 없음)

- [ ] **Step 4: 로컬 개발 서버로 수동 확인**

Run: `npm run dev`

1. 로컬 Supabase(시딩 완료된 상태)로 게임을 시작해 아무 스테이지나 진입한다.
2. 브라우저 개발자도구로 슬롯 오버레이 div들의 `clip-path` 값을 확인해, `circle(50%)`가 아니라 `polygon(...)`으로 바뀐 슬롯이 있는지 확인한다(실루엣 계산이 성공한 파츠).
3. 슬롯 좌표가 근접/중첩하는 스테이지 콘텐츠에서, 겹치는 경계 부근을 클릭해 의도한 슬롯만 반응하는지 확인한다(이전에는 위 슬롯이 가로채던 지점).
4. `isDifference`가 true인 슬롯에서 좌측 장면과 우측 장면의 클릭 가능 영역 모양이 서로 다르게 나오는지(각각 다른 파츠 실루엣을 따라가는지) 확인한다.
5. 의도적으로 잘못된 `image_url`을 가진 파츠가 있다면(또는 네트워크를 잠깐 끊어 fetch를 실패시켜) 해당 슬롯이 `circle(50%)`로 정상 폴백하는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add app/components/GameScreen.tsx
git commit -m "feat: 좌/우 슬롯 오버레이에 파츠 실루엣 기반 clip-path 적용"
```

import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  extractSilhouetteFromRaw,
  getPartSilhouette,
  mapSilhouetteToSlot,
  pickPolygonSource,
} from "./hitPolygon.ts";

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

async function makeImageBuffer(
  width: number,
  height: number,
  isOpaque: (x: number, y: number) => boolean,
  format: "png" | "webp"
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[i + 3] = isOpaque(x, y) ? 255 : 0;
    }
  }
  const img = sharp(raw, { raw: { width, height, channels: 4 } });
  return format === "png" ? img.png().toBuffer() : img.webp().toBuffer();
}

function fetchReturning(buffer: Buffer, countRef: { count: number }): typeof fetch {
  return (async () => {
    countRef.count += 1;
    return {
      ok: true,
      arrayBuffer: async () =>
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    };
  }) as unknown as typeof fetch;
}

test("getPartSilhouette: 정상 PNG를 가져오면 실루엣을 계산하고 캐싱한다", async () => {
  const pngBuffer = await makeImageBuffer(8, 4, (x, y) => x >= 2 && x <= 5 && y >= 1 && y <= 2, "png");
  const countRef = { count: 0 };
  const fakeFetch = fetchReturning(pngBuffer, countRef);

  const first = await getPartSilhouette("test://fixture-1.png", fakeFetch);
  const second = await getPartSilhouette("test://fixture-1.png", fakeFetch);

  assert.ok(first !== null);
  assert.equal(first!.length, 4);
  assert.deepEqual(second, first);
  assert.equal(countRef.count, 1);
});

test("getPartSilhouette: WebP를 가져와도 실루엣을 계산한다", async () => {
  const webpBuffer = await makeImageBuffer(8, 4, (x, y) => x >= 2 && x <= 5 && y >= 1 && y <= 2, "webp");
  const countRef = { count: 0 };
  const fakeFetch = fetchReturning(webpBuffer, countRef);

  const result = await getPartSilhouette("test://fixture-webp.webp", fakeFetch);

  assert.ok(result !== null);
  assert.equal(result!.length, 4);
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

/**
 * "있고 없고" 차이 슬롯의 회귀 테스트(2026-08-14, 을숙도 산책로 제보).
 *
 * 없는 쪽 파트는 완전 투명이라 hull이 null인데, 그걸 그대로 흘리면
 * `resolveHitTargetBox`가 실루엣을 포기하고 슬롯 크기의 정사각형을 만든다.
 * 납작한 파트일수록 세로로 부풀어 이웃 슬롯을 덮는다.
 */
test("pickPolygonSource: 자기 실루엣이 있으면 자기 것을 쓴다", () => {
  const own = [{ x: 0, y: 0 }];
  const other = [{ x: 1, y: 1 }];
  const result = pickPolygonSource(own, other, "ownPlacement", "otherPlacement");

  assert.deepEqual(result, { hull: own, placement: "ownPlacement" });
});

test("pickPolygonSource: 투명한 면은 반대쪽 실루엣과 배치를 함께 빌려온다", () => {
  const other = [{ x: 1, y: 1 }];
  const result = pickPolygonSource(null, other, "ownPlacement", "otherPlacement");

  // 배치까지 반대쪽 것이어야 한다 — 투명 파트의 offset/scale은 화면에 아무것도
  // 그리지 않아 검증된 적이 없고, 어긋나면 히트 영역이 엉뚱한 자리에 생긴다.
  assert.deepEqual(result, { hull: other, placement: "otherPlacement" });
});

test("pickPolygonSource: 양쪽 다 없으면 null — 실루엣 추출이 실제로 실패한 경우다", () => {
  assert.equal(pickPolygonSource(null, null, "a", "b"), null);
});

test("pickPolygonSource: 차이 슬롯의 양쪽 면이 같은 실루엣을 갖는다", () => {
  // 한쪽만 물체가 있는 슬롯(을숙도 산책로). 양쪽 히트 모양이 같아야
  // 어느 면을 눌러도 같은 자리가 반응한다.
  const hull = [{ x: 0.1, y: 0.4 }, { x: 0.9, y: 0.4 }, { x: 0.9, y: 0.6 }];
  const placement = { offsetX: 0, offsetY: 0, partScale: 1, slotScale: 1 };

  const left = pickPolygonSource(hull, null, placement, placement);
  const right = pickPolygonSource(null, hull, placement, placement);

  assert.deepEqual(
    mapSilhouetteToSlot(left!.hull, left!.placement),
    mapSilhouetteToSlot(right!.hull, right!.placement)
  );
});

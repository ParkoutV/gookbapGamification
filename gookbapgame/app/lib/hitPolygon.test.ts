import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { convexHull } from "./convexHull.ts";
import {
  extractSilhouetteFromRaw,
  getPartSilhouette,
  mapSilhouetteToSlot,
  unionSlotPolygon,
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

/*
 * 열 극점 최적화가 **무손실**임을 잠근다(2026-08-19). 모든 불투명 픽셀로 만든 껍질과
 * 한 점도 달라선 안 된다 — 오목·구멍·비연결 같은 고약한 모양에서 특히 그렇다.
 * 근거는 `extractSilhouetteFromRaw` 주석에 있고, 여기서는 무식하게 다시 계산해 맞춘다.
 */
function hullFromEveryPixel(w: number, h: number, data: Buffer): string {
  const pts: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] >= 16) pts.push({ x, y });
  if (pts.length < 3) return "null";
  const hull = convexHull(pts);
  return hull.length < 3 ? "null" : hull.map((p) => `${p.x},${p.y}`).join(" ");
}

test("extractSilhouetteFromRaw: 열 극점만 써도 껍질이 전수 계산과 같다", () => {
  const S = 60;
  const shapes: [string, (x: number, y: number) => boolean][] = [
    ["초승달", (x, y) => Math.hypot(x - 30, y - 30) < 27 && Math.hypot(x - 39, y - 30) > 21],
    ["도넛", (x, y) => { const r = Math.hypot(x - 30, y - 30); return r < 27 && r > 15; }],
    ["ㄱ자", (x, y) => x < 18 || y > 42],
    ["흩어진 3덩어리", (x, y) =>
      Math.hypot(x - 8, y - 8) < 4 || Math.hypot(x - 52, y - 10) < 4 || Math.hypot(x - 30, y - 52) < 4],
    ["대각선 톱니", (x, y) => Math.abs(y - x) < 3 || (y > 45 && x % 5 < 3)],
  ];

  for (const [name, isOpaque] of shapes) {
    const data = makeRawAlpha(S, S, isOpaque);
    const hull = extractSilhouetteFromRaw(S, S, data);
    // 정규화를 되돌려 픽셀 좌표로 비교한다(정사각이라 maxDim = S, 패딩 0).
    const got = hull ? hull.map((p) => `${Math.round(p.x * S)},${Math.round(p.y * S)}`).join(" ") : "null";
    assert.equal(got, hullFromEveryPixel(S, S, data), name);
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
 * "있고 없고" 차이 슬롯의 회귀 테스트(2026-08-14 을숙도 산책로, 2026-08-19 주방 솥밥).
 *
 * 차이는 물체의 **존재 여부**라서 정답 자리는 "물체가 있는 자리"와 "없어진 자리"
 * 둘 다다. 한 면의 실루엣만 쓰면 없는 쪽에서 빈자리를 눌렀을 때 오답이 된다.
 */
const PLACEMENT = { offsetX: 0, offsetY: 0, partScale: 1, slotScale: 1 };

function bboxOf(polygon: { x: number; y: number }[]) {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

test("unionSlotPolygon: 한쪽이 완전 투명이면 반대쪽 실루엣이 그대로 쓰인다", () => {
  const hull = [
    { x: 0.1, y: 0.4 },
    { x: 0.9, y: 0.4 },
    { x: 0.9, y: 0.6 },
  ];

  const result = unionSlotPolygon(
    { hull, placement: PLACEMENT },
    { hull: null, placement: PLACEMENT }
  );

  assert.deepEqual(bboxOf(result!), bboxOf(mapSilhouetteToSlot(hull, PLACEMENT)));
});

test("unionSlotPolygon: 양쪽 다 없으면 null — 실루엣 추출이 실제로 실패한 경우다", () => {
  assert.equal(
    unionSlotPolygon({ hull: null, placement: PLACEMENT }, { hull: null, placement: PLACEMENT }),
    null
  );
});

/*
 * 주방 `솥밥_2_1`(284x110 전체 불투명) vs `솥밥_2_2`(x156~269만 불투명). 파트 한 장에
 * 물체가 둘 있고 그중 왼쪽 하나가 사라지는 차이다. 예전 `pickPolygonSource`는 자기
 * hull이 **null일 때만** 반대쪽을 빌려왔기 때문에 이 경우를 놓쳤고, 사라진 물체
 * 자리(x < 0.55)를 누르면 실루엣 바깥이라 곧장 오답이었다.
 */
test("unionSlotPolygon: 물체 하나만 사라지는 차이도 사라진 자리를 포함한다", () => {
  const bothPresent = [
    { x: 0.0, y: 0.4 },
    { x: 0.95, y: 0.4 },
    { x: 0.95, y: 0.6 },
    { x: 0.0, y: 0.6 },
  ];
  const oneMissing = [
    { x: 0.55, y: 0.4 },
    { x: 0.95, y: 0.4 },
    { x: 0.95, y: 0.6 },
    { x: 0.55, y: 0.6 },
  ];

  const result = unionSlotPolygon(
    { hull: oneMissing, placement: PLACEMENT },
    { hull: bothPresent, placement: PLACEMENT }
  );

  const box = bboxOf(result!);
  assert.equal(box.minX, 0, "사라진 물체 자리까지 덮어야 한다");
  assert.equal(box.maxX, 0.95);
});

test("unionSlotPolygon: 양쪽 면이 같은 폴리곤을 쓴다 — 인자 순서가 결과를 바꾸지 않는다", () => {
  const a = [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.4, y: 0.4 }];
  const b = [{ x: 0.6, y: 0.6 }, { x: 0.9, y: 0.6 }, { x: 0.9, y: 0.9 }];

  const left = unionSlotPolygon({ hull: a, placement: PLACEMENT }, { hull: b, placement: PLACEMENT });
  const right = unionSlotPolygon({ hull: b, placement: PLACEMENT }, { hull: a, placement: PLACEMENT });

  assert.deepEqual(bboxOf(left!), bboxOf(right!));
});

/*
 * 같은 슬롯이라도 파트마다 offset/scale이 다를 수 있다. 정규화 좌표에서 합치면
 * 서로 다른 기준끼리 섞이므로, 슬롯 좌표로 옮긴 **뒤에** 합쳐야 한다.
 */
test("unionSlotPolygon: 배치가 서로 다른 두 파트를 슬롯 좌표에서 합친다", () => {
  const hull = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

  const result = unionSlotPolygon(
    { hull, placement: { offsetX: 0, offsetY: 0, partScale: 0.5, slotScale: 1 } },
    { hull, placement: { offsetX: 40, offsetY: 0, partScale: 0.5, slotScale: 1 } }
  );

  const box = bboxOf(result!);
  assert.equal(box.minX, 0.25, "왼쪽 파트의 왼쪽 끝");
  assert.equal(box.maxX, 1, "오른쪽 파트가 40px 밀린 끝(0.75 + 0.4 = 1.15 → clamp)");
});

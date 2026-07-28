import { test } from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { extractSilhouetteFromRaw, getPartSilhouette } from "./hitPolygon.ts";

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

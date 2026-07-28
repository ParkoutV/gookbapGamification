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

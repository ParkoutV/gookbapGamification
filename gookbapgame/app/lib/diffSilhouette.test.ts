import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { extractDiffSilhouetteFromRaw, getDiffSilhouette } from "./diffSilhouette.ts";

const SIZE = 64;

/** RGBA 원본 버퍼. `paint`가 픽셀마다 [r,g,b,a]를 돌려준다(null이면 투명). */
function raw(paint: (x: number, y: number) => [number, number, number, number] | null): Buffer {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = paint(x, y);
      if (!px) continue;
      const i = (y * SIZE + x) * 4;
      buf[i] = px[0];
      buf[i + 1] = px[1];
      buf[i + 2] = px[2];
      buf[i + 3] = px[3];
    }
  }
  return buf;
}

const OPAQUE: [number, number, number, number] = [200, 200, 200, 255];
const RED: [number, number, number, number] = [255, 0, 0, 255];

const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) =>
  x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** 폴리곤을 픽셀 bbox로 되돌린다(0~1 정규화 → SIZE 기준). */
function bboxPx(polygon: { x: number; y: number }[]) {
  const xs = polygon.map((p) => p.x * SIZE);
  const ys = polygon.map((p) => p.y * SIZE);
  return {
    x0: Math.round(Math.min(...xs)),
    y0: Math.round(Math.min(...ys)),
    x1: Math.round(Math.max(...xs)),
    y1: Math.round(Math.max(...ys)),
  };
}

test("차이가 있는 자리만 폴리곤이 된다 — 파트 전체가 아니다", () => {
  // 양쪽 다 큰 물체(4~59)를 갖고 있고, 그중 작은 블록(40~55, 40~55)만 색이 다르다.
  const a = raw((x, y) => (inBox(x, y, 4, 4, 59, 59) ? OPAQUE : null));
  const b = raw((x, y) =>
    inBox(x, y, 40, 40, 55, 55) ? RED : inBox(x, y, 4, 4, 59, 59) ? OPAQUE : null
  );

  const hull = extractDiffSilhouetteFromRaw(SIZE, a, b);

  assert.ok(hull, "차이를 찾아야 한다");
  const box = bboxPx(hull!);
  // 침식으로 테두리 한 겹이 깎이므로 1px 여유를 둔다.
  assert.ok(box.x0 >= 40 && box.x0 <= 42, `왼쪽 ${box.x0}`);
  assert.ok(box.x1 >= 53 && box.x1 <= 55, `오른쪽 ${box.x1}`);
  assert.ok(box.y0 >= 40 && box.y0 <= 42, `위 ${box.y0}`);
  assert.ok(box.y1 >= 53 && box.y1 <= 55, `아래 ${box.y1}`);
});

test("물체가 통째로 사라진 차이도 그 자리를 잡는다", () => {
  const a = raw((x, y) => (inBox(x, y, 8, 8, 28, 28) ? OPAQUE : null));
  const b = raw(() => null);

  const hull = extractDiffSilhouetteFromRaw(SIZE, a, b);

  assert.ok(hull);
  const box = bboxPx(hull!);
  assert.ok(box.x0 >= 8 && box.x1 <= 28 && box.y0 >= 8 && box.y1 <= 28, JSON.stringify(box));
});

/*
 * 2026-08-19 실측으로 정한 방어 둘. 이 두 테스트가 임계값·침식·최소 덩어리의
 * 존재 이유다 — 하나라도 빼면 "눈에는 같은 그림"이 차이로 잡혀 엉뚱한 자리가
 * 정답이 된다.
 */
test("흩뿌려진 노이즈는 차이로 치지 않는다", () => {
  const a = raw((x, y) => (inBox(x, y, 4, 4, 59, 59) ? OPAQUE : null));
  // 3픽셀마다 한 점씩 흔든다 — 개수는 많아도 덩어리가 되지 않는다.
  const b = raw((x, y) =>
    inBox(x, y, 4, 4, 59, 59) ? (x % 3 === 0 && y % 3 === 0 ? RED : OPAQUE) : null
  );

  assert.equal(extractDiffSilhouetteFromRaw(SIZE, a, b), null);
});

test("1픽셀 밀린 그림은 차이로 치지 않는다 — 침식이 윤곽 리본을 지운다", () => {
  const a = raw((x, y) => (inBox(x, y, 4, 4, 59, 59) ? OPAQUE : null));
  const b = raw((x, y) => (inBox(x, y, 5, 4, 60, 59) ? OPAQUE : null));

  assert.equal(extractDiffSilhouetteFromRaw(SIZE, a, b), null);
});

/*
 * 배치(offset/scale)를 반영해 **슬롯 좌표에서** 빼는지 본다. 같은 슬롯이라도 파트마다
 * offset이 다를 수 있어, 원본끼리 빼면 어긋난 자리가 차이로 잡힌다.
 */
test("getDiffSilhouette: 배치를 반영해 슬롯 좌표에서 뺀다", async () => {
  const png = async (paint: (x: number, y: number) => boolean) =>
    sharp(raw((x, y) => (paint(x, y) ? OPAQUE : null)), {
      raw: { width: SIZE, height: SIZE, channels: 4 },
    })
      .png()
      .toBuffer();

  const filled = await png(() => true);
  const holed = await png((x, y) => !inBox(x, y, 0, 0, 31, 31)); // 왼쪽 위 4분면이 없다

  const fakeFetch = (async (url: string) =>
    ({
      ok: true,
      arrayBuffer: async () => (url === "a" ? filled : holed),
    }) as unknown as Response) as unknown as typeof fetch;

  const placement = { offsetX: 0, offsetY: 0, partScale: 1, slotScale: 1 };
  const hull = await getDiffSilhouette(
    { imageUrl: "a", placement },
    { imageUrl: "b", placement },
    fakeFetch,
    SIZE
  );

  assert.ok(hull, "사라진 4분면을 찾아야 한다");
  const box = bboxPx(hull!);
  assert.ok(box.x1 <= SIZE / 2 + 1 && box.y1 <= SIZE / 2 + 1, `왼쪽 위 4분면이어야 한다: ${JSON.stringify(box)}`);
});

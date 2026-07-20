import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { computePlacement, composeScene } from "./composeScene.ts";

// composeScene은 손실 압축 WebP(기본 quality)를 출력한다 — 인코더가 채도 높은 색을
// ±소량 근사하는 것은 정상 동작이므로, 픽셀 비교는 정확 일치 대신 채널당 오차 허용으로 한다.
const CHANNEL_TOLERANCE = 5;

function assertColorClose(
  actual: { r: number; g: number; b: number },
  expected: { r: number; g: number; b: number },
  message: string
) {
  for (const channel of ["r", "g", "b"] as const) {
    const diff = Math.abs(actual[channel] - expected[channel]);
    assert.ok(
      diff <= CHANNEL_TOLERANCE,
      `${message}: ${channel} 채널 차이 ${diff}가 허용치(${CHANNEL_TOLERANCE})를 초과함 (actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)})`
    );
  }
}

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
  assertColorClose(sampled, { r: 255, g: 0, b: 0 }, "파츠 중심 픽셀");

  // 슬롯 박스 밖(0,0)은 배경색(흰색) 그대로
  const outside = px(5, 5);
  assertColorClose(outside, { r: 255, g: 255, b: 255 }, "박스 밖 배경 픽셀");
});

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

  // 슬롯 박스(500,400)-(600,500) 안쪽 깊숙한 지점은 빨간색
  // (박스 정중앙(550,450)은 WebP 손실 압축의 블록 경계 아티팩트가 강하게 끼는
  // 지점이라 피하고, 경계에서 충분히 떨어진 지점을 샘플링한다)
  assertColorClose(px(570, 470), { r: 255, g: 0, b: 0 }, "확대된 파츠 내부 픽셀");
  // 박스 밖(499, 400)은 배경(파란색) 그대로 - 확대된 파츠가 넘치지 않음
  assertColorClose(px(499, 400), { r: 0, g: 0, b: 255 }, "박스 밖 배경 픽셀 (확대 케이스)");
});

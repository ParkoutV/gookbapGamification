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
  // 박스 밖(495, 395)은 배경(파란색) 그대로 - 확대된 파츠가 넘치지 않음
  // (박스 경계 바로 옆(499,400)은 WebP 블록 아티팩트가 끼는 지점이라 피하고
  // 경계에서 살짝 더 떨어진 지점을 샘플링한다)
  assertColorClose(px(495, 395), { r: 0, g: 0, b: 255 }, "박스 밖 배경 픽셀 (확대 케이스)");

  // 판별 포인트 (좌표계 혼동 버그 검출용):
  // 버그 코드는 clipLeft+extractLeft(=550)에 배치해 박스 밖 (620,520)까지 파츠가
  // 튀어나가고, 박스 왼쪽 위 구석 (510,410)은 비어서 배경이 보인다.
  // 올바른 코드는 partLeft+extractLeft(=500)에 배치해 정반대가 된다.
  assertColorClose(px(620, 520), { r: 0, g: 0, b: 255 }, "박스 밖 판별 픽셀 - 버그라면 빨간색 튀어나옴");
  assertColorClose(px(510, 410), { r: 255, g: 0, b: 0 }, "박스 구석 판별 픽셀 - 버그라면 배경 비침");
});

test("composeScene - offset이 있으면 박스 중앙이 아니라 offset만큼 이동한 위치에 그려진다 (클리핑 없음)", async () => {
  const baseImageBuffer = await sharp({
    create: { width: 1200, height: 800, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
  })
    .png()
    .toBuffer();

  const redPartBuffer = await sharp({
    create: { width: 50, height: 50, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();

  // B = 100*1 = 100, part 50x50, fit = min(100/50,100/50) = 2, partScale = 1
  // -> w = h = 50*2*1 = 100 = box 크기와 같지만, offset이 있어 박스와 어긋나
  //    실제로는 위쪽/오른쪽이 클립된다 (클리핑 자체는 여전히 발생).
  // left = x + (100-100)/2 + offsetX = x + offsetX = 300 + 20 = 320
  // top  = y + (100-100)/2 + offsetY = y + offsetY = 200 - 10 = 190
  // 클립 박스 (300,200)-(400,300) 와 파츠 (320,190)-(420,290)의 교집합은
  // (320,200)-(400,290) — 이 범위 안쪽만 실제로 보인다.
  const result = await composeScene(baseImageBuffer, [
    {
      slotId: 1,
      x: 300,
      y: 200,
      slotScale: 1,
      offsetX: 20,
      offsetY: -10,
      partScale: 1,
      imageBuffer: redPartBuffer,
      zIndex: 1,
    },
  ]);

  const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => {
    const idx = (y * info.width + x) * info.channels;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
  };

  // 파츠 배치 영역은 (320,190)-(420,290). 내부 안쪽 지점은 빨간색이어야 한다.
  assertColorClose(px(370, 240), { r: 255, g: 0, b: 0 }, "offset 이동된 파츠 내부 픽셀");
  // offset을 반영하지 않았다면(즉 박스 중앙 (300,200)-(400,300)) 채워졌을 좌상단 구석
  // (310,200)은 offset 반영 시 배경(파란색)이어야 한다 - offset 미적용 버그를 잡아냄.
  assertColorClose(px(310, 200), { r: 0, g: 0, b: 255 }, "offset 미반영이라면 빨간색이었을 구석 - 배경 확인");
});

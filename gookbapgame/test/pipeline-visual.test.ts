import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { composeScene } from "../app/lib/composeScene.ts";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

// 슬롯 박스(120x120=14,400px)가 전체 프레임(1200x800=960,000px)의 1.5%뿐이라,
// 전체 프레임 기준 diff 비율 예산을 넉넉하게 잡으면(예: 1%=9,600px) 박스 안 마커가
// 통째로 어긋나도 통과해버린다. 렌더된 마커 크기는 40x40(원본) x fit(1.5) x partScale(0.5)
// = 30x30 = 900px 정도이므로, 그 절반 이하만 어긋나도 잡히도록 좁게 예산을 잡는다.
// (Task 6 Step 8 self-test로 실측 후 확정한 값 — 브리핑 초안의 0.0005는 partScale=1일
// 때 기준으로, 실제로는 아래 partScale=0.5 변경과 함께 재조정했다.)
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
      partScale: 0.5,
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

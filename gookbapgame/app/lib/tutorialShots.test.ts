import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { TUTORIAL_SHOTS } from "./tutorialShots.ts";

/** webp 헤더에서 크기를 읽는다(VP8/VP8L/VP8X 세 형식). */
function webpSize(path: string): { w: number; h: number } {
  const d = readFileSync(path);
  const fourcc = d.subarray(12, 16).toString("ascii");
  if (fourcc === "VP8X") {
    return { w: d.readUIntLE(24, 3) + 1, h: d.readUIntLE(27, 3) + 1 };
  }
  if (fourcc === "VP8L") {
    const bits = d.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { w: d.readUInt16LE(26) & 0x3fff, h: d.readUInt16LE(28) & 0x3fff };
}

/*
 * `aspect`는 화면이 `aspect-ratio`로 그대로 쓰는 값이라, 애셋 실제 비율과 어긋나면
 * `object-contain`이 레터박스를 만들어 위아래(또는 좌우)가 빈다. 크롭 범위를 바꾸고
 * `tutorialShots.ts`의 숫자를 안 고치는 것이 정확히 그 경로다 —
 * 빌드 스크립트와 이 파일이 각자 크기를 들고 있으므로 여기서 묶어준다.
 */
test("선언한 비율이 실제 애셋 비율과 같다", () => {
  for (const [key, shot] of Object.entries(TUTORIAL_SHOTS)) {
    const path = `public${shot.src}`;
    assert.ok(existsSync(path), `${key}: 애셋이 없다 — bash docs/build-tutorial-assets.sh`);
    const { w, h } = webpSize(path);
    const actual = w / h;
    assert.ok(
      Math.abs(actual - shot.aspect) < 0.01,
      `${key}: 선언 ${shot.aspect.toFixed(2)} ≠ 실제 ${actual.toFixed(2)} (${w}x${h})`
    );
  }
});

/*
 * 없는 장은 이미지 없이 그리도록 되어 있어(`shot &&`) 키가 틀려도 **에러 없이**
 * 그림만 조용히 사라진다. 페이지 키와 맞는지 여기서 확인한다.
 */
test("페이지 키와 애셋 키가 일치한다", () => {
  const pageKeys = ["what", "limit", "score"];
  assert.deepEqual(Object.keys(TUTORIAL_SHOTS).sort(), [...pageKeys].sort());
});

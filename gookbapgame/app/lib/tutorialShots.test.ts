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

/*
 * 장을 넘길 때 그림이 눌리거나 홀쭉해지던 버그의 가드다(2026-08-17 이란토 제보).
 * `key`가 없으면 React가 같은 `<img>`를 재사용해 `src`만 갈아끼우는데, 브라우저는
 * 새 그림이 도착할 때까지 **이전 비트맵을 계속 그린다** — 비율 style은 즉시 바뀌므로
 * 그 사이 이전 그림이 새 비율에 늘어난다. `object-contain`은 그 위의 안전망이다.
 *
 * JSX는 `--experimental-strip-types`가 파싱하지 못해 컴포넌트를 불러올 수 없으므로
 * 소스를 문자열로 훑는다 — `couponEmoji.test.ts`가 VS16을 막는 방식과 같다.
 */
test("튜토리얼 예시 이미지는 key와 object-contain을 유지한다", () => {
  const source = readFileSync("app/components/TutorialScreen.tsx", "utf8");
  // 주석 안의 `<img>`는 속성이 없어 걸러진다.
  const tags = [...source.matchAll(/<img\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes("src="));
  assert.equal(tags.length, 1, "예시 이미지는 한 곳에서만 그린다");
  assert.match(tags[0], /\bkey=/, "key가 없으면 낡은 비트맵이 새 비율에 늘어난다");
  assert.match(tags[0], /object-contain/, "비율이 어긋날 때 찌그러지지 않게 하는 안전망");

  /* 래퍼의 `items-center`는 장식이 아니다 — 없으면 flex 기본값 `stretch`가 걸려
     `<img>`가 바닥값 높이만큼 **늘어나고**, `object-contain`이 레터박스를 만들어
     비율 깨짐이 다른 경로로 되살아난다. */
  const wrapper = source.match(/<div\n\s+className="flex[^"]*"/);
  assert.ok(wrapper, "이미지 래퍼를 찾지 못했다");
  assert.match(wrapper[0], /items-center/, "stretch가 되면 그림이 세로로 늘어난다");
});

/*
 * 이미지 영역의 바닥값(`min-height`)은 높이 상한의 **절반**으로 잡은 것이라
 * 상한만 고치면 근거가 조용히 끊긴다. 장마다 창이 출렁이는 것을 줄이는 몫이므로,
 * 어느 한쪽만 커지면 그 절충이 의도와 다른 값이 된다.
 *
 * **이건 물리적 관계가 아니라 절충치다.** 짧은 장이 휑하다고 바닥값을 낮추기로
 * 했다면 그건 정당한 변경이며, 그때는 이 테스트도 함께 고칠 것 — 어긋나면 화면이
 * 깨지는 종류의 가드가 아니다(바로 위 `items-center`가 그쪽이다).
 */
test("이미지 영역의 바닥값은 높이 상한의 절반이다", () => {
  const source = readFileSync("app/components/TutorialScreen.tsx", "utf8");
  const cap = source.match(/maxWidth: `calc\(min\((\d+)dvh, (\d+)px\)/);
  const floor = source.match(/minHeight: "min\((\d+)dvh, (\d+)px\)"/);
  assert.ok(cap, "높이 상한(maxWidth의 calc)을 찾지 못했다");
  assert.ok(floor, "바닥값(minHeight)을 찾지 못했다");
  assert.equal(Number(floor[1]) * 2, Number(cap[1]), `dvh: ${floor[1]} × 2 ≠ ${cap[1]}`);
  assert.equal(Number(floor[2]) * 2, Number(cap[2]), `px: ${floor[2]} × 2 ≠ ${cap[2]}`);
});

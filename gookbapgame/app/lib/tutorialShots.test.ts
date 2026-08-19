import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { TUTORIAL_SHOTS } from "./tutorialShots.ts";

/*
 * 애셋이 없으면 `<img>`가 404를 물고 **에러 없이** 빈 자리만 남는다.
 * 비율 검사는 없앴다 — 화면이 실제 비율을 브라우저에 맡기므로 코드가 알 필요가
 * 없어졌다(2026-08-19). 숫자를 다시 들여놓지 말 것.
 */
test("애셋 파일이 실제로 있다", () => {
  for (const [key, src] of Object.entries(TUTORIAL_SHOTS)) {
    assert.ok(existsSync(`public${src}`), `${key}: 애셋이 없다 (${src})`);
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
 * 새 그림이 도착할 때까지 **이전 비트맵을 계속 그린다.**
 *
 * 크기는 상한 둘(`max-w-full`/`max-h-*`)만 준다 — 실제 크기와 비율은 브라우저가
 * 애셋에서 읽는다(2026-08-19). 그래서 확정 크기(`aspectRatio`·`height`·`w-full`)가
 * 다시 들어오는 것을 여기서 막는다. 그게 있으면 그림을 바꿀 때마다 코드를 고쳐야
 * 하는 옛 구조로 돌아간다. **`max-height`는 상한이라 비율을 깨뜨리지 않는다** —
 * 그건 확정 크기가 아니므로 금지 목록에 없다.
 *
 * JSX는 `--experimental-strip-types`가 파싱하지 못해 컴포넌트를 불러올 수 없으므로
 * 소스를 문자열로 훑는다 — `couponEmoji.test.ts`가 VS16을 막는 방식과 같다.
 */
test("튜토리얼 예시 이미지는 key와 상한 기준 크기를 유지한다", () => {
  const source = readFileSync("app/components/TutorialScreen.tsx", "utf8");
  // 주석 안의 `<img>`는 속성이 없어 걸러진다.
  const tags = [...source.matchAll(/<img\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes("src="));
  assert.equal(tags.length, 1, "예시 이미지는 한 곳에서만 그린다");
  assert.match(tags[0], /\bkey=/, "key가 없으면 낡은 비트맵이 다음 장에 남는다");
  assert.match(tags[0], /\bmax-w-full\b/, "폭 상한이 없으면 패널을 넘친다");
  assert.match(tags[0], /\bmax-h-\[/, "높이 상한이 없으면 폰에서 패널이 스크롤된다");
  assert.doesNotMatch(
    tags[0],
    /aspectRatio|aspect-\[|(?<!max-)\bh-\[|(?<!max-)\bw-full\b|height:/,
    "확정 크기를 코드가 들고 있으면 안 된다(상한만 준다)"
  );
});

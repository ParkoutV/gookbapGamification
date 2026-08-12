import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_CUE_MAX_PX } from "./gameCue.ts";

/*
 * `.game-cue-window`의 height는 GAME_CUE_MAX_PX와 **같아야 한다.**
 *
 * 그 높이는 라벨마다 font-size가 달라져도 팝업 창이 흔들리지 않게 잡아두는 값이라,
 * 상한 글자가 딱 들어가는 크기여야 한다. 작으면 글자가 잘리고 크면 위아래 여백이 뜬다.
 * 한쪽만 고치기 쉬운 구조(JS 상수 / CSS 리터럴)라 여기서 묶는다.
 */
test("globals.css의 .game-cue-window height가 GAME_CUE_MAX_PX와 일치한다", () => {
  const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8");
  const block = css.match(/\.game-cue-window\s*\{[^}]*\}/);
  assert.ok(block, ".game-cue-window 규칙을 찾지 못했다");

  const height = block[0].match(/height:\s*(\d+)px/);
  assert.ok(height, ".game-cue-window에 height가 없다");

  assert.equal(
    Number(height[1]),
    GAME_CUE_MAX_PX,
    `CSS height(${height[1]}px)와 GAME_CUE_MAX_PX(${GAME_CUE_MAX_PX}px)가 다르다`,
  );
});

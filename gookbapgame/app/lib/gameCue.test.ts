import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8");

const ruleBody = (selector: string): string => {
  const escaped = selector.replace(/[.\\+*?[^\]$(){}=!<>|:#-]/g, "\\$&");
  const block = css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`));
  assert.ok(block, `${selector} 규칙을 찾지 못했다`);
  return block[0];
};

/** `height: 84px` 또는 `font-size: min(84px, 28cqw)`에서 px 값을 뽑는다. */
const px = (selector: string, prop: string): number => {
  const m = ruleBody(selector).match(new RegExp(`${prop}:[^;]*?(\\d+)px`));
  assert.ok(m, `${selector}에 ${prop}의 px 값이 없다`);
  return Number(m[1]);
};

/** `min(84px, 28cqw)`에서 cqw 계수를 뽑는다. */
const cqw = (selector: string): number => {
  const m = ruleBody(selector).match(/font-size:[^;]*?([\d.]+)cqw/);
  assert.ok(m, `${selector}에 font-size의 cqw 계수가 없다`);
  return Number(m[1]);
};

/*
 * `.game-cue-window`의 height는 `.game-cue`의 font-size **상한**과 같아야 한다.
 *
 * 창 높이는 라벨마다 글자 크기가 달라도 팝업이 흔들리지 않게 잡아두는 값이라
 * (line-height: 1이므로 글자 높이 = font-size), 가장 큰 경우가 딱 들어가야 한다.
 * 작으면 글자가 잘리고 크면 위아래 여백이 뜬다.
 *
 * 두 값이 다른 규칙에 px 리터럴로 들어 있어 한쪽만 고치기 쉬운 구조라 여기서 묶는다.
 * 예전에는 JS 상수(`GAME_CUE_MAX_PX`)와 CSS를 묶었는데, 크기 결정이 JS에서 CSS로
 * 넘어오면서(2026-08-13) 비교 대상도 CSS 두 곳이 됐다.
 */
test(".game-cue-window height가 .game-cue font-size 상한과 일치한다", () => {
  assert.equal(
    px(".game-cue-window", "height"),
    px(".game-cue", "font-size"),
    "창 높이와 글자 크기 상한이 다르다",
  );
});

/*
 * 세 변형은 **같은 상한**을 공유해야 한다. 넓은 화면에서는 창에 여유가 있어 세 라벨이
 * 모두 상한에 닿는데, 상한이 다르면 START와 CLEAR!의 크기가 이유 없이 갈린다.
 */
test("변형들이 같은 font-size 상한을 쓴다", () => {
  const base = px(".game-cue", "font-size");
  assert.equal(px(".game-cue--wide", "font-size"), base, "--wide 상한이 기본과 다르다");
  assert.equal(px(".game-cue--long", "font-size"), base, "--long 상한이 기본과 다르다");
});

/*
 * 계수는 라벨 폭의 역수다 — **넓은 라벨일수록 작아야** 한다. 순서가 뒤집히면 좁은
 * 화면에서 긴 라벨이 창을 넘는다(그때 `overflow: hidden`이 잘라내므로 조용히 깨진다).
 *
 * 실측 근거(Galmuri11, 기울임 tan8° 포함):
 *   START 3.391em → 28cqw / CLEAR! 3.721em → 25.5cqw / GAME OVER 6.061em → 15.5cqw
 */
test("계수가 라벨 폭 순서를 따른다 — 기본 > wide > long", () => {
  assert.ok(
    cqw(".game-cue") > cqw(".game-cue--wide"),
    "기본(START) 계수가 --wide(CLEAR!)보다 크지 않다",
  );
  assert.ok(
    cqw(".game-cue--wide") > cqw(".game-cue--long"),
    "--wide(CLEAR!) 계수가 --long(GAME OVER)보다 크지 않다",
  );
});

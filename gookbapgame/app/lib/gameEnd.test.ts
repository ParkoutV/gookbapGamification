import { test } from "node:test";
import assert from "node:assert/strict";
import { gameEndLabel } from "./gameEnd.ts";

test("마지막 단계까지 정답 완주하면 CLEAR", () => {
  assert.equal(gameEndLabel("cleared"), "CLEAR!");
});

test("오답 기회 소진은 GAME OVER", () => {
  assert.equal(gameEndLabel("wrongTouchExhausted"), "GAME OVER");
});

test("시간 초과는 GAME OVER", () => {
  assert.equal(gameEndLabel("timeout"), "GAME OVER");
});

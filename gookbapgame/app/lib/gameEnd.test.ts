import { test } from "node:test";
import assert from "node:assert/strict";
import { gameEndLabelKey } from "./gameEnd.ts";

test("마지막 단계까지 정답 완주하면 CLEAR", () => {
  assert.equal(gameEndLabelKey("cleared"), "gameEnd.clear");
});

test("오답 기회 소진은 GAME OVER", () => {
  assert.equal(gameEndLabelKey("wrongTouchExhausted"), "gameEnd.gameOver");
});

test("시간 초과는 GAME OVER", () => {
  assert.equal(gameEndLabelKey("timeout"), "gameEnd.gameOver");
});

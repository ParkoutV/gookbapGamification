import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_CONFIG,
  TOTAL_STAGE_SCORE,
  GLOBAL_TIME_LIMIT_SEC,
  WRONG_TOUCH_LIMIT_PER_LEVEL,
  WRONG_TOUCH_PENALTY,
  INCOMPLETE_LEVEL_PENALTY,
} from "./stageConfig.ts";

test("STAGE_CONFIG: 7레벨로 구성된다", () => {
  assert.equal(STAGE_CONFIG.length, 7);
});

test("STAGE_CONFIG: 레벨 배점이 50/50/100/100/150/150/200이다", () => {
  assert.deepEqual(
    STAGE_CONFIG.map((s) => s.pointPool),
    [50, 50, 100, 100, 150, 150, 200]
  );
});

test("STAGE_CONFIG: diffCount는 1~6레벨 5, 7레벨 7이다", () => {
  assert.deepEqual(
    STAGE_CONFIG.map((s) => s.diffCount),
    [5, 5, 5, 5, 5, 5, 7]
  );
});

test("TOTAL_STAGE_SCORE: 레벨 배점 합은 800이다", () => {
  assert.equal(TOTAL_STAGE_SCORE, 800);
});

test("전역 상수: 시간/오답/미완주 관련 값이 스펙과 일치한다", () => {
  assert.equal(GLOBAL_TIME_LIMIT_SEC, 300);
  assert.equal(WRONG_TOUCH_LIMIT_PER_LEVEL, 3);
  assert.equal(WRONG_TOUCH_PENALTY, 10);
  assert.equal(INCOMPLETE_LEVEL_PENALTY, 10);
});

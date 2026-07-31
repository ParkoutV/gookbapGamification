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

import { calcAccuracyTierPoints, calcTimeBonus } from "./stageConfig.ts";

test("calcAccuracyTierPoints: 6단계 정답률 구간 경계값", () => {
  assert.equal(calcAccuracyTierPoints(0), 0);
  assert.equal(calcAccuracyTierPoints(20), 0);
  assert.equal(calcAccuracyTierPoints(21), 50);
  assert.equal(calcAccuracyTierPoints(40), 50);
  assert.equal(calcAccuracyTierPoints(41), 100);
  assert.equal(calcAccuracyTierPoints(60), 100);
  assert.equal(calcAccuracyTierPoints(61), 200);
  assert.equal(calcAccuracyTierPoints(80), 200);
  assert.equal(calcAccuracyTierPoints(81), 400);
  assert.equal(calcAccuracyTierPoints(90), 400);
  assert.equal(calcAccuracyTierPoints(91), 600);
  assert.equal(calcAccuracyTierPoints(100), 600);
});

test("calcTimeBonus: 100초 이내는 정답률 티어 그대로", () => {
  assert.equal(calcTimeBonus(50, 100), 600);
  assert.equal(calcTimeBonus(100, 100), 600);
  assert.equal(calcTimeBonus(100, 70), 200);
});

test("calcTimeBonus: 100초 초과는 10초 단위로 30점씩 감소한다", () => {
  assert.equal(calcTimeBonus(105, 100), 570);
  assert.equal(calcTimeBonus(110, 100), 570);
  assert.equal(calcTimeBonus(111, 100), 540);
  assert.equal(calcTimeBonus(300, 100), 0);
});

test("calcTimeBonus: 정답률이 낮으면 더 일찍 0에 도달한다", () => {
  assert.equal(calcTimeBonus(150, 70), 50);
  assert.equal(calcTimeBonus(161, 70), 0);
});

test("calcTimeBonus: 정답률 0%면 어떤 시간에도 0이다(악용 방지 검증)", () => {
  assert.equal(calcTimeBonus(30, 0), 0);
  assert.equal(calcTimeBonus(105, 0), 0);
  assert.equal(calcTimeBonus(250, 0), 0);
});

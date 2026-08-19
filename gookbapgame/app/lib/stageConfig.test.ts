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
  assert.equal(GLOBAL_TIME_LIMIT_SEC, 180);
  assert.equal(WRONG_TOUCH_LIMIT_PER_LEVEL, 3);
  assert.equal(WRONG_TOUCH_PENALTY, 10);
  assert.equal(INCOMPLETE_LEVEL_PENALTY, 10);
});

import {
  calcAccuracyTierPoints,
  calcTimeBonus,
  TIME_BONUS_MAX,
  TIME_BONUS_FAST_THRESHOLD_SEC,
  TIME_BONUS_STEP_SEC,
  TIME_BONUS_STEP_VALUE,
} from "./stageConfig.ts";

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

test("calcTimeBonus: 60초 이내는 정답률 티어 그대로", () => {
  assert.equal(calcTimeBonus(30, 100), 600);
  assert.equal(calcTimeBonus(60, 100), 600);
  assert.equal(calcTimeBonus(60, 70), 200);
});

test("calcTimeBonus: 60초 초과는 10초 단위로 50점씩 감소한다", () => {
  assert.equal(calcTimeBonus(65, 100), 550);
  assert.equal(calcTimeBonus(70, 100), 550);
  assert.equal(calcTimeBonus(71, 100), 500);
  assert.equal(calcTimeBonus(180, 100), 0);
});

test("calcTimeBonus: 정답률이 낮으면 더 일찍 0에 도달한다", () => {
  assert.equal(calcTimeBonus(90, 70), 50);
  assert.equal(calcTimeBonus(101, 70), 0);
});

test("calcTimeBonus: 정답률 0%면 어떤 시간에도 0이다(악용 방지 검증)", () => {
  assert.equal(calcTimeBonus(30, 0), 0);
  assert.equal(calcTimeBonus(65, 0), 0);
  assert.equal(calcTimeBonus(150, 0), 0);
});

/**
 * 이 넷은 독립이 아니다 — 최고 티어가 0에 닿는 시각이 제한시간과 어긋나면
 * "시간을 다 써도 보너스가 남는" 구멍이 생긴다(2026-08-19에 실제로 밟았다).
 * 수치를 조정할 때 이 테스트가 먼저 깨져야 한다.
 */
test("시간 보너스는 제한시간에 정확히 소진된다", () => {
  const zeroAt =
    TIME_BONUS_FAST_THRESHOLD_SEC + (TIME_BONUS_MAX / TIME_BONUS_STEP_VALUE) * TIME_BONUS_STEP_SEC;
  assert.equal(zeroAt, GLOBAL_TIME_LIMIT_SEC);

  // 계단은 ceil이라 마지막 한 칸(170초 초과)이 통째로 0이다. "제한 직전까지 남는다"가
  // 아니라 "제한을 넘겨서까지 남지는 않는다"가 지켜야 할 성질이다.
  assert.ok(calcTimeBonus(zeroAt - TIME_BONUS_STEP_SEC, 100) > 0);
  assert.equal(calcTimeBonus(zeroAt, 100), 0);
  assert.equal(calcTimeBonus(GLOBAL_TIME_LIMIT_SEC, 100), 0);
});

import { COMBO_BONUS_MAX, calcComboBonusForStreak } from "./stageConfig.ts";

function closeTo(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be close to ${expected}`
  );
}

test("calcComboBonusForStreak: 스트릭 0이면 0점", () => {
  assert.equal(calcComboBonusForStreak(0, 50), 0);
});

test("calcComboBonusForStreak: 전체 정답을 스트릭 끊김 없이 다 찾으면 만점", () => {
  closeTo(calcComboBonusForStreak(50, 50), COMBO_BONUS_MAX);
});

test("calcComboBonusForStreak: 스트릭 길이의 제곱에 비례한다", () => {
  closeTo(calcComboBonusForStreak(10, 50), 553 * (10 / 50) ** 2);
  closeTo(calcComboBonusForStreak(25, 50), 553 * (25 / 50) ** 2);
});

test("calcComboBonusForStreak: 전체 정답 수가 0이면 0점(0으로 나누기 방지)", () => {
  assert.equal(calcComboBonusForStreak(0, 0), 0);
});

test("calcComboBonusForStreak: 균등 간격 오답 k회 시 총합은 553/(k+1)에 수렴한다", () => {
  const N = 60;
  const k = 2; // 오답 2회 → 3구간
  const segment = N / (k + 1);
  const total =
    calcComboBonusForStreak(segment, N) +
    calcComboBonusForStreak(segment, N) +
    calcComboBonusForStreak(segment, N);
  closeTo(total, COMBO_BONUS_MAX / (k + 1), 0.5);
});

import { calcStageScore } from "./stageConfig.ts";

test("calcStageScore: 한 레벨을 전부 찾으면 배점 그대로", () => {
  assert.equal(calcStageScore([{ pointPool: 50, foundCount: 5, actualDiffCount: 5 }]), 50);
});

test("calcStageScore: 일부만 찾으면 비율만큼만 받는다", () => {
  assert.equal(calcStageScore([{ pointPool: 50, foundCount: 3, actualDiffCount: 5 }]), 30);
});

test("calcStageScore: 실제 diffCount가 목표보다 적어도 정확히 나뉜다", () => {
  closeToStage(calcStageScore([{ pointPool: 100, foundCount: 2, actualDiffCount: 3 }]), 200 / 3);
});

test("calcStageScore: 여러 레벨을 합산한다", () => {
  const result = calcStageScore([
    { pointPool: 50, foundCount: 5, actualDiffCount: 5 },
    { pointPool: 100, foundCount: 0, actualDiffCount: 5 },
    { pointPool: 200, foundCount: 7, actualDiffCount: 7 },
  ]);
  assert.equal(result, 50 + 0 + 200);
});

test("calcStageScore: actualDiffCount가 0이면 0으로 나누지 않고 건너뛴다", () => {
  assert.equal(calcStageScore([{ pointPool: 50, foundCount: 0, actualDiffCount: 0 }]), 0);
});

function closeToStage(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${actual} to be close to ${expected}`);
}

import { calcWrongTouchPenalty, calcIncompleteLevelPenalty } from "./stageConfig.ts";

test("calcWrongTouchPenalty: 오답 1회당 10점", () => {
  assert.equal(calcWrongTouchPenalty(0), 0);
  assert.equal(calcWrongTouchPenalty(1), 10);
  assert.equal(calcWrongTouchPenalty(21), 210);
});

test("calcIncompleteLevelPenalty: 전부 도달하면 0점", () => {
  assert.equal(calcIncompleteLevelPenalty(7, 7), 0);
});

test("calcIncompleteLevelPenalty: 진행 중이던 레벨은 도달로 취급해 감점 제외", () => {
  // 4단계까지 갔다(진행 중이던 4단계 포함 levelsReached=4) → 5,6,7단계 3개 미도달
  assert.equal(calcIncompleteLevelPenalty(4, 7), 30);
});

test("calcIncompleteLevelPenalty: 음수로 내려가지 않는다", () => {
  assert.equal(calcIncompleteLevelPenalty(9, 7), 0);
});

import { calcFinalScore, calcGukbapTier } from "./stageConfig.ts";

function perfectLevelResults() {
  return STAGE_CONFIG.map((s) => ({
    pointPool: s.pointPool,
    foundCount: s.diffCount,
    actualDiffCount: s.diffCount,
  }));
}

test("calcFinalScore: 완전 무결점 + 60초 이내 완주 = 1953", () => {
  const totalAnswers = STAGE_CONFIG.reduce((sum, s) => sum + s.diffCount, 0);
  const breakdown = calcFinalScore({
    levelResults: perfectLevelResults(),
    elapsedSec: 55,
    totalWrongTouches: 0,
    comboBankedScore: 0,
    comboCurrentStreak: totalAnswers,
    comboTotalAnswers: totalAnswers,
    levelsReached: STAGE_CONFIG.length,
  });
  assert.equal(breakdown.total, 1953);
});

test("calcFinalScore: 오답만 찍고 강제 스킵하는 악용은 순손실이다", () => {
  const totalAnswers = STAGE_CONFIG.reduce((sum, s) => sum + s.diffCount, 0);
  const emptyLevelResults = STAGE_CONFIG.map((s) => ({
    pointPool: s.pointPool,
    foundCount: 0,
    actualDiffCount: s.diffCount,
  }));
  const breakdown = calcFinalScore({
    levelResults: emptyLevelResults,
    elapsedSec: 35,
    totalWrongTouches: STAGE_CONFIG.length * 3,
    comboBankedScore: 0,
    comboCurrentStreak: 0,
    comboTotalAnswers: totalAnswers,
    levelsReached: STAGE_CONFIG.length,
  });
  assert.equal(breakdown.total, 0);
  assert.equal(breakdown.stageScore, 0);
  assert.equal(breakdown.timeBonus, 0);
  assert.equal(breakdown.comboBonus, 0);
  assert.equal(breakdown.wrongTouchPenalty, 210);
});

test("calcFinalScore: 총점은 절대 음수로 표시되지 않는다", () => {
  const breakdown = calcFinalScore({
    levelResults: [],
    elapsedSec: 300,
    totalWrongTouches: 100,
    comboBankedScore: 0,
    comboCurrentStreak: 0,
    comboTotalAnswers: 30,
    levelsReached: 0,
  });
  assert.equal(breakdown.total, 0);
});

test("calcGukbapTier: 컷오프 경계값", () => {
  assert.equal(calcGukbapTier(1953), "1953 Master");
  assert.equal(calcGukbapTier(1500), "국밥 단골");
  assert.equal(calcGukbapTier(1200), "국밥 미식가");
  assert.equal(calcGukbapTier(800), "국밥 탐험가");
  assert.equal(calcGukbapTier(0), "국밥 입문생");
});

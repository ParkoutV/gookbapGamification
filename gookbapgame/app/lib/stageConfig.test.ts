import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_CONFIG,
  TOTAL_STAGE_SCORE,
  DISPLAY_MAX_SCORE,
  calcTimeBonus,
  calcStreakBonus,
  calcFinalScore,
  calcGukbapTier,
  toDisplayScore,
} from "./stageConfig.ts";

test("STAGE_CONFIG는 9개 스테이지, Stage 점수 합계는 2040이다", () => {
  assert.equal(STAGE_CONFIG.length, 9);
  assert.equal(TOTAL_STAGE_SCORE, 2040);
});

test("DISPLAY_MAX_SCORE는 1953이다", () => {
  assert.equal(DISPLAY_MAX_SCORE, 1953);
});

test("calcTimeBonus: 전체 시간 예산의 60%(324초)를 남기면 만점 400을 준다", () => {
  const remaining = [36, 36, 36, 36, 36, 36, 36, 36, 36]; // 합계 324초
  assert.equal(calcTimeBonus(remaining), 400);
});

test("calcTimeBonus: 목표치의 절반만 남기면 절반 점수를 준다", () => {
  const remaining = [18, 18, 18, 18, 18, 18, 18, 18, 18]; // 합계 162초 = 324의 절반
  assert.equal(calcTimeBonus(remaining), 200);
});

test("calcTimeBonus: 남은 시간이 없으면 0점", () => {
  assert.equal(calcTimeBonus([]), 0);
});

test("calcTimeBonus: 남은 시간이 목표치를 초과해도 400점을 넘지 않는다", () => {
  const remaining = [60, 60, 60, 60, 60, 60, 60, 60, 60]; // 합계 540초
  assert.equal(calcTimeBonus(remaining), 400);
});

test("calcStreakBonus: 오답이 없으면 53점, 있으면 0점", () => {
  assert.equal(calcStreakBonus(false), 53);
  assert.equal(calcStreakBonus(true), 0);
});

test("calcFinalScore: 내부 계산은 항상 0~100 비율이다", () => {
  const remaining = [36, 36, 36, 36, 36, 36, 36, 36, 36];
  const result = calcFinalScore(remaining, false);
  assert.equal(Math.round(result.total * 1000) / 1000, 100);
});

test("calcFinalScore: 시간 만점 + 오답 없음이면 표시 총점 1953 (만점 달성 가능)", () => {
  const remaining = [36, 36, 36, 36, 36, 36, 36, 36, 36];
  const result = calcFinalScore(remaining, false);
  assert.equal(toDisplayScore(result.total), 1953);
});

test("calcFinalScore: 오답이 있으면 정답행진 보너스만 빠진다", () => {
  const remaining = [36, 36, 36, 36, 36, 36, 36, 36, 36];
  const withStreak = calcFinalScore(remaining, false);
  const withoutStreak = calcFinalScore(remaining, true);
  assert.equal(withoutStreak.streakBonus, 0);
  assert.ok(withoutStreak.total < withStreak.total);
});

test("calcGukbapTier: 만점(0~100 비율 100)이면 1953 Master", () => {
  assert.equal(calcGukbapTier(100), "1953 Master");
});

test("calcGukbapTier: 표시 점수 1500 이상 1953 미만은 국밥 단골", () => {
  // 1500/1953*100, 1952/1953*100 을 역산한 비율값으로 경계 검증
  assert.equal(calcGukbapTier((1500 / 1953) * 100), "국밥 단골");
  assert.equal(calcGukbapTier((1952 / 1953) * 100), "국밥 단골");
});

test("calcGukbapTier: 표시 점수 0이면 국밥 입문생", () => {
  assert.equal(calcGukbapTier(0), "국밥 입문생");
});

test("toDisplayScore: 0~100 비율을 1953 만점으로 반올림 환산한다", () => {
  assert.equal(toDisplayScore(100), 1953);
  assert.equal(toDisplayScore(0), 0);
  assert.equal(toDisplayScore(50), 977); // round(50/100*1953)
});

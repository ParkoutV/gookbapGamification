import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_CONFIG,
  TOTAL_STAGE_SCORE,
  MAX_TOTAL_SCORE,
  calcTimeBonus,
  calcStreakBonus,
  calcFinalScore,
  calcGukbapTier,
} from "./stageConfig.ts";

test("STAGE_CONFIG는 7개 스테이지, Stage 점수 합계는 1400이다", () => {
  assert.equal(STAGE_CONFIG.length, 7);
  assert.equal(TOTAL_STAGE_SCORE, 1400);
});

test("MAX_TOTAL_SCORE는 1953이다", () => {
  assert.equal(MAX_TOTAL_SCORE, 1953);
});

test("calcTimeBonus: 전체 시간 예산의 60%(252초)를 남기면 만점 400을 준다", () => {
  const remaining = [36, 36, 36, 36, 36, 36, 36]; // 합계 252초
  assert.equal(calcTimeBonus(remaining), 400);
});

test("calcTimeBonus: 목표치의 절반만 남기면 절반 점수를 준다", () => {
  const remaining = [18, 18, 18, 18, 18, 18, 18]; // 합계 126초 = 252의 절반
  assert.equal(calcTimeBonus(remaining), 200);
});

test("calcTimeBonus: 남은 시간이 없으면 0점", () => {
  assert.equal(calcTimeBonus([]), 0);
});

test("calcTimeBonus: 남은 시간이 목표치를 초과해도 400점을 넘지 않는다", () => {
  const remaining = [60, 60, 60, 60, 60, 60, 60]; // 합계 420초
  assert.equal(calcTimeBonus(remaining), 400);
});

test("calcStreakBonus: 오답이 없으면 53점, 있으면 0점", () => {
  assert.equal(calcStreakBonus(false), 53);
  assert.equal(calcStreakBonus(true), 0);
});

test("calcFinalScore: 시간 만점 + 오답 없음이면 총점 1953", () => {
  const remaining = [36, 36, 36, 36, 36, 36, 36];
  const result = calcFinalScore(remaining, false);
  assert.equal(result.stageScore, 1400);
  assert.equal(result.completionBonus, 100);
  assert.equal(result.timeBonus, 400);
  assert.equal(result.streakBonus, 53);
  assert.equal(result.total, 1953);
});

test("calcFinalScore: 오답이 있으면 정답행진 보너스만 빠진다", () => {
  const remaining = [36, 36, 36, 36, 36, 36, 36];
  const result = calcFinalScore(remaining, true);
  assert.equal(result.streakBonus, 0);
  assert.equal(result.total, 1900);
});

test("calcGukbapTier: 만점이면 1953 Master", () => {
  assert.equal(calcGukbapTier(1953), "1953 Master");
});

test("calcGukbapTier: 1500점 이상 1953 미만은 국밥 단골", () => {
  assert.equal(calcGukbapTier(1500), "국밥 단골");
  assert.equal(calcGukbapTier(1952), "국밥 단골");
});

test("calcGukbapTier: 800점 미만은 국밥 입문생", () => {
  assert.equal(calcGukbapTier(0), "국밥 입문생");
  assert.equal(calcGukbapTier(799), "국밥 입문생");
});

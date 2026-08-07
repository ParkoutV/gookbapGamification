import { test } from "node:test";
import assert from "node:assert/strict";
import { clampDifferenceCount, resolveQuestionsCount } from "./gameSelection.ts";

test("clampDifferenceCount: 콘텐츠가 목표치보다 많으면 목표치를 그대로 반환", () => {
  assert.equal(clampDifferenceCount(5, 10), 5);
});

test("clampDifferenceCount: 콘텐츠가 목표치보다 적으면 있는 만큼만 반환", () => {
  assert.equal(clampDifferenceCount(7, 3), 3);
});

test("clampDifferenceCount: 정확히 같으면 그대로 반환", () => {
  assert.equal(clampDifferenceCount(5, 5), 5);
});

// 2026-08-07까지 실제 증상: 대시보드에서 3개로 설정해도 레벨 7이 항상 7문항으로
// 나왔다. STAGE_CONFIG의 고정값이 유일한 기준이고 questions_count를 읽지 않았다.
test("resolveQuestionsCount: 이미지에 설정된 값이 STAGE_CONFIG 폴백을 이긴다", () => {
  assert.equal(resolveQuestionsCount(3, 7), 3);
});

test("resolveQuestionsCount: 설정값이 없으면 폴백을 쓴다", () => {
  assert.equal(resolveQuestionsCount(null, 5), 5);
  assert.equal(resolveQuestionsCount(undefined, 5), 5);
});

// 0이 그대로 통과하면 차이가 하나도 없는 판이 되어 영원히 클리어할 수 없다.
test("resolveQuestionsCount: 0 이하는 미설정으로 보고 폴백을 쓴다", () => {
  assert.equal(resolveQuestionsCount(0, 5), 5);
  assert.equal(resolveQuestionsCount(-1, 5), 5);
});

test("resolveQuestionsCount: 폴백보다 큰 값도 그대로 존중한다", () => {
  // 슬롯 개수 상한은 clampDifferenceCount가 따로 건다.
  assert.equal(resolveQuestionsCount(9, 5), 9);
});

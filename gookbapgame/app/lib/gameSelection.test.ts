import { test } from "node:test";
import assert from "node:assert/strict";
import { clampDifferenceCount } from "./gameSelection.ts";

test("clampDifferenceCount: 콘텐츠가 목표치보다 많으면 목표치를 그대로 반환", () => {
  assert.equal(clampDifferenceCount(5, 10), 5);
});

test("clampDifferenceCount: 콘텐츠가 목표치보다 적으면 있는 만큼만 반환", () => {
  assert.equal(clampDifferenceCount(7, 3), 3);
});

test("clampDifferenceCount: 정확히 같으면 그대로 반환", () => {
  assert.equal(clampDifferenceCount(5, 5), 5);
});

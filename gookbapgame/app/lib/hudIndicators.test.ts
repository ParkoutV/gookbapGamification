import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveIndicatorCells,
  resolveGaugeRatio,
  isTimeCritical,
  TIME_CRITICAL_SEC,
} from "./hudIndicators.ts";
import { INDICATOR_SLOT_CAP, GLOBAL_TIME_LIMIT_SEC } from "./stageConfig.ts";

const count = (cells: string[], kind: string) => cells.filter((c) => c === kind).length;

test("문항 5개면 상한까지 나머지 칸은 hidden", () => {
  const cells = resolveIndicatorCells(5, 0);
  assert.equal(cells.length, INDICATOR_SLOT_CAP);
  assert.equal(count(cells, "hidden"), INDICATOR_SLOT_CAP - 5);
  assert.equal(count(cells, "empty"), 5);
});

test("문항 7개(현재 DB 최대)면 8·9번 칸만 hidden", () => {
  const cells = resolveIndicatorCells(7, 0);
  assert.deepEqual(cells.slice(7), ["hidden", "hidden"]);
});

test("찾은 개수만큼 앞에서부터 채운다", () => {
  const cells = resolveIndicatorCells(5, 2);
  assert.deepEqual(cells.slice(0, 5), ["filled", "filled", "empty", "empty", "empty"]);
});

test("다 찾으면 보이는 칸이 전부 filled", () => {
  const cells = resolveIndicatorCells(5, 5);
  assert.equal(count(cells, "filled"), 5);
  assert.equal(count(cells, "empty"), 0);
});

test("상한을 넘으면 잘라내지 않고 실제 개수만큼 돌려준다", () => {
  const cells = resolveIndicatorCells(10, 0);
  assert.equal(cells.length, 10);
  assert.equal(count(cells, "hidden"), 0);
});

test("찾은 수가 문항 수보다 커도 칸 수를 넘겨 채우지 않는다", () => {
  const cells = resolveIndicatorCells(5, 99);
  assert.equal(count(cells, "filled"), 5);
});

test("문항이 0개면 전부 hidden", () => {
  const cells = resolveIndicatorCells(0, 0);
  assert.equal(count(cells, "hidden"), INDICATOR_SLOT_CAP);
});

test("게이지 비율은 0~1로 잘린다", () => {
  assert.equal(resolveGaugeRatio(GLOBAL_TIME_LIMIT_SEC, GLOBAL_TIME_LIMIT_SEC), 1);
  assert.equal(resolveGaugeRatio(0, GLOBAL_TIME_LIMIT_SEC), 0);
  assert.equal(resolveGaugeRatio(-5, GLOBAL_TIME_LIMIT_SEC), 0);
  assert.equal(resolveGaugeRatio(999, GLOBAL_TIME_LIMIT_SEC), 1);
});

test("게이지 비율 중간값", () => {
  assert.equal(resolveGaugeRatio(150, 300), 0.5);
});

test("limitSec이 0이면 0을 돌려준다(0으로 나누지 않는다)", () => {
  assert.equal(resolveGaugeRatio(10, 0), 0);
});

test("경고 임계값은 30초 이하 포함", () => {
  assert.equal(TIME_CRITICAL_SEC, 30);
  assert.equal(isTimeCritical(31), false);
  assert.equal(isTimeCritical(30), true);
  assert.equal(isTimeCritical(0), true);
});

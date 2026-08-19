import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveIndicatorCells,
  resolveGaugeRatio,
  isTimeCritical,
  TIME_CRITICAL_SEC,
  resolveGaugeCells,
  GAUGE_CELL_COUNT,
  GAUGE_WARN_CELLS,
} from "./hudIndicators.ts";
import { GLOBAL_TIME_LIMIT_SEC } from "./stageConfig.ts";

const count = (cells: string[], kind: string) => cells.filter((c) => c === kind).length;

/*
 * **칸 수는 문항 수와 정확히 같아야 한다.** 예전에는 항상 9칸을 그리고 초과분을
 * `hidden`으로 뒀는데, 그 칸이 자리를 차지해 보이는 칸이 왼쪽으로 쏠렸다
 * (2026-08-13). 여분 칸이 되살아나면 이 단정이 먼저 깨진다.
 */
test("칸 수는 문항 수와 같다 — 여분 칸을 그리지 않는다", () => {
  assert.equal(resolveIndicatorCells(5, 0).length, 5);
  assert.equal(resolveIndicatorCells(7, 0).length, 7);
  assert.equal(resolveIndicatorCells(10, 0).length, 10);
});

test("찾은 개수만큼 앞에서부터 채운다", () => {
  assert.deepEqual(resolveIndicatorCells(5, 2), ["filled", "filled", "empty", "empty", "empty"]);
});

test("다 찾으면 전부 filled", () => {
  const cells = resolveIndicatorCells(5, 5);
  assert.equal(count(cells, "filled"), 5);
  assert.equal(count(cells, "empty"), 0);
});

test("찾은 수가 문항 수보다 커도 칸 수를 넘겨 채우지 않는다", () => {
  assert.equal(count(resolveIndicatorCells(5, 99), "filled"), 5);
});

test("문항이 0개면 빈 배열", () => {
  assert.deepEqual(resolveIndicatorCells(0, 0), []);
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

test("게이지 칸: 100%면 20칸, 0이면 0칸", () => {
  assert.equal(resolveGaugeCells(GLOBAL_TIME_LIMIT_SEC, GLOBAL_TIME_LIMIT_SEC), GAUGE_CELL_COUNT);
  assert.equal(resolveGaugeCells(0, GLOBAL_TIME_LIMIT_SEC), 0);
});

test("게이지 칸: 20%(36초)가 경고 시작 경계 — 4칸", () => {
  assert.equal(resolveGaugeCells(36, GLOBAL_TIME_LIMIT_SEC), GAUGE_WARN_CELLS);
  // 1초만 더 남아도 아직 경고가 아니다(5칸).
  assert.equal(resolveGaugeCells(37, GLOBAL_TIME_LIMIT_SEC), 5);
});

test("게이지 칸: 5%(9초)가 breath 가속 경계 — 1칸", () => {
  assert.equal(resolveGaugeCells(9, GLOBAL_TIME_LIMIT_SEC), 1);
  assert.equal(resolveGaugeCells(10, GLOBAL_TIME_LIMIT_SEC), 2);
});

test("게이지 칸: 조금이라도 남으면 0칸이 되지 않는다(ceil)", () => {
  // floor였다면 1초 남았는데 게이지가 통째로 비어 보인다.
  assert.equal(resolveGaugeCells(1, GLOBAL_TIME_LIMIT_SEC), 1);
});

test("게이지 칸: limitSec이 0이면 0칸", () => {
  assert.equal(resolveGaugeCells(10, 0), 0);
});

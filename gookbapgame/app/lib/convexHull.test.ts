import { test } from "node:test";
import assert from "node:assert/strict";
import { convexHull } from "./convexHull.ts";

test("convexHull: 사각형 네 꼭짓점 + 내부 점 하나 -> 내부 점은 제외한 4개 꼭짓점만 반환", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
    { x: 5, y: 5 },
  ];

  const hull = convexHull(points);

  assert.equal(hull.length, 4);
  const hasPoint = (x: number, y: number) => hull.some((p) => p.x === x && p.y === y);
  assert.ok(hasPoint(0, 0));
  assert.ok(hasPoint(0, 10));
  assert.ok(hasPoint(10, 10));
  assert.ok(hasPoint(10, 0));
  assert.ok(!hasPoint(5, 5));
});

test("convexHull: 완전히 일직선인 점들은 양 끝 2개로 축약된다", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ];

  const hull = convexHull(points);

  assert.equal(hull.length, 2);
});

test("convexHull: 점이 3개 미만이면 그대로 반환", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];

  assert.deepEqual(convexHull(points), points);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { orderBaseImageCandidates, shuffled } from "./baseImageOrder.ts";

const img = (id: number) => ({ id });

test("직전 배경을 맨 뒤로 보낸다 — 대안이 있으면 다른 것이 먼저 뽑힌다", () => {
  const items = [img(1), img(2), img(3)];
  for (let i = 0; i < 50; i++) {
    const ordered = orderBaseImageCandidates(items, 2);
    assert.equal(ordered.at(-1)?.id, 2);
    assert.notEqual(ordered[0].id, 2);
  }
});

/*
 * 이 검사가 이 파일의 존재 이유다.
 *
 * 직전 배경을 목록에서 **빼버리면** 레벨당 배경이 1장일 때 후보가 0개가 되고,
 * `planGameSession`이 null → `preloadAllStages`가 `preload.levelSessionError` →
 * **다시하기가 통째로 막힌다.** 로컬 픽스처가 실제로 레벨당 1장이라 바로 걸린다.
 */
test("풀이 1장이면 그 한 장을 그대로 준다 — 절대 빈 배열이 되지 않는다", () => {
  const ordered = orderBaseImageCandidates([img(7)], 7);
  assert.deepEqual(ordered, [img(7)]);
});

test("모든 후보가 직전 것과 같아도 비지 않는다", () => {
  const ordered = orderBaseImageCandidates([img(5), img(5)], 5);
  assert.equal(ordered.length, 2);
});

test("직전 값이 없으면(첫 판) 전부 후보다", () => {
  for (const exclude of [null, undefined]) {
    const ordered = orderBaseImageCandidates([img(1), img(2)], exclude);
    assert.equal(ordered.length, 2);
    assert.deepEqual(
      ordered.map((o) => o.id).sort(),
      [1, 2]
    );
  }
});

test("목록에 없는 id를 제외로 넘겨도 항목이 사라지지 않는다", () => {
  const ordered = orderBaseImageCandidates([img(1), img(2)], 99);
  assert.equal(ordered.length, 2);
});

test("shuffled: 원본을 건드리지 않고 같은 원소를 돌려준다", () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffled(src);
  assert.deepEqual(src, [1, 2, 3, 4, 5]);
  assert.deepEqual([...out].sort((a, b) => a - b), src);
});

/*
 * `sort(() => 0.5 - Math.random())`은 비교자가 일관되지 않아 분포가 치우친다.
 * 다양성을 높이려는 것이 이 작업의 목적이므로 그 편향 자체가 문제다.
 * 3원소 순열 6가지가 모두 나오는지로 최소한의 균등성을 본다.
 */
test("shuffled: 3원소 순열 6가지가 모두 나온다", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    seen.add(shuffled([1, 2, 3]).join(""));
  }
  assert.equal(seen.size, 6, `나온 순열: ${[...seen].join(",")}`);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { selectSessionPlan } from "./sessionPlan.ts";
import type { GameMasterData, MasterPart } from "./gameMasterData.ts";

const part = (id: number, categoryId: number): MasterPart => ({
  id,
  categoryId,
  imageUrl: `p${id}.png`,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
});

type BaseSpec = {
  id: number;
  level: number;
  questionsCount?: number | null;
  /** 이 배경이 쓰는 카테고리들. 카테고리 하나당 슬롯 하나가 생긴다. */
  categories: number[];
};

/**
 * 카테고리마다 파츠 `partsPerCategory`개를 가진 마스터 데이터를 만든다.
 * 슬롯 id·좌표는 배경/카테고리로부터 결정적으로 만들어 겹치지 않게 한다.
 */
function masterOf(bases: BaseSpec[], partsPerCategory = 2): GameMasterData {
  const categoryIds = [...new Set(bases.flatMap((b) => b.categories))];

  return {
    baseImages: bases.map((b) => ({
      id: b.id,
      level: b.level,
      questionsCount: b.questionsCount ?? null,
      slots: b.categories.map((categoryId, i) => ({
        id: b.id * 100 + i,
        categoryId,
        x: i * 10,
        y: i * 10,
        scale: 1,
      })),
    })),
    partsByCategory: new Map(
      categoryIds.map((categoryId) => [
        categoryId,
        Array.from({ length: partsPerCategory }, (_, i) => part(categoryId * 10 + i, categoryId)),
      ])
    ),
    categoryNames: new Map(categoryIds.map((id) => [id, { ko: `카테고리${id}` }])),
  };
}

const diffCount = (plan: { slots: { leftPart: MasterPart; rightPart: MasterPart }[] }) =>
  plan.slots.filter((s) => s.leftPart.id !== s.rightPart.id).length;

test("지정한 레벨의 배경 중에서 고른다", () => {
  const master = masterOf([
    { id: 1, level: 1, categories: [100] },
    { id: 2, level: 2, categories: [100] },
  ]);

  const plan = selectSessionPlan(master, 2, 1, null);

  assert.ok(plan);
  assert.equal(plan.baseImageId, 2);
});

test("그 레벨에 배경이 없으면 null이다", () => {
  const master = masterOf([{ id: 1, level: 1, categories: [100] }]);

  assert.equal(selectSessionPlan(master, 5, 1, null), null);
});

/*
 * **출제 개수는 이미지가 정한다.** `base_images.questions_count`가 대시보드에서
 * 이미지마다 설정하는 값이고, `targetDiffCount`(STAGE_CONFIG)는 그 값이 없을 때만
 * 쓰는 폴백이다. 이 우선순위가 뒤집히면 대시보드에서 3개로 맞춰도 7단계가 7문항으로
 * 나온다(2026-08-07 이전에 실제로 그랬다).
 */
test("questions_count가 STAGE_CONFIG 폴백을 이긴다", () => {
  const master = masterOf([{ id: 1, level: 1, questionsCount: 4, categories: [1, 2, 3, 4, 5] }]);

  const plan = selectSessionPlan(master, 1, 1, null);

  assert.ok(plan);
  assert.equal(diffCount(plan), 4);
});

test("questions_count가 없으면 STAGE_CONFIG 폴백을 쓴다", () => {
  const master = masterOf([
    { id: 1, level: 1, questionsCount: null, categories: [1, 2, 3, 4, 5] },
  ]);

  const plan = selectSessionPlan(master, 1, 2, null);

  assert.ok(plan);
  assert.equal(diffCount(plan), 2);
});

test("차이 개수가 슬롯 수보다 많으면 슬롯 수로 줄인다", () => {
  const master = masterOf([{ id: 1, level: 1, questionsCount: 9, categories: [1, 2] }]);

  const plan = selectSessionPlan(master, 1, 9, null);

  assert.ok(plan);
  assert.equal(diffCount(plan), 2);
});

/** 파츠가 1개뿐인 카테고리는 좌/우를 다르게 만들 수 없어 슬롯 자체가 후보에서 빠진다. */
test("파츠가 2개 미만인 카테고리의 슬롯은 쓰지 않는다", () => {
  const master = masterOf([{ id: 1, level: 1, questionsCount: 1, categories: [100, 200] }]);
  master.partsByCategory.set(200, [part(2000, 200)]);

  const plan = selectSessionPlan(master, 1, 1, null);

  assert.ok(plan);
  assert.equal(plan.slots.length, 1);
  assert.equal(plan.slots[0].leftPart.categoryId, 100);
});

test("쓸 수 있는 슬롯이 하나도 없는 배경은 건너뛰고 다른 배경을 고른다", () => {
  const master = masterOf([
    { id: 1, level: 1, questionsCount: 1, categories: [100] },
    { id: 2, level: 1, questionsCount: 1, categories: [200] },
  ]);
  master.partsByCategory.set(100, [part(1000, 100)]); // 1번 배경은 통째로 쓸 수 없다

  for (let i = 0; i < 20; i++) {
    assert.equal(selectSessionPlan(master, 1, 1, null)?.baseImageId, 2);
  }
});

/*
 * **제외가 아니라 후순위다.** 목록에서 빼버리면 배경이 1장뿐인 레벨에서 후보가 0개가
 * 되어 게임이 아예 시작되지 않는다(`baseImageOrder.ts` 주석).
 */
test("직전 배경은 대안이 있으면 뽑히지 않는다", () => {
  const master = masterOf([
    { id: 1, level: 1, questionsCount: 1, categories: [100] },
    { id: 2, level: 1, questionsCount: 1, categories: [100] },
  ]);

  for (let i = 0; i < 20; i++) {
    assert.equal(selectSessionPlan(master, 1, 1, 1)?.baseImageId, 2);
  }
});

test("직전 배경뿐이면 그대로 다시 뽑는다", () => {
  const master = masterOf([{ id: 1, level: 1, questionsCount: 1, categories: [100] }]);

  assert.equal(selectSessionPlan(master, 1, 1, 1)?.baseImageId, 1);
});

test("차이 슬롯은 좌/우가 다른 파츠이고 나머지는 같은 파츠다", () => {
  const master = masterOf([{ id: 1, level: 1, questionsCount: 2, categories: [1, 2, 3, 4] }], 3);

  const plan = selectSessionPlan(master, 1, 1, null);

  assert.ok(plan);
  assert.equal(plan.slots.length, 4);
  assert.equal(diffCount(plan), 2);
  for (const slot of plan.slots) {
    assert.equal(slot.leftPart.categoryId, slot.rightPart.categoryId, "파츠는 슬롯의 카테고리에서 나온다");
  }
});

test("좌표와 배율이 같은 슬롯은 하나로 친다", () => {
  const master = masterOf([{ id: 1, level: 1, questionsCount: 1, categories: [100, 200] }]);
  // 두 슬롯을 같은 자리에 겹쳐 둔다 — 대시보드에서 실수로 겹쳐 등록된 경우다.
  master.baseImages[0].slots[1] = { ...master.baseImages[0].slots[1], x: 0, y: 0, scale: 1 };

  const plan = selectSessionPlan(master, 1, 1, null);

  assert.ok(plan);
  assert.equal(plan.slots.length, 1);
});

test("합성 요청에 쓸 슬롯 맵은 카테고리 id → 파츠 id다", () => {
  const master = masterOf([{ id: 1, level: 1, questionsCount: 1, categories: [100] }]);

  const plan = selectSessionPlan(master, 1, 1, null);

  assert.ok(plan);
  const slot = plan.slots[0];
  assert.equal(plan.leftImageSlots[100], slot.leftPart.id);
  assert.equal(plan.rightImageSlots[100], slot.rightPart.id);
});

test("힌트에 쓸 카테고리명을 슬롯에 싣는다", () => {
  const master = masterOf([{ id: 1, level: 1, questionsCount: 1, categories: [100] }]);

  const plan = selectSessionPlan(master, 1, 1, null);

  assert.deepEqual(plan?.slots[0].categoryName, { ko: "카테고리100" });
});

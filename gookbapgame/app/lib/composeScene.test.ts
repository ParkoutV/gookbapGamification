import { test } from "node:test";
import assert from "node:assert/strict";
import { computePlacement } from "./composeScene.ts";

test("정사각형 파츠, scale 1, offset 0 - 슬롯 박스에 꽉 참", () => {
  const result = computePlacement({
    x: 100,
    y: 50,
    slotScale: 1,
    offsetX: 0,
    offsetY: 0,
    partScale: 1,
    partNaturalWidth: 100,
    partNaturalHeight: 100,
  });
  assert.equal(result.width, 100);
  assert.equal(result.height, 100);
  assert.equal(result.left, 100);
  assert.equal(result.top, 50);
  assert.equal(result.clipLeft, 100);
  assert.equal(result.clipTop, 50);
  assert.equal(result.clipWidth, 100);
  assert.equal(result.clipHeight, 100);
});

test("가로가 긴 파츠 - object-contain으로 너비 기준 축소", () => {
  // B = 100*1.5 = 150, part는 200x100 (2:1) -> fit = min(150/200, 150/100) = 0.75
  // w = 200*0.75*1 = 150, h = 100*0.75*1 = 75
  const result = computePlacement({
    x: 0,
    y: 0,
    slotScale: 1.5,
    offsetX: 0,
    offsetY: 0,
    partScale: 1,
    partNaturalWidth: 200,
    partNaturalHeight: 100,
  });
  assert.equal(result.width, 150);
  assert.equal(result.height, 75);
  // 세로 중앙 정렬: top = y + (B-h)/2 = 0 + (150-75)/2 = 37.5
  assert.equal(result.left, 0);
  assert.equal(result.top, 37.5);
});

test("partScale 2배 - 중심 기준으로 확대되고 박스는 원래 크기로 클립됨", () => {
  // B = 100, part 100x100, fit = 1, partScale = 2 -> w = h = 200
  // left = x + (100-200)/2 + offsetX = x - 50 + offsetX
  const result = computePlacement({
    x: 10,
    y: 10,
    slotScale: 1,
    offsetX: 0,
    offsetY: 0,
    partScale: 2,
    partNaturalWidth: 100,
    partNaturalHeight: 100,
  });
  assert.equal(result.width, 200);
  assert.equal(result.height, 200);
  assert.equal(result.left, -40); // 10 - 50
  assert.equal(result.top, -40);
  // 클립 영역은 슬롯 박스 그대로 (확대된 파츠를 자름)
  assert.equal(result.clipLeft, 10);
  assert.equal(result.clipTop, 10);
  assert.equal(result.clipWidth, 100);
  assert.equal(result.clipHeight, 100);
});

test("offset 적용 - left/top에 그대로 더해짐", () => {
  const result = computePlacement({
    x: 100,
    y: 50,
    slotScale: 1,
    offsetX: 5,
    offsetY: -3,
    partScale: 1,
    partNaturalWidth: 100,
    partNaturalHeight: 100,
  });
  assert.equal(result.left, 105);
  assert.equal(result.top, 47);
});

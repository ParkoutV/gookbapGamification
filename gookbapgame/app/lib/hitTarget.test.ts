import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveHitTargetBox,
  polygonBoundsRatio,
  expandPolygon,
  MIN_TOUCH_TARGET_PX,
  SAFE_ZONE_PX,
  DEAD_ZONE_PX,
} from "./hitTarget.ts";
import type { Point } from "./convexHull.ts";

/** 슬롯 박스의 지정한 비율만큼을 채우는 사각 폴리곤(0~1 정규화). */
const boxPolygon = (wRatio: number, hRatio: number): Point[] => {
  const x0 = (1 - wRatio) / 2;
  const y0 = (1 - hRatio) / 2;
  return [
    { x: x0, y: y0 },
    { x: x0 + wRatio, y: y0 },
    { x: x0 + wRatio, y: y0 + hRatio },
    { x: x0, y: y0 + hRatio },
  ];
};

const boundsPx = (poly: Point[], boxW: number, boxH: number) => {
  const b = polygonBoundsRatio(poly)!;
  return { w: boxW * b.widthRatio, h: boxH * b.heightRatio };
};

test("polygonBoundsRatio: 폴리곤이 없거나 망가졌으면 null", () => {
  assert.equal(polygonBoundsRatio(null), null);
  assert.equal(polygonBoundsRatio([{ x: 0, y: 0 }]), null);
  assert.equal(polygonBoundsRatio([{ x: NaN, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]), null);
});

// 2026-08-07 실측(iPhone 16 Pro 393px) 3단계: 폭 76px은 충분한데 높이가 15px뿐이라
// 세로로 빗나가 오답이 됐다. AND로 판정하면 이 슬롯이 걸리지 않는다 — OR이어야 한다.
test("한 축만 미달이어도 보정한다(OR 판정)", () => {
  const slot = 76;
  const box = resolveHitTargetBox(slot, boxPolygon(1.0, 15 / 76));

  assert.equal(box.useClipPath, false, "너무 작으면 clip을 포기하고 사각형으로 넓힌다");
  // 부족한 높이만 최소치로 올라가고, 충분한 폭은 슬롯 크기를 유지한다(+safe-zone).
  assert.equal(box.height, MIN_TOUCH_TARGET_PX + SAFE_ZONE_PX * 2);
  assert.equal(box.width, slot + SAFE_ZONE_PX * 2);
});

test("두 축 모두 미달이면 둘 다 최소치로 올린다", () => {
  // 실측 6단계: 33x12
  const box = resolveHitTargetBox(33, boxPolygon(1.0, 12 / 33));
  assert.equal(box.width, MIN_TOUCH_TARGET_PX + SAFE_ZONE_PX * 2);
  assert.equal(box.height, MIN_TOUCH_TARGET_PX + SAFE_ZONE_PX * 2);
});

// 실측 4단계: 폴리곤 추출 실패로 circle(25%) 폴백. 유효 지름이 박스의 절반뿐이다.
test("폴리곤이 없으면 슬롯의 절반을 유효 크기로 보고 판정한다", () => {
  const box = resolveHitTargetBox(29, null);
  assert.equal(box.width, MIN_TOUCH_TARGET_PX + SAFE_ZONE_PX * 2);
  assert.equal(box.useClipPath, false);
});

test("보정된 박스는 중심을 유지한다", () => {
  const slot = 33;
  const box = resolveHitTargetBox(slot, boxPolygon(1.0, 12 / 33));
  // offset만큼 좌상단을 당기면 확장분이 양쪽에 균등하게 붙는다.
  assert.equal(box.offsetX, (box.width - slot) / 2);
  assert.equal(box.offsetY, (box.height - slot) / 2);
});

// 실측 5·7단계처럼 충분히 큰 슬롯은 실루엣 모양을 지켜야 한다.
test("크기가 충분하면 실루엣 모양을 유지하고 safe-zone만 더한다", () => {
  const slot = 112;
  const box = resolveHitTargetBox(slot, boxPolygon(0.62, 0.95)); // 69x106px

  assert.equal(box.useClipPath, true, "큰 슬롯은 clip-path를 유지한다");
  assert.equal(box.width, slot + SAFE_ZONE_PX * 2);
  assert.ok(box.polygon, "폴리곤이 있어야 한다");
});

// safe-zone은 "박스만 키우기"로는 만들 수 없다 — %로 정의된 폴리곤이 비례해서
// 커지면 여유가 생기는 게 아니라 실루엣 전체가 확대될 뿐이다.
test("safe-zone: 실루엣이 확대되는 게 아니라 테두리에 여유가 생긴다", () => {
  const slot = 112;
  const wRatio = 0.62;
  const hRatio = 0.95;
  const box = resolveHitTargetBox(slot, boxPolygon(wRatio, hRatio));

  const before = { w: slot * wRatio, h: slot * hRatio };
  const after = boundsPx(box.polygon!, box.width, box.height);

  // 각 변에서 대략 SAFE_ZONE_PX만큼 넓어져야 한다(양쪽이므로 2배).
  assert.ok(
    Math.abs(after.w - (before.w + SAFE_ZONE_PX * 2)) < 1.5,
    `폭: ${before.w.toFixed(1)} -> ${after.w.toFixed(1)} (기대 ${(before.w + SAFE_ZONE_PX * 2).toFixed(1)})`
  );
  assert.ok(
    Math.abs(after.h - (before.h + SAFE_ZONE_PX * 2)) < 1.5,
    `높이: ${before.h.toFixed(1)} -> ${after.h.toFixed(1)} (기대 ${(before.h + SAFE_ZONE_PX * 2).toFixed(1)})`
  );
});

test("무판정 구역은 정답 영역보다 deadZone만큼 더 크다", () => {
  const slot = 112;
  const box = resolveHitTargetBox(slot, boxPolygon(0.62, 0.95));

  assert.equal(box.deadZone.width, box.width + DEAD_ZONE_PX * 2);
  assert.equal(box.deadZone.height, box.height + DEAD_ZONE_PX * 2);
});

test("무판정 구역의 실루엣도 정답 영역보다 한 겹 바깥이다", () => {
  const slot = 112;
  const box = resolveHitTargetBox(slot, boxPolygon(0.62, 0.95));

  const answer = boundsPx(box.polygon!, box.width, box.height);
  const dead = boundsPx(box.deadZone.polygon!, box.deadZone.width, box.deadZone.height);

  assert.ok(
    Math.abs(dead.w - (answer.w + DEAD_ZONE_PX * 2)) < 1.5,
    `무판정 폭 ${dead.w.toFixed(1)}이 정답 폭 ${answer.w.toFixed(1)}보다 ${DEAD_ZONE_PX * 2}px 커야 한다`
  );
});

test("작은 슬롯도 무판정 구역을 갖는다(사각형)", () => {
  const box = resolveHitTargetBox(33, boxPolygon(1.0, 12 / 33));
  assert.equal(box.deadZone.polygon, null, "사각 영역이므로 clip이 없다");
  assert.equal(box.deadZone.width, box.width + DEAD_ZONE_PX * 2);
});

// 7단계 실측 최소 중심 거리는 73px이었다. 가장 크게 보정된 슬롯끼리 이웃해도
// 무판정 구역이 서로의 정답 영역을 침범하면 안 된다.
test("최대 보정 크기가 실측 최소 중심 거리 안에 들어온다", () => {
  const box = resolveHitTargetBox(20, null); // 가장 작은 슬롯 → 최대 보정
  const MEASURED_MIN_CENTER_DISTANCE = 73;

  // 두 슬롯의 정답 영역이 서로 닿지 않으려면 각 절반의 합이 중심 거리보다 작아야 한다.
  assert.ok(
    box.width < MEASURED_MIN_CENTER_DISTANCE,
    `정답 영역 ${box.width}px가 최소 중심 거리 ${MEASURED_MIN_CENTER_DISTANCE}px보다 작아야 한다`
  );
});

test("expandPolygon: 중심과 겹치는 꼭짓점이 있어도 NaN을 만들지 않는다", () => {
  const degenerate: Point[] = [
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 0.5 },
  ];
  const out = expandPolygon(degenerate, 0.1, 0.1);
  assert.ok(out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

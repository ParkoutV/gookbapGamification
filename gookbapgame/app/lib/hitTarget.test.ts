import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// 2026-08-07 배포 사고: 큰 슬롯 + 폴리곤 없음 조합에서
// `Cannot read properties of null (reading 'map')`으로 3단계 진입 시 화면이 죽었다.
// 폴리곤이 없으면 effectiveW/H가 슬롯의 절반이 되는데, 슬롯이 112px 이상이면
// 그 절반도 56px을 넘어 "충분함" 판정을 받고 clip 경로로 내려가 폴리곤을 map했다.
// 기존 테스트는 작은 슬롯(29px)만 null로 검사해서 이 조합이 비어 있었다.
test("폴리곤이 없으면 슬롯이 커도 사각형으로 처리한다(터지지 않는다)", () => {
  for (const slot of [112, 200, 400]) {
    const box = resolveHitTargetBox(slot, null);
    assert.equal(box.useClipPath, false, `${slot}px: clip을 쓰면 안 된다`);
    assert.equal(box.polygon, null);
    assert.ok(Number.isFinite(box.width) && box.width > 0);
  }
});

test("폴리곤이 망가져 있어도(NaN/길이 부족) 터지지 않는다", () => {
  const broken: Point[][] = [
    [{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  ];
  for (const poly of broken) {
    const box = resolveHitTargetBox(200, poly);
    assert.equal(box.useClipPath, false);
    assert.ok(Number.isFinite(box.width));
  }
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

/*
 * 2026-08-19, 이란토. 무판정 구역은 **실루엣 bbox + 10px**이다. 낮에는 슬롯 캔버스
 * 전체로 넓혔었는데, 붙어 있는 슬롯들의 사각형이 이어져 **명백한 오답에도 감점이
 * 없었다.** 파트는 캔버스 정사각형에 letterbox로 들어가므로(284x110이면 높이의 39%),
 * 캔버스만 한 무판정 구역은 물체보다 2.6배 높다.
 *
 * 두 가지를 동시에 지켜야 한다: 정답으로 눌리는 자리는 **빠짐없이** 덮어야 하고
 * (안 그러면 정답 영역 가장자리가 배경까지 뚫려 감점된다), letterbox 여백은 덮지
 * 않아야 한다.
 */
test("무판정 구역은 정답 영역을 모두 덮는다", () => {
  const cases: [number, Point[] | null][] = [
    [112, boxPolygon(0.62, 0.95)], // clip 경로
    [200, boxPolygon(1.0, 0.05)], // 큰 슬롯 + 얇은 실루엣 → 56px 보정 경로
    [200, null], // 폴리곤 없음
    [33, boxPolygon(1.0, 12 / 33)], // 작은 슬롯
  ];
  for (const [slot, polygon] of cases) {
    const box = resolveHitTargetBox(slot, polygon);
    const dz = box.deadZone;

    // 정답 영역: clip 경로는 실루엣 + safe-zone, 아니면 박스 사각형 전체.
    const hit = box.useClipPath
      ? (() => {
          const b = polygonBoundsRatio(box.polygon)!;
          return {
            left: -box.offsetX + b.minX * box.width,
            top: -box.offsetY + b.minY * box.height,
            right: -box.offsetX + (b.minX + b.widthRatio) * box.width,
            bottom: -box.offsetY + (b.minY + b.heightRatio) * box.height,
          };
        })()
      : {
          left: -box.offsetX,
          top: -box.offsetY,
          right: -box.offsetX + box.width,
          bottom: -box.offsetY + box.height,
        };

    assert.ok(dz.left <= hit.left, `${slot}px: 무판정 좌변이 정답 영역 안쪽이다`);
    assert.ok(dz.top <= hit.top, `${slot}px: 무판정 상변이 정답 영역 안쪽이다`);
    assert.ok(dz.left + dz.width >= hit.right, `${slot}px: 무판정 우변이 정답 영역 안쪽이다`);
    assert.ok(dz.top + dz.height >= hit.bottom, `${slot}px: 무판정 하변이 정답 영역 안쪽이다`);
  }
});

/*
 * letterbox 여백이 무판정으로 남으면 원래 문제(감점 실종)가 되돌아온다.
 * 284x110 파트가 정사각 캔버스에 들어간 모양 — 높이는 캔버스의 39%뿐이다.
 */
test("무판정 구역이 캔버스의 letterbox 여백까지 먹지 않는다", () => {
  const slot = 200;
  const box = resolveHitTargetBox(slot, boxPolygon(0.95, 0.39));

  assert.ok(
    box.deadZone.height < slot,
    `무판정 높이 ${box.deadZone.height}px가 캔버스 ${slot}px보다 작아야 한다`
  );
  // 실루엣(78px) + (safe 5 + dead 5) * 2 = 98px 언저리.
  assert.ok(Math.abs(box.deadZone.height - (slot * 0.39 + (SAFE_ZONE_PX + DEAD_ZONE_PX) * 2)) < 1);
});

/*
 * 실루엣이 캔버스 중앙에 있다는 보장이 없다. 한쪽으로 치우친 파트에서 무판정
 * 구역을 슬롯 중심에 맞추면 반대쪽이 비어 정답 영역이 배경까지 뚫린다.
 */
test("무판정 구역은 실루엣을 따라 치우친다 — 슬롯 중심 대칭이 아니다", () => {
  const slot = 200;
  const offCenter: Point[] = [
    { x: 0.55, y: 0.1 },
    { x: 0.95, y: 0.1 },
    { x: 0.95, y: 0.9 },
    { x: 0.55, y: 0.9 },
  ];
  const box = resolveHitTargetBox(slot, offCenter);

  const pad = SAFE_ZONE_PX + DEAD_ZONE_PX;
  assert.ok(Math.abs(box.deadZone.left - (0.55 * slot - pad)) < 0.01);
  assert.ok(Math.abs(box.deadZone.width - (0.4 * slot + pad * 2)) < 0.01);
});

/*
 * 무판정 구역에 clip-path를 다시 걸면 실루엣 모양으로 좁아져 위 규칙이 무너진다.
 * 그런데 `buildClipPath(null)`은 "클립 없음"이 아니라 `circle(25%)`를 돌려주므로,
 * 폴리곤 없이 clipPath만 남겨도 **에러 없이** 슬롯 1/4짜리 원이 된다.
 * 타입에서 `deadZone.polygon`을 지웠기 때문에 tsc가 막아주긴 하지만, 그건
 * `buildClipPath(undefined as never)` 같은 우회를 막지 못한다 — 렌더 지점을 직접 본다.
 *
 * JSX는 `--experimental-strip-types`가 파싱하지 못하므로 소스를 문자열로 훑는다
 * (`tutorialShots.test.ts`와 같은 방식).
 */
test("무판정 구역 div에는 clipPath가 없다", () => {
  const source = readFileSync("app/components/GameScreen.tsx", "utf8");
  const start = source.indexOf("key={`dead-${slot.slotId}`}");
  assert.ok(start > 0, "무판정 구역 div를 찾지 못했다");
  const block = source.slice(start, source.indexOf("/>", start));
  assert.ok(!block.includes("clipPath"), "clipPath가 걸리면 슬롯 1/4 원으로 쪼그라든다");
});

/*
 * 정답 표시(체크)는 캔버스 중심에 놓이는데 무판정 구역은 실루엣 bbox를 따라간다.
 * 치우친 실루엣에서는 마커가 무판정 바깥이라, 클릭을 통과시키면 배경까지 내려가
 * **다 맞힌 슬롯을 눌렀는데 10점 감점 + 오답 1회**가 된다(2026-08-14 회귀).
 */
test("정답 표시는 클릭을 통과시키지 않는다", () => {
  const source = readFileSync("app/components/GameScreen.tsx", "utf8");
  const start = source.indexOf('src="/icons/check-success.svg"');
  assert.ok(start > 0, "정답 표시 마커를 찾지 못했다");
  const block = source.slice(start, source.indexOf("/>", start));
  assert.ok(!block.includes("pointer-events-none"), "클릭이 배경까지 내려가 감점된다");
  assert.ok(block.includes("stopPropagation"), "클릭을 삼켜야 한다");
});

/*
 * 무판정 사각형은 이웃한 **미출제 슬롯** 위를 덮는다(2026-08-19 실기: 1단계에서
 * 대추가 옆 슬롯의 무판정 안에 통째로 들어가 눌러도 감점이 없었다). 미출제 슬롯이
 * 자기 실루엣을 무판정 **위에** 얹어 클릭을 배경까지 흘려보내는 것이 해법이라,
 * 세 가지가 함께 지켜져야 한다: 미출제 슬롯을 그릴 것 / 핸들러를 달지 말 것 /
 * 무판정보다 뒤(위)에 그릴 것.
 */
test("미출제 슬롯의 오답 영역이 무판정 위에 깔린다", () => {
  const source = readFileSync("app/components/GameScreen.tsx", "utf8");

  const start = source.indexOf("key={`decoy-${slot.slotId}`}");
  assert.ok(start > 0, "미출제 슬롯 레이어를 찾지 못했다");
  const block = source.slice(start, source.indexOf("/>", start));
  assert.ok(!block.includes("onClick"), "핸들러를 달면 배경까지 올라가지 않아 감점이 사라진다");
  assert.ok(block.includes("clipPath"), "실루엣 clip이 없으면 캔버스째 덮어 이웃 정답을 가린다");

  // 같은 zIndex(0)라 DOM 순서가 승패를 가른다 — 무판정보다 **뒤**에 와야 이긴다.
  for (const side of ["left", "right"]) {
    const dead = source.indexOf(`renderDeadZones("${side}")`);
    const decoy = source.indexOf(`renderDecoyZones("${side}")`);
    const hit = source.indexOf(`renderClickOverlays("${side}")`);
    assert.ok(dead > 0 && decoy > dead, `${side}: 미출제 레이어가 무판정보다 앞에 있다`);
    assert.ok(hit > decoy, `${side}: 정답 영역이 미출제 레이어에 가린다`);
  }
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

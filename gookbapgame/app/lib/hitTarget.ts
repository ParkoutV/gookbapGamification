import type { Point } from "./convexHull.ts";

/**
 * 터치 타깃 최소 크기(px). Apple HIG 44pt / Material 48dp를 넘도록 잡았다.
 *
 * 상한을 이 값으로 정한 근거는 실측이다(2026-08-07, iPhone 16 Pro 393px 뷰포트).
 * 7단계는 문항이 가장 많아 슬롯이 가장 빽빽한데, 그때 **슬롯 간 최소 중심 거리가
 * 73px**이었다. 두 슬롯을 각각 56px로 키워도 서로 닿지 않는다(56 < 73).
 * 72px까지 올리면 그 구성에서 경계가 맞닿아 어느 쪽이 먹었는지 모호해진다.
 */
export const MIN_TOUCH_TARGET_PX = 56;

/**
 * 실루엣 폴리곤(0~1 정규화)의 bounding box 비율. 폴리곤이 없거나 망가졌으면 null.
 */
export function polygonBoundsRatio(
  polygon: Point[] | null
): { widthRatio: number; heightRatio: number } | null {
  if (!polygon || polygon.length < 3) return null;
  if (polygon.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;

  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return {
    widthRatio: Math.max(...xs) - Math.min(...xs),
    heightRatio: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * 실루엣 테두리 바깥으로 더 주는 여유(px). 가장자리를 아슬하게 눌러도 정답으로
 * 인정된다 — 56px 보정이 "작은 슬롯"만 구제하는 데 비해, 이쪽은 **모든 슬롯**의
 * 경계에 적용되는 완충이다(2026-08-07, 이란토).
 *
 * 56px 보정을 **먼저** 하고 그 결과에 이 여유를 더한다. 최대 크기는 56 + 5*2 = 66px이고,
 * 실측 최소 중심 거리 73px 안에 들어온다. 대시보드 문항 상한이 7개라 그보다
 * 촘촘한 배치는 나오지 않는다.
 */
export const SAFE_ZONE_PX = 5;

/**
 * safe-zone 바깥에 한 겹 더 두는 **무판정 구역**의 두께(px)(2026-08-07, 이란토).
 *
 * 여기를 누르면 정답도 오답도 아니다 — 아무 일도 일어나지 않는다. safe-zone이
 * "아슬한 터치를 정답으로 살려주는" 구역이라면, 이쪽은 "명백히 빗나갔지만
 * 페널티를 주기엔 가혹한" 구역이다. 오답은 3회 제한과 10점 감점이 걸려 있어서,
 * 거의 맞힌 터치를 오답으로 세면 체감이 나쁘다.
 *
 * 결과적으로 실루엣 테두리에서 바깥으로 5px까지는 정답, 그다음 5px은 무반응,
 * 그 바깥이 오답이다(총 10px 완충).
 */
export const DEAD_ZONE_PX = 5;

export type HitTargetBox = {
  /** 히트 영역의 최종 크기(px). */
  width: number;
  height: number;
  /** 박스가 원래 슬롯 크기에서 커진 만큼의 절반 — 중심을 유지하려면 이만큼 당겨야 한다. */
  offsetX: number;
  offsetY: number;
  /**
   * false면 clip-path를 걸지 않는다. 실루엣이 너무 작아 사각형으로 대체한 경우다 —
   * 이때 clip을 그대로 두면 %로 정의된 폴리곤이 확대된 박스에서 같은 비율로
   * 커져서, 결국 원래와 똑같이 작은 유효 면적이 남는다.
   */
  useClipPath: boolean;
  /**
   * clip-path에 쓸 폴리곤. safe-zone만큼 바깥으로 밀어낸 결과이며,
   * `useClipPath`가 false면 null이다.
   */
  polygon: Point[] | null;
  /**
   * 무판정 구역(정답 영역 바깥 한 겹). 정답 박스와 같은 중심에 `DEAD_ZONE_PX`만큼
   * 더 크다. 클릭이 배경(오답 판정)까지 내려가지 않게 막기만 한다.
   */
  deadZone: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    /** 정답 폴리곤을 무판정 구역 박스 기준으로 다시 잡고 한 번 더 밀어낸 것. */
    polygon: Point[] | null;
  };
};

/**
 * 볼록 다각형을 중심 기준으로 바깥으로 밀어낸다. `convexHull`이 만든 폴리곤만
 * 들어오므로 항상 볼록이고, 그래서 중심에서 밀어내도 자기교차가 생기지 않는다
 * (오목 다각형이면 이 방법을 쓸 수 없다).
 *
 * **왜 outline/border/stroke가 아니라 좌표를 미는가**(2026-08-07 질문):
 * `clip-path`에는 stroke 개념이 없다. 클리핑은 "이 영역 안만 보여라"일 뿐이라
 * 테두리를 넓히는 수단이 없고, `outline`/`border`는 클립된 **뒤에** 잘려나가
 * 히트 영역을 넓히지 못한다. SVG `<path>` + `stroke-width`로는 가능하지만
 * (stroke도 pointer 판정에 잡힌다) 렌더 구조를 div에서 SVG로 바꿔야 하고,
 * stroke는 선 **중앙** 기준이라 바깥 5px을 얻으려면 절반이 실루엣 안쪽을 덮는다.
 * 좌표를 미는 쪽이 겹치는 요소도 늘지 않고 현재의 마커 레이어 구조도 유지된다.
 *
 * `padRatioX`/`Y`는 0~1 정규화 좌표계에서의 여유다 — 축마다 박스 크기가 다를 수
 * 있어(56px 보정이 한 축만 늘리는 경우) 따로 받는다.
 *
 * **축마다 따로 민다.** 방향 단위벡터(대각선)로 밀면 각 축의 증가분이
 * `pad * cos(각도)`로 줄어들어, 세로로 긴 모양일수록 가로 여유가 모자란다
 * (실측: 기대 +10px인데 +5.5px만 늘었다 — 테스트가 이걸 잡았다).
 * 중심 기준 부호대로 각 축을 밀면 모든 변에서 여유가 정확히 pad가 된다.
 */
export function expandPolygon(polygon: Point[], padRatioX: number, padRatioY: number): Point[] {
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;

  return polygon.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    // 중심축 위의 꼭짓점(dx 또는 dy가 0)은 그 축으로 밀지 않는다 — 부호가 없어
    // 어느 쪽으로 밀지 정할 수 없고, 밀면 모양이 한쪽으로 치우친다.
    return {
      x: p.x + Math.sign(dx) * padRatioX,
      y: p.y + Math.sign(dy) * padRatioY,
    };
  });
}

/**
 * 슬롯 하나의 히트 영역 크기를 정한다.
 *
 * **판정은 OR다** — 폭과 높이 중 **어느 한쪽이라도** 최소치에 못 미치면 보정한다
 * (2026-08-07, 이란토). AND로 보면 3단계의 `76×15px` 같은 슬롯이 걸리지 않는데,
 * 폭이 넉넉해도 높이가 15px이면 세로로 빗나가 오답 처리되는 바로 그 경우다.
 *
 * 보정은 **부족한 축만** 최소치로 밀어올린다. 배수(`transform: scale()`)로 키우면
 * 넘치는 축까지 함께 커져서(76px → 220px) 인접 슬롯을 덮는다.
 *
 * 실측 근거(iPhone 16 Pro 393px): 3단계 76×15 / 41×9, 4단계 fallback 29px,
 * 6단계 33×12 / 35×13이 모두 최소치 미달이었다. 1·5·7단계는 60px 이상이라
 * 보정 대상이 아니다 — 이란토가 지목한 7단계가 오히려 가장 여유롭다.
 */
/**
 * 슬롯 크기 기준(0~1)으로 정의된 폴리곤을, 그보다 큰 박스 기준 좌표로 다시 잡고
 * `pad`만큼 바깥으로 밀어낸다.
 *
 * 재배치가 필요한 이유: 폴리곤 좌표는 %라서, 박스만 키우면 실루엣도 같은 비율로
 * 커진다. 그러면 여유를 준 게 아니라 그냥 전체가 확대될 뿐이다.
 */
function rebaseAndExpand(
  polygon: Point[],
  slotSizePx: number,
  boxW: number,
  boxH: number,
  pad: number
): Point[] {
  const shrinkX = slotSizePx / boxW;
  const shrinkY = slotSizePx / boxH;
  const rebased = polygon.map((p) => ({
    x: (boxW - slotSizePx) / 2 / boxW + p.x * shrinkX,
    y: (boxH - slotSizePx) / 2 / boxH + p.y * shrinkY,
  }));
  return expandPolygon(rebased, pad / boxW, pad / boxH);
}

export function resolveHitTargetBox(
  slotSizePx: number,
  polygon: Point[] | null,
  minTarget: number = MIN_TOUCH_TARGET_PX,
  safeZone: number = SAFE_ZONE_PX,
  deadZone: number = DEAD_ZONE_PX
): HitTargetBox {
  const bounds = polygonBoundsRatio(polygon);

  // 폴리곤이 없으면 clip-path는 circle(25%)로 떨어진다 — 유효 지름이 슬롯의 절반뿐이다.
  const effectiveW = bounds ? slotSizePx * bounds.widthRatio : slotSizePx * 0.5;
  const effectiveH = bounds ? slotSizePx * bounds.heightRatio : slotSizePx * 0.5;

  // 1단계: 최소 터치 타깃 보정. 부족한 축만 키우고, 이미 충분한 축은 그대로 둔다.
  // 배수로 키우면 넘치는 축까지 함께 커져 인접 슬롯을 덮는다.
  const tooSmall = effectiveW < minTarget || effectiveH < minTarget;

  if (tooSmall) {
    // 실루엣이 이 정도로 작으면 모양을 지키는 의미가 없다. clip을 포기하고 사각형으로
    // 넓힌다 — 폴리곤을 남기면 %로 정의돼 있어 박스와 같은 비율로 커지고,
    // 결국 유효 면적은 원래대로 작게 남는다.
    const width = (effectiveW >= minTarget ? slotSizePx : minTarget) + safeZone * 2;
    const height = (effectiveH >= minTarget ? slotSizePx : minTarget) + safeZone * 2;
    const dzW = width + deadZone * 2;
    const dzH = height + deadZone * 2;
    return {
      width,
      height,
      offsetX: (width - slotSizePx) / 2,
      offsetY: (height - slotSizePx) / 2,
      useClipPath: false,
      polygon: null,
      deadZone: {
        width: dzW,
        height: dzH,
        offsetX: (dzW - slotSizePx) / 2,
        offsetY: (dzH - slotSizePx) / 2,
        // 정답 영역이 사각형이므로 무판정 구역도 사각형이다.
        polygon: null,
      },
    };
  }

  // 2단계: 크기가 충분한 슬롯은 실루엣 모양을 지키되, 테두리 바깥으로 safe-zone만큼
  // 여유를 준다. 박스를 양쪽으로 넓히고 폴리곤을 그만큼 바깥으로 밀어낸다 —
  // 박스만 넓히면 %로 정의된 폴리곤이 비례해 커져 여유가 균일하지 않다.
  const width = slotSizePx + safeZone * 2;
  const height = slotSizePx + safeZone * 2;

  // 3단계: 무판정 구역은 정답 영역보다 deadZone만큼 더 밀어낸 같은 모양이다.
  const dzW = slotSizePx + (safeZone + deadZone) * 2;
  const dzH = slotSizePx + (safeZone + deadZone) * 2;

  return {
    width,
    height,
    offsetX: safeZone,
    offsetY: safeZone,
    useClipPath: true,
    polygon: rebaseAndExpand(polygon!, slotSizePx, width, height, safeZone),
    deadZone: {
      width: dzW,
      height: dzH,
      offsetX: safeZone + deadZone,
      offsetY: safeZone + deadZone,
      polygon: rebaseAndExpand(polygon!, slotSizePx, dzW, dzH, safeZone + deadZone),
    },
  };
}

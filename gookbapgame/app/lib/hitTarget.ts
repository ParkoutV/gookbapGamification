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
): { widthRatio: number; heightRatio: number; minX: number; minY: number } | null {
  if (!polygon || polygon.length < 3) return null;
  if (polygon.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;

  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return {
    widthRatio: Math.max(...xs) - Math.min(...xs),
    heightRatio: Math.max(...ys) - Math.min(...ys),
    minX: Math.min(...xs),
    minY: Math.min(...ys),
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
 * **무판정 구역이 실루엣 바깥으로 더 나가는 두께(px)**(2026-08-07, 이란토).
 *
 * 여기를 누르면 정답도 오답도 아니다 — 아무 일도 일어나지 않는다. safe-zone이
 * "아슬한 터치를 정답으로 살려주는" 구역이라면, 이쪽은 "명백히 빗나갔지만
 * 페널티를 주기엔 가혹한" 구역이다. 오답은 3회 제한과 10점 감점이 걸려 있어서,
 * 거의 맞힌 터치를 오답으로 세면 체감이 나쁘다.
 *
 * **모양은 실루엣을 따라간다**(2026-08-19 저녁, 실기 확인 후). 그날 낮에 슬롯 캔버스
 * 전체로 넓혔다가 bounding box로 좁혔는데, 실기에서 7단계 무판정 사각형 셋이 판
 * 면적의 88%를 덮는 것이 나왔다(184x220짜리 하나가 판 높이 전체). 반찬상처럼 비스듬히
 * 놓인 큰 파트는 bbox가 실루엣보다 훨씬 크고, 그 안에 든 야채 그릇을 눌러도 감점이
 * 없었다 — **명백한 오답에 페널티가 물리적으로 불가능**해진다.
 *
 * 캔버스 전체로 넓혔던 이유(파트의 투명한 자리를 눌렀는데 오답)는 이제 원인 쪽에서
 * 해결됐다 — 히트 폴리곤이 양쪽 실루엣의 합집합이라 "물체가 사라진 자리"가 정답
 * 영역 안이다(`unionSlotPolygon`). 그래서 모양을 따라가도 그 제보가 재발하지 않는다.
 * **이 근거가 무너지면(합집합을 되돌리면) 여기도 함께 되돌려야 한다.**
 *
 * 지금 규칙: 실루엣 + 5px = 정답 / **실루엣 + 10px = 무판정** / 그 바깥 = 오답.
 * 실루엣은 볼록 껍질이라 오목한 곳·구멍은 애초에 그 안이다.
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
   * 무판정 구역. 클릭이 배경(오답 판정)까지 내려가지 않게 막기만 한다.
   *
   * `left`/`top`은 **슬롯 원점 기준 px**이며 음수일 수 있다. 실루엣이 캔버스 중앙에
   * 있지 않을 수 있어 중심 대칭을 가정하지 않는다.
   *
   * `polygon`이 있으면 그 모양으로 clip한다. 없으면(실루엣을 못 쓰는 경로) 사각형
   * 그대로다 — 그때는 렌더 지점에서 **clipPath를 걸지 말 것.**
   * `buildClipPath(null)`은 "클립 없음"이 아니라 `circle(25%)`를 돌려주므로 무판정
   * 구역이 슬롯 1/4짜리 원으로 쪼그라든다(에러도 나지 않는다).
   */
  deadZone: {
    left: number;
    top: number;
    width: number;
    height: number;
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

type Rect = { left: number; top: number; width: number; height: number };

/** 슬롯 원점 기준 px 사각형. `pad`만큼 사방으로 넓힌다. */
function padRect(rect: Rect, pad: number): Rect {
  return {
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

function unionRect(a: Rect, b: Rect): Rect {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return {
    left,
    top,
    width: Math.max(a.left + a.width, b.left + b.width) - left,
    height: Math.max(a.top + a.height, b.top + b.height) - top,
  };
}

/** 실루엣 bbox(0~1 비율)를 슬롯 원점 기준 px 사각형으로 바꾸고 `pad`만큼 넓힌다. */
function silhouetteRect(
  bounds: NonNullable<ReturnType<typeof polygonBoundsRatio>>,
  slotSizePx: number,
  pad: number
): Rect {
  return padRect(
    {
      left: bounds.minX * slotSizePx,
      top: bounds.minY * slotSizePx,
      width: bounds.widthRatio * slotSizePx,
      height: bounds.heightRatio * slotSizePx,
    },
    pad
  );
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

  // **폴리곤이 없으면 크기와 무관하게 사각형 경로로 간다.** 아래 clip 경로는
  // 폴리곤을 재배치·확장하므로 null이면 터진다 — 실제로 그랬다(2026-08-07 배포에서
  // `Cannot read properties of null (reading 'map')`으로 3단계 진입 시 화면이
  // 통째로 죽었다). 큰 슬롯이라도 실루엣 추출에 실패하면 여기로 와야 한다.
  if (tooSmall || !bounds) {
    // 실루엣이 이 정도로 작으면 모양을 지키는 의미가 없다. clip을 포기하고 사각형으로
    // 넓힌다 — 폴리곤을 남기면 %로 정의돼 있어 박스와 같은 비율로 커지고,
    // 결국 유효 면적은 원래대로 작게 남는다.
    const width = (effectiveW >= minTarget ? slotSizePx : minTarget) + safeZone * 2;
    const height = (effectiveH >= minTarget ? slotSizePx : minTarget) + safeZone * 2;

    // **박스는 캔버스 중심이 아니라 실루엣 중심에 놓는다**(2026-08-19). 정답 폴리곤이
    // 두 그림의 차이 영역이 된 뒤로(`getDiffSilhouette`) 폴리곤이 캔버스 한구석에
    // 몰릴 수 있다 — 캔버스 중심에 놓으면 표적이 **달라진 자리가 아닌 곳**에 생긴다.
    // 실루엣이 캔버스 중앙을 채우던 시절에는 두 값이 같았다.
    const centerX = bounds ? (bounds.minX + bounds.widthRatio / 2) * slotSizePx : slotSizePx / 2;
    const centerY = bounds ? (bounds.minY + bounds.heightRatio / 2) * slotSizePx : slotSizePx / 2;
    const offsetX = width / 2 - centerX;
    const offsetY = height / 2 - centerY;
    // 무판정 구역은 정답 박스(사각형 전체가 눌린다)를 반드시 덮어야 하고, 실루엣이
    // 그보다 옆으로 튀어나오면 그쪽도 덮는다. **캔버스 바닥은 걸지 않는다** —
    // letterbox 여백까지 무판정으로 두면 명백한 오답에도 감점이 없다(`DEAD_ZONE_PX`).
    // 실루엣 정보가 아예 없을 때(`!bounds`)만 예전처럼 캔버스를 바닥으로 쓴다.
    const boxRect = { left: -offsetX, top: -offsetY, width, height };
    const floor = bounds
      ? silhouetteRect(bounds, slotSizePx, deadZone)
      : { left: -deadZone, top: -deadZone, width: slotSizePx + deadZone * 2, height: slotSizePx + deadZone * 2 };
    return {
      width,
      height,
      offsetX,
      offsetY,
      useClipPath: false,
      polygon: null,
      // 이 경로는 정답 영역이 사각형이라 무판정도 사각형이다.
      deadZone: { ...unionRect(padRect(boxRect, deadZone), floor), polygon: null },
    };
  }

  // 여기 도달했다면 bounds가 있다는 뜻이고, bounds는 polygon이 유효할 때만 만들어진다
  // (polygonBoundsRatio가 null/길이/NaN을 모두 걸러낸다). non-null 단언(`polygon!`)을
  // 쓰지 않는 이유는, 그 단언이 위 분기를 잘못 건드렸을 때 타입 검사를 조용히
  // 통과시켜 런타임에 터지게 만들기 때문이다 — 실제로 그렇게 터졌다.
  if (!polygon) {
    throw new Error("resolveHitTargetBox: bounds가 있는데 polygon이 없다 — 도달 불가");
  }

  // 2단계: 크기가 충분한 슬롯은 실루엣 모양을 지키되, 테두리 바깥으로 safe-zone만큼
  // 여유를 준다. 박스를 양쪽으로 넓히고 폴리곤을 그만큼 바깥으로 밀어낸다 —
  // 박스만 넓히면 %로 정의된 폴리곤이 비례해 커져 여유가 균일하지 않다.
  const width = slotSizePx + safeZone * 2;
  const height = slotSizePx + safeZone * 2;

  // 3단계: 무판정 구역은 **실루엣 모양을 따라간다**(위 `DEAD_ZONE_PX` 주석).
  // 정답 영역이 실루엣 + safe-zone이므로 여기에 deadZone을 더 얹은 한 겹이다.
  const dzPad = safeZone + deadZone;
  const dzW = slotSizePx + dzPad * 2;
  const dzH = slotSizePx + dzPad * 2;

  return {
    width,
    height,
    offsetX: safeZone,
    offsetY: safeZone,
    useClipPath: true,
    polygon: rebaseAndExpand(polygon, slotSizePx, width, height, safeZone),
    deadZone: {
      left: -dzPad,
      top: -dzPad,
      width: dzW,
      height: dzH,
      polygon: rebaseAndExpand(polygon, slotSizePx, dzW, dzH, dzPad),
    },
  };
}

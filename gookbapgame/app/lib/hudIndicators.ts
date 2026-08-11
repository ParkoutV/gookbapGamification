import { INDICATOR_SLOT_CAP } from "./stageConfig.ts";

/**
 * 남은 시간이 이 값 이하면 경고 표시로 바뀐다.
 *
 * **현재 화면에서 쓰이지 않는다**(2026-08-11). 게이지 경고 시점이 20%(4칸)로
 * 통일되면서 판정이 `resolveGaugeCells` 쪽으로 넘어갔다 — 30초는 10%라 시점이
 * 둘로 갈렸다. 이 상수와 `isTimeCritical`은 테스트만 참조한다.
 * **경고 판정에 이걸 다시 쓰지 말 것** — 진실이 두 개가 된다. 삭제는 별건이다.
 */
export const TIME_CRITICAL_SEC = 30;

export type IndicatorCell = "filled" | "empty" | "hidden";

/**
 * 문항 인디케이터의 칸별 상태.
 *
 * 기본은 `cap`개를 그리고 문항 수를 넘는 칸을 `hidden`으로 둔다 — 칸 수를 실제로
 * 늘렸다 줄이면 단계마다 레이아웃 폭이 출렁이기 때문이다. 그래서 호출부는
 * `hidden`을 `display: none`이 아니라 `opacity: 0`으로 그려야 한다(자리는 유지).
 *
 * **문항이 `cap`을 넘으면 잘라내지 않고 실제 개수만큼 돌려준다.** 이때만 폭이
 * 달라지는데, 조용히 잘려서 사용자가 원 개수를 목표로 삼았다가 "다 채웠는데
 * 안 끝나는" 상황이 되는 것보다 낫다.
 */
export function resolveIndicatorCells(
  total: number,
  found: number,
  cap: number = INDICATOR_SLOT_CAP
): IndicatorCell[] {
  const visible = Math.max(0, total);
  const length = Math.max(cap, visible);
  const filled = Math.min(Math.max(0, found), visible);

  return Array.from({ length }, (_, i) => {
    if (i >= visible) return "hidden";
    return i < filled ? "filled" : "empty";
  });
}

/** 타이머 게이지 채움 비율(0~1). limitSec이 0 이하면 0. */
export function resolveGaugeRatio(remainingSec: number, limitSec: number): number {
  if (limitSec <= 0) return 0;
  return Math.min(1, Math.max(0, remainingSec / limitSec));
}

export function isTimeCritical(remainingSec: number): boolean {
  return remainingSec <= TIME_CRITICAL_SEC;
}

/** 타이머 게이지 총 칸 수. 한 칸 = 5%. */
export const GAUGE_CELL_COUNT = 20;

/** 이 칸 수 이하면 경고(색 전환 + breath). 20% = 4칸. */
export const GAUGE_WARN_CELLS = 4;

/**
 * 타이머 게이지의 남은 칸 수(0~20).
 *
 * **`Math.ceil`이다.** `floor`면 1초 남았는데 0칸이 되어 "아직 시간이 있는데 다 빈"
 * 게이지가 뜬다 — 0칸은 남은 시간이 실제로 0일 때만이어야 한다.
 *
 * 경고 시점(4칸)과 breath 가속 시점(1칸)은 **전부 이 결과에서 나온다.** 초를 따로
 * 비교해 판정하지 말 것 — `isTimeCritical`(30초)과 여기가 갈리면 진실이 두 개가 된다.
 */
export function resolveGaugeCells(remainingSec: number, limitSec: number): number {
  return Math.ceil(resolveGaugeRatio(remainingSec, limitSec) * GAUGE_CELL_COUNT);
}

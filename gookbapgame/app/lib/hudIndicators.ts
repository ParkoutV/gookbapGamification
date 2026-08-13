/**
 * 남은 시간이 이 값 이하면 경고 표시로 바뀐다.
 *
 * **현재 화면에서 쓰이지 않는다**(2026-08-11). 게이지 경고 시점이 20%(4칸)로
 * 통일되면서 판정이 `resolveGaugeCells` 쪽으로 넘어갔다 — 30초는 10%라 시점이
 * 둘로 갈렸다. 이 상수와 `isTimeCritical`은 테스트만 참조한다.
 * **경고 판정에 이걸 다시 쓰지 말 것** — 진실이 두 개가 된다. 삭제는 별건이다.
 */
export const TIME_CRITICAL_SEC = 30;

export type IndicatorCell = "filled" | "empty";

/**
 * 문항 인디케이터의 칸별 상태. **실제 문항 수만큼만** 돌려준다.
 *
 * 예전에는 항상 9칸(`INDICATOR_SLOT_CAP`)을 그리고 문항 수를 넘는 칸을 `hidden`으로
 * 둔 뒤 호출부가 `opacity: 0`으로 감췄다 — 단계마다 인디케이터 폭이 출렁이는 것을
 * 막으려는 것이었다. 그런데 감춘 칸이 자리를 그대로 차지하는데 컨테이너가
 * `flex-start`라, 5문항 단계에서는 **보이는 5칸이 왼쪽으로 쏠려** 가운데 정렬로
 * 보이지 않았다(2026-08-13 실기 확인, 이란토). 주석은 "가운데 정렬"이라고 적혀
 * 있었지만 `justify-content`가 없었다.
 *
 * 폭 출렁임과 쏠림 중 후자가 실제로 눈에 걸렸으므로 감춘 칸을 없애고 가운데
 * 정렬(`justify-center`)에 맡긴다. 단계가 넘어갈 때 인디케이터 폭이 달라지지만
 * 중심이 고정이라 좌우로 균등하게 자란다.
 */
export function resolveIndicatorCells(total: number, found: number): IndicatorCell[] {
  const length = Math.max(0, total);
  const filled = Math.min(Math.max(0, found), length);

  return Array.from({ length }, (_, i) => (i < filled ? "filled" : "empty"));
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

import { INDICATOR_SLOT_CAP } from "./stageConfig.ts";

/** 남은 시간이 이 값 이하면 경고 표시로 바뀐다. */
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

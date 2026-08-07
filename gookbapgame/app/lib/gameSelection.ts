export function clampDifferenceCount(
  targetDiffCount: number,
  availableSlotCount: number
): number {
  return Math.min(targetDiffCount, availableSlotCount);
}

/**
 * 출제할 차이 개수를 정한다. **이미지가 정한 값이 우선이다.**
 *
 * `base_images.questions_count`는 대시보드에서 이미지마다 설정하는 값이고,
 * 그 이미지가 어느 레벨에 나올지도 이미지가 정한다. 그래서 같은 레벨이라도
 * 뽑힌 이미지에 따라 개수가 다를 수 있다 — 의도된 설계다(2026-08-07, 이란토).
 *
 * `fallback`(STAGE_CONFIG의 diffCount)은 그 컬럼이 비었을 때만 쓴다.
 * 2026-08-07 이전에는 폴백이 유일한 기준이라, 대시보드에서 3개로 설정해도
 * 레벨 7이 항상 7문항으로 나왔다.
 *
 * 0 이하나 숫자가 아닌 값은 설정되지 않은 것으로 본다 — DB 기본값이 3이라
 * 정상 운영에서는 나오지 않지만, 0이 그대로 통과하면 차이가 하나도 없는
 * 판이 만들어져 플레이어가 영원히 클리어할 수 없다.
 */
export function resolveQuestionsCount(
  configured: number | null | undefined,
  fallback: number
): number {
  return typeof configured === "number" && Number.isFinite(configured) && configured > 0
    ? configured
    : fallback;
}

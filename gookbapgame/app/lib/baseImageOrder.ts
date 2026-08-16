/**
 * 배경 이미지 후보의 순서를 정한다 — **직전 판에 쓴 것을 뒤로 미룬다.**
 *
 * 게임을 다시 시작하면 `preloadAllStages`가 레벨 1~7을 **병렬로** 새로 뽑는데, 각
 * `planGameSession` 호출은 서로도 직전 판도 알지 못한다. 그래서 같은 레벨이 연속으로
 * 같은 배경을 고를 수 있다 — 레벨당 배경이 3장이면 확률 1/3이다. 그걸 막을 코드가
 * 지금까지 아무 데도 없었다(2026-08-15, 이란토).
 *
 * **레벨 간 중복은 애초에 불가능하다.** `planGameSession`이 `.eq("level", level)`로
 * 자기 레벨 풀에서만 뽑으므로 한 판 안에서 7레벨이 겹칠 일이 없다 — 그건 이미 공짜다.
 * 남은 구멍은 **연속된 두 판 사이의 같은 레벨**뿐이라 이 함수의 관심사도 그것뿐이다.
 *
 * ## 제외가 아니라 후순위다 — 이게 핵심이다
 *
 * 직전 배경을 목록에서 **빼버리면 안 된다.** 레벨당 배경이 1장인 경우가 실제로 있고
 * (로컬 픽스처가 그렇다), 그러면 후보가 0개가 되어 `planGameSession`이 `null`을 돌려주고
 * `preloadAllStages`가 그것을 `preload.levelSessionError`로 바꿔 **게임이 아예 시작되지
 * 않는다.** 다시하기가 통째로 막히는 것이라 중복보다 훨씬 나쁘다.
 *
 * 그래서 빼는 대신 **맨 뒤로 보낸다.** 대안이 있으면 자연히 다른 것이 뽑히고, 대안이
 * 없으면 그대로 다시 뽑힌다. 호출부는 후보가 비는 경우를 신경 쓸 필요가 없다.
 *
 * ## 같은 배경이 다시 나와도 "기출 그대로"는 아니다
 *
 * 정답 슬롯(`diffIndices`)과 파츠는 매 호출 다시 뽑히므로, 배경이 같아도 문제는 달라진다
 * (이란토가 요청한 것도 "기출변형 없이 그대로 중복"되는 것의 방지다). 이 함수는 그중
 * 가장 눈에 띄는 축인 배경만 흔든다.
 */

/** Fisher-Yates. `sort(() => 0.5 - Math.random())`은 비교자가 편향돼 조합이 고르지 않다. */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 무작위로 섞되 `excludeId`와 같은 id를 가진 항목을 **맨 뒤로** 보낸다.
 *
 * `excludeId`가 null이거나 목록에 없으면 그냥 섞은 결과와 같다.
 * 모든 항목이 `excludeId`와 같아도(=풀이 1장) 빈 배열이 되지 않는다.
 */
export function orderBaseImageCandidates<T extends { id: number }>(
  items: readonly T[],
  excludeId: number | null | undefined
): T[] {
  const shuffledItems = shuffled(items);
  if (excludeId == null) return shuffledItems;

  const preferred = shuffledItems.filter((item) => item.id !== excludeId);
  const deferred = shuffledItems.filter((item) => item.id === excludeId);
  return [...preferred, ...deferred];
}

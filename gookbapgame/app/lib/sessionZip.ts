/**
 * 출제 계획(레벨별) + 합성 URL(좌/우 평면 배열)을 세션으로 합치는 자리.
 *
 * **여기가 이 기능에서 가장 위험한 줄이다** — 14개 URL을 7레벨에 되돌려 붙이는 곳이라,
 * 어긋나면 3단계 화면에 5단계 그림이 **에러 없이** 들어간다. `planAllGameSessions`는
 * Supabase를 타서 단위 테스트 대상이 아니므로(이 저장소 관례), 그 함수에서 이 계산만
 * 순수 함수로 떼어 테스트 가능한 층에 둔다.
 *
 * 특히 **계획이 일부 실패하면 `plans`와 `urls`의 길이 관계가 깨진다.** 실패한 레벨은
 * 조합을 만들지 않으므로 URL도 없다(7레벨 중 1개 실패 → 12 URL). 그래서 `plans`의
 * 인덱스로 URL을 찾으면 그 뒤 레벨이 전부 한 칸씩 밀린다 — 성사된 계획만 따로 세어야 한다.
 */

/** 좌/우 URL을 붙이기 전의 계획. `GameSession`에서 URL만 빠진 것이다. */
export type PlanLike<T> = T & { level: number };

export type ZipResult<T> = { level: number; leftSceneUrl: string; rightSceneUrl: string; plan: PlanLike<T> } | null;

/**
 * `plans` 순서 그대로 돌려주되, 실패한 자리(`null`)는 `null`로 남긴다.
 *
 * `urls`는 성사된 계획을 좌·우 순서로 늘어놓은 것이며(`[L1좌, L1우, L2좌, L2우, ...]`),
 * 개수가 맞지 않으면 **통째로 실패로 친다** — 한 칸이라도 밀리면 어느 레벨이 잘못됐는지
 * 알 수 없는 채로 틀린 그림이 나가는 것보다, 게임을 시작하지 않는 편이 낫다.
 */
export function zipPlansToSessions<T>(
  plans: (PlanLike<T> | null)[],
  urls: string[]
): ZipResult<T>[] {
  const ready = plans.filter((p): p is PlanLike<T> => p !== null);

  // `requestUnifiedImages`가 이미 개수를 보장하지만, 그 보증은 다른 파일에 있다.
  // 틀린 게임을 내보내는 것이 바로 이 줄이므로 여기서 한 번 더 잠근다.
  if (urls.length !== ready.length * 2) {
    return plans.map(() => null);
  }

  const byLevel = new Map<number, { left: string; right: string }>();
  ready.forEach((p, i) => {
    byLevel.set(p.level, { left: urls[i * 2], right: urls[i * 2 + 1] });
  });

  return plans.map((plan) => {
    if (!plan) return null;
    const pair = byLevel.get(plan.level);
    if (!pair) return null;
    return { level: plan.level, leftSceneUrl: pair.left, rightSceneUrl: pair.right, plan };
  });
}

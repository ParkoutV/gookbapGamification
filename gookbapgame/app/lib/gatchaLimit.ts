/**
 * 뽑기 횟수 제한 안내 문구의 번역 키와 치환값을 고른다.
 *
 * **`limit_type`에 따라 판정 기준이 실제로 다르다**(저쪽 `api/gatcha/draw/route.ts`
 * 실물 확인, 2026-08-14):
 * - `days`: KST **자정** 기준으로 `limit_n`일 이내 → "1일 3회", 자정에 리셋된다.
 * - `hours`: `now - limit_n시간`의 **롤링 윈도우** → "3시간 동안 3회".
 *
 * 그래서 `hours`에는 "오늘"이라는 말을 쓸 수 없다. 자정 리셋이 아니므로 틀린 안내가
 * 된다 — 문구를 한쪽으로 고정하지 말 것.
 *
 * `days`이면서 `limitN === 1`일 때만 "하루"로 줄여 읽는다. 2일 이상이면 "N일 동안"이
 * 맞고, 그 경우 "오늘"이라고 하면 범위를 좁게 오해한다.
 */
export type GatchaLimitLike = {
  limitType: string;
  limitN: number;
  limitM: number;
};

export type GatchaLimitNotice = {
  key: string;
  params: Record<string, string | number>;
};

export function gatchaLimitNotice(
  settings: GatchaLimitLike | null
): GatchaLimitNotice | null {
  if (!settings) return null;
  const { limitType, limitN, limitM } = settings;
  // 안내할 것이 없는 설정. 0회는 뽑기 자체가 막힌 상태라 "0회까지 가능"이 말이 안 되고,
  // 음수·비정상 값도 마찬가지다(`fetchGatchaLimit`이 이미 걸러내지만 여기서도 막는다).
  if (!Number.isFinite(limitM) || limitM <= 0) return null;
  if (!Number.isFinite(limitN) || limitN <= 0) return null;

  if (limitType === "hours") {
    return { key: "tutorial.drawLimitHours", params: { hours: limitN, count: limitM } };
  }
  // 기본은 days. 대시보드 select의 기본값이기도 하다.
  if (limitN === 1) {
    return { key: "tutorial.drawLimitDaily", params: { count: limitM } };
  }
  return { key: "tutorial.drawLimitDays", params: { days: limitN, count: limitM } };
}

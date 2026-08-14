/**
 * 랭킹 탭의 기간 경계. **달력 기준이 아니라 롤링 윈도우다**(2026-08-14, 이란토).
 *
 * 2026-08-13에는 달력 기준이었다 — "이번 주 1위"가 집계·쿠폰 지급에 직관적이라는
 * 이유였다. 뒤집은 근거는 **빈 랭킹**이다: 주 경계로 자르면 월요일 오전과 매월 1일에
 * 주간·월간 탭이 통째로 비고, 매장 QR로 막 들어온 사람이 첫 화면에서 그걸 본다.
 * 게임이 죽은 것처럼 보이는 데다 하필 주의 시작이라 그 상태가 오래 간다.
 * 롤링이면 창이 하루씩 밀려 항상 채워져 있다.
 *
 * 그래서 탭 이름도 "이번 주/이번 달"이 아니라 **"최근 7일/최근 30일"**이다 —
 * 한쪽만 바꾸면 표시와 집계가 어긋난다(달력 기준으로 되돌린다면 문구도 함께 되돌릴 것).
 *
 * 이 값은 `joined_time`을 서버에서 거르는 데 쓴다(`.gte()`). 기간 필터를 클라이언트로
 * 가져오면 PostgREST 행 상한에 걸려 **오류 없이** 랭킹이 틀어진다(`rankingRows.ts` 주석).
 */
export type RankingPeriod = "daily" | "weekly" | "monthly" | "total";

/** 탭 순서. 화면과 테스트가 같은 배열을 쓴다. */
export const RANKING_PERIODS: readonly RankingPeriod[] = ["daily", "weekly", "monthly", "total"];

const KST = "Asia/Seoul";

/**
 * KST 기준 오늘 날짜(YYYY-MM-DD).
 *
 * `en-CA`가 ISO 형식을 주는 로케일이라 파싱 없이 쓸 수 있다. 표시용이 아니라 계산용이라
 * 사용자 로케일과 무관하게 고정한다(`couponRemaining.ts`와 같은 판단).
 */
function kstYmd(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: KST });
}

/**
 * KST 날짜 문자열을 **실제 시점(instant)** 으로 만든다.
 *
 * **`couponRemaining.ts`의 `kstDayStart`를 재사용하지 말 것 — 9시간 구멍이 뚫린다.**
 * 그쪽은 `T00:00:00Z`를 붙여 UTC 자정을 만드는데, 그것은 날짜 차를 빼기 위한 **비교용
 * 키**이고 실제 시점이 아니다. KST 오늘 00:00은 **UTC 어제 15:00**인데 그 함수는 UTC
 * 오늘 00:00(= KST 09:00)을 준다. 그 값으로 `joined_time`을 거르면 **KST 00:00~09:00에
 * 플레이한 기록이 통째로 사라지고, 오류는 나지 않는다.**
 *
 * 그래서 `Z`가 아니라 `+09:00`을 붙인다.
 */
function kstMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

/** YYYY-MM-DD에서 n일을 뺀 YYYY-MM-DD. 날짜 칸끼리 계산하므로 시간대가 개입하지 않는다. */
function ymdMinusDays(ymd: string, days: number): string {
  const shifted = new Date(`${ymd}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() - days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * 기간 시작 시점. `total`은 경계가 없으므로 null이다.
 *
 * `now`를 인자로 받는 것은 테스트에서 시각을 고정하기 위해서다.
 */
export function rankingPeriodStart(period: RankingPeriod, now: Date = new Date()): Date | null {
  if (period === "total") return null;

  const today = kstYmd(now);

  if (period === "daily") return kstMidnight(today);

  /*
   * **오늘을 포함해** 세므로 하루를 덜 뺀다 — "최근 7일"은 오늘 + 지난 6일이다.
   * 그대로 7을 빼면 8일치가 잡힌다.
   *
   * 뺄셈은 **시점이 아니라 날짜 칸**에서 한다. 시점에서 밀리초를 빼면 그 사이에 낀
   * 일광절약시간이 개입할 수 있는데, KST는 DST가 없어도 이쪽이 읽기 쉽고 틀릴 자리가 없다.
   */
  const days = period === "weekly" ? 7 : 30;
  return kstMidnight(ymdMinusDays(today, days - 1));
}

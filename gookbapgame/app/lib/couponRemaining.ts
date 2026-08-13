import { isCouponExpired } from "./couponUsability.ts";
import type { IssuedCoupon } from "../actions";

/** 이 일수 이하면 임박으로 강조한다. 주말을 건너도 한 번은 매장에 갈 수 있는 길이다. */
export const COUPON_EXPIRY_SOON_DAYS = 3;

/** `couponDates.ts`와 같은 값이어야 한다 — 한쪽만 바꾸면 표시 날짜와 남은 일수가 갈린다. */
const COUPON_TIME_ZONE = "Asia/Seoul";

export type CouponRemaining =
  /** 만료일이 없다(무기한) 또는 값이 깨졌다. 아무것도 표시하지 않는다. */
  | { kind: "none" }
  | { kind: "expired" }
  | { kind: "used" }
  /** `days`는 0(오늘까지) 이상. `soon`이면 강조한다. */
  | { kind: "remaining"; days: number; soon: boolean };

/**
 * KST 기준 날짜(YYYY-MM-DD)를 UTC 자정 타임스탬프로 환산한다.
 *
 * **밀리초 차이를 86400000으로 나누면 안 된다.** `expired_at`은 KST
 * 23:59:59.999로 저장되므로(`couponUsability.ts`), 지금이 밤이면 남은 밀리초가
 * 하루보다 적어 "오늘까지"인 쿠폰이 0일이 아니라 1일 미만으로 잘리거나 반대로
 * 부풀어 오른다. 손님이 세는 단위는 **날짜 칸의 개수**이므로 양쪽을 날짜로
 * 내려놓고 빼야 한다.
 *
 * `en-CA`는 ISO 형식(YYYY-MM-DD)을 주는 로케일이라 파싱 없이 쓸 수 있다.
 * 표시용 로케일(`DATE_LOCALES`)과 무관하게 고정한다 — 여기서 나온 문자열은
 * 화면에 나가지 않고 계산에만 쓰인다.
 */
function kstDayStart(date: Date): number {
  const ymd = date.toLocaleDateString("en-CA", { timeZone: COUPON_TIME_ZONE });
  return Date.parse(`${ymd}T00:00:00Z`);
}

const MS_PER_DAY = 86_400_000;

/**
 * 쿠폰의 남은 사용 기간. `now`를 받는 것은 테스트에서 시각을 고정하기 위해서다.
 *
 * **사용 완료가 만료보다 먼저다.** 이미 쓴 쿠폰에 "2일 남음"을 띄우면 아직 쓸 수
 * 있다는 뜻으로 읽힌다.
 */
export function resolveCouponRemaining(
  coupon: Pick<IssuedCoupon, "expiredAt" | "isUsed">,
  now: Date = new Date()
): CouponRemaining {
  if (coupon.isUsed) return { kind: "used" };
  if (coupon.expiredAt == null) return { kind: "none" };

  const expiry = new Date(coupon.expiredAt);
  if (Number.isNaN(expiry.getTime())) return { kind: "none" };

  // 만료 판정은 `isCouponExpired`에 맡긴다 — 앨범의 도장·흐림 처리가 그것을 보고
  // 있어서, 여기서 따로 비교하면 경계에서 "만료 도장 + 0일 남음"이 함께 뜰 수 있다.
  if (isCouponExpired(coupon, now)) return { kind: "expired" };

  const days = Math.round((kstDayStart(expiry) - kstDayStart(now)) / MS_PER_DAY);
  // 음수는 위 만료 분기가 이미 걸러냈지만, 시계가 어긋난 기기를 위해 바닥을 둔다.
  const safeDays = Math.max(0, days);
  return { kind: "remaining", days: safeDays, soon: safeDays <= COUPON_EXPIRY_SOON_DAYS };
}

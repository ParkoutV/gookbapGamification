import type { IssuedCoupon } from "../actions";
import type { Locale } from "./i18n/types.ts";
import { DATE_LOCALES } from "./i18n/dateLocales.ts";

/**
 * 쿠폰의 사용 가능 기간 줄을 조립한다.
 *
 * **화면(`GatchaCard`)과 저장 이미지(`cardImage.ts`)가 같은 배열을 쓴다.** 두 곳이
 * 각자 날짜를 만들면 한쪽만 고쳤을 때 화면과 저장본이 조용히 달라진다 — 카드 앞면
 * 레이아웃에서 이미 여러 번 난 사고라(AGENTS.md) 조립을 여기 한 곳으로 모은다.
 * `formatNickname`이 닉네임 조립을 한 곳에 모아둔 것과 같은 구조다.
 *
 * **날짜는 KST로 고정한다.** `expired_at`은 KST 23:59:59.999로 저장되므로
 * (`couponUsability.ts`), 기기 시간대로 렌더하면 한국보다 서쪽에 있는 기기에서
 * 만료일이 **하루 앞당겨져** 보인다. 발급일(서버 시각)도 같은 이유로 KST다 —
 * 매장에서 "쿠폰에 찍힌 날짜"를 기준으로 이야기하므로 기기마다 달라지면 안 된다.
 */
const COUPON_TIME_ZONE = "Asia/Seoul";

export type CouponDateLine = { key: string; text: string };

function formatDate(iso: string, locale: Locale): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(DATE_LOCALES[locale] ?? "en-US", {
    timeZone: COUPON_TIME_ZONE,
  });
}

/**
 * 사용 가능 기간을 **한 줄로** 돌려준다. 값이 없으면 빈 배열이다.
 *
 * **발급일은 넣지 않는다**(2026-08-13, 이란토 확인). 한때 발급일·시작일·사용기한
 * 3줄을 나열했는데(2026-08-12 기획 요청) 매장 카운터에서 발급일을 쓰지 않고,
 * 손님에게 의미가 있는 것은 "언제부터 언제까지 쓸 수 있나" 하나였다. 세로 3줄이
 * 카드 안에서 QR과 무게를 다투는 문제도 함께 사라진다.
 * - 곁가지 효과: 3줄 시절엔 발급일·시작일에만 라벨이 있고 사용기한은 `{date}까지`로
 *   라벨이 없어서, 셋 중 정작 중요한 줄을 못 알아볼 여지가 있었다. 한 줄이면 그
 *   비대칭이 생기지 않는다.
 * - **발급일을 되살리려면 매장 쪽 요구를 먼저 확인할 것.** 카드 공간이 좁아 줄을
 *   늘리면 상품명이 자동 축소 바닥(30px)에 더 빨리 닿는다.
 *
 * 배열을 돌려주는 형태는 유지한다 — 호출부(`GatchaCard` / `cardImage.ts` /
 * `MyCouponsScreen`)가 줄 목록을 받는 구조이고, 나중에 줄이 늘 여지도 있다.
 *
 * 시작일이 없으면 사용기한만 있는 줄로 떨어진다. `valid_from`은 `get_my_coupons`가
 * 실제로 주지만(2026-08-13 확인) 옛 쿠폰에는 비어 있고, `expired_at`도 null로 온
 * 시기가 있었다(AGENTS.md 참고) — 양쪽 다 없으면 줄 자체가 없다.
 */
export function couponDateLines(
  coupon: Pick<IssuedCoupon, "validFrom" | "expiredAt">,
  locale: Locale,
  t: (key: string, vars?: Record<string, string>) => string
): CouponDateLine[] {
  // 파싱 실패한 값은 없는 것으로 친다 — "Invalid Date"를 띄우지 않는다.
  const from = coupon.validFrom == null ? null : formatDate(coupon.validFrom, locale);
  const until = coupon.expiredAt == null ? null : formatDate(coupon.expiredAt, locale);

  if (from != null && until != null) {
    return [{ key: "period", text: t("coupon.validPeriod", { from, until }) }];
  }
  if (until != null) {
    return [{ key: "period", text: t("coupon.expiresAt", { date: until }) }];
  }
  if (from != null) {
    return [{ key: "period", text: t("coupon.validFrom", { date: from }) }];
  }
  return [];
}

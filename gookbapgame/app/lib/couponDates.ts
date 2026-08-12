import type { IssuedCoupon } from "../actions";
import type { Locale } from "./i18n/types.ts";
import { DATE_LOCALES } from "./i18n/dateLocales.ts";

/**
 * 카드 앞면에 들어가는 날짜 줄들을 조립한다.
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
 * 발급일 → 시작일 → 사용기한 순서로, **값이 있는 줄만** 담아 돌려준다.
 *
 * `validFrom`은 아직 `get_my_coupons`가 돌려주지 않아 대개 비어 있다(2026-08-12).
 * 서버가 컬럼을 추가하면 이 코드를 고치지 않아도 그 줄이 자동으로 나타난다 —
 * 그래서 없을 때 자리를 비우는 대신 줄 자체를 생략한다.
 */
export function couponDateLines(
  coupon: Pick<IssuedCoupon, "issuedAt" | "validFrom" | "expiredAt">,
  locale: Locale,
  t: (key: string, vars?: Record<string, string>) => string
): CouponDateLine[] {
  const lines: CouponDateLine[] = [];

  const push = (key: string, iso: string | null | undefined, messageKey: string) => {
    if (iso == null) return;
    const date = formatDate(iso, locale);
    if (date == null) return; // 파싱 실패한 값은 조용히 생략한다 — "Invalid Date"를 띄우지 않는다.
    lines.push({ key, text: t(messageKey, { date }) });
  };

  push("issued", coupon.issuedAt, "coupon.issuedAt");
  push("valid", coupon.validFrom, "coupon.validFrom");
  push("expiry", coupon.expiredAt, "coupon.expiresAt");

  return lines;
}

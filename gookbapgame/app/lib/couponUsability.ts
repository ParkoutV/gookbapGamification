import type { IssuedCoupon } from "../actions";

/**
 * expired_at은 KST 23:59:59.999로 저장된다(가챠 API 참고). Date 비교는 UTC 기준으로
 * 이뤄지므로 타임존 변환을 따로 하지 않아도 시점 비교는 정확하다.
 */
export function isCouponExpired(coupon: IssuedCoupon): boolean {
  return coupon.expiredAt !== null && new Date(coupon.expiredAt) < new Date();
}

/** 이미 쓰였거나 만료돼 QR을 보여줘선 안 되는 쿠폰인지. */
export function isCouponUnusable(coupon: IssuedCoupon): boolean {
  return coupon.isUsed || isCouponExpired(coupon);
}

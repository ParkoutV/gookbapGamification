import type { Locale } from "./i18n/types.ts";

/**
 * gookbapanalyze/components/coupon/CouponScanner.tsx의 isValidUUID와 동일한 정규식.
 * 스캐너는 이 정규식을 통과하지 못하는 QR을 "다른 종류의 QR"로 보고 조용히 무시한다.
 */
const SCANNABLE_COUPON_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isScannableCouponId(value: string): boolean {
  return SCANNABLE_COUPON_ID.test(value);
}

/**
 * 매장 스캐너가 읽는 QR 문자열을 만든다: `<coupon_id>?<locale>`
 *
 * locale은 게임의 로케일 코드를 변환 없이 그대로 싣는다. 스캐너는 이 값으로
 * supported_languages에서 안내문(coupon_use_text)을 고른다. 상대 쪽 코드 표기가
 * 다르더라도(예: ja를 jp로 저장) 매핑 함수로 덮지 않는다 — 순수 언어 코드가 원칙이고,
 * 오기입은 입력한 쪽에서 바로잡는다. 설계 문서의 "미해결 항목" 참고.
 */
export function buildCouponQrPayload(couponId: string, locale: Locale): string {
  if (!isScannableCouponId(couponId)) {
    throw new Error(`스캔 불가능한 coupon_id 형식입니다: ${couponId}`);
  }
  return `${couponId}?${locale}`;
}

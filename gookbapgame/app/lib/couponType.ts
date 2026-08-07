import type { LocalizedName } from "./i18n/localizedName.ts";

/**
 * `coupon_effects.coupon_type`을 다국어 이름 맵으로 편다.
 *
 * 그 컬럼은 jsonb가 아니라 **text**다(gookbapanalyze/AGENTS.md의 테이블 정의) —
 * 다국어 이름 맵이 JSON **문자열**로 들어 있어서 Supabase가 파싱해주지 않는다.
 * 파싱을 빼먹으면 `name["ko"]`가 undefined가 되어 상품명이 "—"로,
 * 코너 이모지가 기본값(🍽️)으로 조용히 떨어진다 — 에러는 나지 않는다.
 *
 * 이미 객체면 그대로 둔다. 컬럼 타입이 나중에 jsonb로 바뀌어도 깨지지 않는다.
 * 파싱에 실패하면 문자열 자체를 한국어 이름으로 본다 — 관리자가 JSON이 아닌
 * 평문을 넣은 경우이고, gookbapanalyze의 CouponScanner도 같은 폴백을 쓴다.
 */
export function parseCouponType(value: string | LocalizedName): LocalizedName {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" ? (parsed as LocalizedName) : { ko: value };
  } catch {
    return { ko: value };
  }
}

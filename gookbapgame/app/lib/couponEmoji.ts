import type { LocalizedName } from "./i18n/localizedName.ts";

/**
 * 상품명에서 이모지 하나를 고른다. 카드 앞면에서 상품명 앞에 붙는 장식이다.
 *
 * 매칭은 **한국어 이름만** 본다(2026-08-07 결정, 이란토). 상품은 대시보드에서
 * 자유 입력되는 다국어 jsonb라 어느 언어든 임의 문자열이 들어올 수 있는데,
 * 언어마다 키워드 표를 만들면 표가 세 배로 늘고 어차피 새 상품은 못 맞춘다.
 * 한국어 이름은 관리자가 반드시 채우는 값이라 이것만 봐도 실질 적중률이 같다.
 */
export const DEFAULT_COUPON_EMOJI = "🍽️";

/**
 * 먼저 걸리는 항목이 이긴다 — 순서가 곧 우선순위다.
 * 긴 키워드를 위에 둘 것: "국밥"은 "밥"보다 먼저 와야 🍲가 나온다.
 *
 * 전용 이모지가 없는 품목(순대 등)은 일부러 넣지 않는다. 모양만 비슷한
 * 이모지(🍢, 🍡)를 억지로 붙이면 다른 음식으로 오해받는 쪽이 더 나쁘다.
 */
const KEYWORD_EMOJI: ReadonlyArray<readonly [string, string]> = [
  ["국밥", "🍲"],
  ["뚝배기", "🍲"],
  ["찌개", "🍲"],
  ["탕", "🍲"],
  ["공기밥", "🍚"],
  ["공깃밥", "🍚"],
  ["음료", "🥤"],
  ["콜라", "🥤"],
  ["사이다", "🥤"],
  ["커피", "☕"],
  ["아메리카노", "☕"],
  ["수육", "🥩"],
  ["고기", "🥩"],
  ["만두", "🥟"],
  ["김치", "🥬"],
  ["계란", "🥚"],
  ["달걀", "🥚"],
  ["할인", "🎫"],
  ["쿠폰", "🎫"],
];

/**
 * 꽝은 상품이 아니므로 매핑 표를 타지 않는다. 호출부에서 직접 쓴다.
 */
export const MISS_EMOJI = "🍥";

export function resolveCouponEmoji(name: LocalizedName): string {
  const korean = name?.ko;
  if (typeof korean !== "string") return DEFAULT_COUPON_EMOJI;

  for (const [keyword, emoji] of KEYWORD_EMOJI) {
    if (korean.includes(keyword)) return emoji;
  }
  return DEFAULT_COUPON_EMOJI;
}

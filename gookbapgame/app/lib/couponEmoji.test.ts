import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCouponEmoji, DEFAULT_COUPON_EMOJI } from "./couponEmoji.ts";

test("resolveCouponEmoji: 한국어 이름의 키워드로 이모지를 고른다", () => {
  assert.equal(resolveCouponEmoji({ ko: "국밥 1그릇 무료", en: "Free Gookbap" }), "🍲");
  assert.equal(resolveCouponEmoji({ ko: "음료수 1캔" }), "🥤");
});

// "국밥"이 "공기밥"보다 표에서 위에 있어야 성립한다. 순서가 뒤집히면 이 테스트가 깨진다.
test("resolveCouponEmoji: 더 구체적인 키워드가 우선한다", () => {
  assert.equal(resolveCouponEmoji({ ko: "국밥" }), "🍲");
  assert.equal(resolveCouponEmoji({ ko: "공기밥 추가" }), "🍚");
});

test("resolveCouponEmoji: 매칭되지 않으면 기본 이모지", () => {
  // 순대는 전용 이모지가 없어 일부러 매핑하지 않았다.
  assert.equal(resolveCouponEmoji({ ko: "맛보기 순대" }), DEFAULT_COUPON_EMOJI);
  assert.equal(resolveCouponEmoji({ ko: "신규 상품" }), DEFAULT_COUPON_EMOJI);
});

test("resolveCouponEmoji: 한국어 이름이 없으면 기본 이모지", () => {
  assert.equal(resolveCouponEmoji({ en: "Free Gookbap" }), DEFAULT_COUPON_EMOJI);
  assert.equal(resolveCouponEmoji(null), DEFAULT_COUPON_EMOJI);
  assert.equal(resolveCouponEmoji(undefined), DEFAULT_COUPON_EMOJI);
});

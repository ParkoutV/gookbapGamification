import { test } from "node:test";
import assert from "node:assert/strict";
import { sortByIssuedAt, toIssuedCoupon, type IssuedCouponRow } from "./issuedCoupons.ts";
import { parseCouponType } from "./couponType.ts";
import { resolveLocalizedName } from "./i18n/localizedName.ts";
import { resolveCouponEmoji, DEFAULT_COUPON_EMOJI } from "./couponEmoji.ts";

const EFFECT_ID = "11111111-1111-1111-1111-111111111111";

const row = (over: Partial<IssuedCouponRow> = {}): IssuedCouponRow => ({
  coupon_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  coupon_effect_id: EFFECT_ID,
  is_used: false,
  expired_at: null,
  ...over,
});

// 2026-08-07 프로덕션 증상: get_my_coupons에는 coupon_type이 없는데 그 컬럼을 읽고
// 있어서, 상품명이 "—"로 코너 이모지가 기본값으로 조용히 떨어졌다.
// 이름은 coupon_effect_id로 coupon_effects를 따로 읽어 붙여야 한다.
test("coupon_effect_id로 붙인 이름이 상품명과 이모지에 도달한다", () => {
  const names = new Map([[EFFECT_ID, parseCouponType('{"ko":"돼지국밥 1그릇","en":"Free Gookbap"}')]]);
  const coupon = toIssuedCoupon(row(), names);

  assert.equal(resolveLocalizedName(coupon.couponType, "ko"), "돼지국밥 1그릇");
  assert.equal(resolveLocalizedName(coupon.couponType, "en"), "Free Gookbap");
  assert.equal(resolveCouponEmoji(coupon.couponType), "🍲");
});

// 이름 조회가 실패해도 QR은 살아 있어야 한다 — 매장에서 쓰는 건 QR이다.
test("이름을 못 찾아도 couponId는 살아남는다", () => {
  const coupon = toIssuedCoupon(row(), new Map());
  assert.equal(coupon.couponId, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  assert.equal(resolveLocalizedName(coupon.couponType, "ko"), "—");
  assert.equal(resolveCouponEmoji(coupon.couponType), DEFAULT_COUPON_EMOJI);
});

// drawCoupon()이 [0]을 "방금 발급된 쿠폰"으로 쓴다. 컬럼명을 created_at으로 잘못
// 알면 every()가 false가 되어 정렬이 건너뛰어지고, 오래된 쿠폰의 QR이 새 당첨
// 상품으로 나간다 — 에러 없이.
test("issued_at 최신순으로 정렬한다", () => {
  const sorted = sortByIssuedAt([
    row({ coupon_id: "old", issued_at: "2026-08-01T00:00:00Z" }),
    row({ coupon_id: "new", issued_at: "2026-08-07T00:00:00Z" }),
  ]);
  assert.equal(sorted[0].coupon_id, "new");
});

test("issued_at이 하나라도 없으면 RPC 순서를 그대로 둔다", () => {
  const rows = [row({ coupon_id: "a" }), row({ coupon_id: "b", issued_at: "2026-08-07T00:00:00Z" })];
  assert.deepEqual(sortByIssuedAt(rows).map((r) => r.coupon_id), ["a", "b"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isFreshlyIssued,
  sortByIssuedAt,
  toIssuedCoupon,
  type IssuedCouponRow,
} from "./issuedCoupons.ts";
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

// draw 거절 복구가 "방금 발급된 쿠폰"만 당첨으로 띄우게 하는 판정.
// 예전엔 쓸 수 있는 쿠폰 아무거나 골라서, 며칠 전 쿠폰이 매번 새로 당첨된 것처럼
// 나왔다(서버 제한이 1일 3회로 늘면서 실제 버그가 됐다).
const NOW = Date.parse("2026-08-11T12:00:00Z");
const issuedCoupon = (issued_at?: string) => toIssuedCoupon(row({ issued_at }), new Map());

test("룰렛 도중 새로고침(발급 직후)은 최근으로 본다", () => {
  assert.equal(isFreshlyIssued(issuedCoupon("2026-08-11T11:59:30Z"), NOW), true);
});

test("며칠 전 쿠폰은 최근이 아니다 — 이게 재탕 버그였다", () => {
  assert.equal(isFreshlyIssued(issuedCoupon("2026-08-08T12:00:00Z"), NOW), false);
});

// 하루 3회라 정당한 두 번의 뽑기가 몇 시간 떨어져 있을 수 있다. 같은 날 앞서 뽑은
// 쿠폰이 새 당첨으로 새어 들어오면 안 된다.
test("같은 날이라도 몇 시간 전 쿠폰은 최근이 아니다", () => {
  assert.equal(isFreshlyIssued(issuedCoupon("2026-08-11T09:00:00Z"), NOW), false);
});

// fail closed. 발급 시각을 모르면 오래된 쿠폰을 새 당첨으로 보여주는 위험보다
// 거절 문구를 보여주는 쪽이 낫다.
test("issued_at이 없거나 파싱되지 않으면 최근이 아니다", () => {
  assert.equal(isFreshlyIssued(issuedCoupon(undefined), NOW), false);
  assert.equal(isFreshlyIssued(issuedCoupon("not-a-date"), NOW), false);
});

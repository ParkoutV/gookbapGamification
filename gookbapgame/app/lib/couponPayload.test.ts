import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCouponQrPayload, isScannableCouponId } from "./couponPayload.ts";

// gookbapanalyze/components/coupon/CouponScanner.tsx 의 isValidUUID와 동일한 정규식.
// 스캐너가 실제로 쓰는 판정을 여기서 그대로 재현해 회귀를 막는다.
const SCANNER_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

test("buildCouponQrPayload: '<uuid>?<locale>' 형식으로 조립한다", () => {
  assert.equal(buildCouponQrPayload(VALID_ID, "ko"), `${VALID_ID}?ko`);
  assert.equal(buildCouponQrPayload(VALID_ID, "ja"), `${VALID_ID}?ja`);
});

test("buildCouponQrPayload: 조립 결과의 '?' 앞부분이 스캐너 정규식을 통과한다", () => {
  const payload = buildCouponQrPayload(VALID_ID, "en");
  const head = payload.split("?")[0];
  assert.ok(SCANNER_REGEX.test(head));
  assert.equal(payload.split("?")[1], "en");
});

test("buildCouponQrPayload: 스캔 불가능한 id면 예외를 던진다", () => {
  // 조용히 무시되는 QR을 만들어 매장에서 원인 불명 장애가 되는 것보다,
  // 개발/테스트 단계에서 터지는 편이 낫다.
  assert.throws(() => buildCouponQrPayload("not-a-uuid", "ko"));
});

test("isScannableCouponId: 유효/무효를 구분한다", () => {
  assert.equal(isScannableCouponId(VALID_ID), true);
  assert.equal(isScannableCouponId(VALID_ID.toUpperCase()), true);
  assert.equal(isScannableCouponId(""), false);
  assert.equal(isScannableCouponId("3f2504e04f8941d39a0c0305e82c3301"), false); // 하이픈 없음
  assert.equal(isScannableCouponId("3f2504e0-4f89-71d3-9a0c-0305e82c3301"), false); // 버전 자리 7
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { sortByAssignedAt, toWebCoupons } from "./webCoupons.ts";

test("toWebCoupons: RPC의 code 필드를 읽는다", () => {
  const rows = [{ code: "7FB6E68B838F4", assigned_at: "2026-08-13T00:00:00Z" }];
  assert.deepEqual(toWebCoupons(rows), [
    { code: "7FB6E68B838F4", assignedAt: "2026-08-13T00:00:00Z" },
  ]);
});

/* 테이블 컬럼은 `coupon_code`, RPC 반환 예시는 `code`다(저쪽 AGENTS.md).
   한쪽만 읽으면 에러 없이 코드가 빈칸으로 뜬다 — 상품명이 "—"로 떨어진
   2026-08-07 사고와 같은 구조라 둘 다 받는다. */
test("toWebCoupons: coupon_code로 와도 읽는다", () => {
  assert.deepEqual(toWebCoupons([{ coupon_code: "ABC123" }]), [{ code: "ABC123" }]);
});

/* 시각이 없으면 `assignedAt: undefined`가 아니라 **키 자체가 없어야** 한다.
   값 없는 키가 생기면 호출부의 deepEqual 비교가 어긋난다(gatchaApi.ts의 code와 같은 함정). */
test("toWebCoupons: 배정 시각이 없으면 assignedAt 키를 만들지 않는다", () => {
  const [coupon] = toWebCoupons([{ code: "ABC123" }]);
  assert.ok(!("assignedAt" in coupon), "값 없는 assignedAt 키가 생겼다");
});

test("toWebCoupons: code가 coupon_code보다 우선한다", () => {
  assert.equal(toWebCoupons([{ code: "AAA", coupon_code: "BBB" }])[0].code, "AAA");
});

test("toWebCoupons: 코드가 없는 행은 버린다", () => {
  // 코드가 이 쿠폰의 전부다. 빈 칸을 띄우면 누를 수는 있는데 복사할 것이 없다.
  assert.deepEqual(toWebCoupons([{ code: null }, { coupon_code: "  " }, {}]), []);
});

test("toWebCoupons: 앞뒤 공백을 제거한다", () => {
  assert.equal(toWebCoupons([{ code: "  ABC123  " }])[0].code, "ABC123");
});

test("sortByAssignedAt: 최신 배정순", () => {
  const coupons = [
    { code: "OLD", assignedAt: "2026-08-01T00:00:00Z" },
    { code: "NEW", assignedAt: "2026-08-13T00:00:00Z" },
  ];
  assert.deepEqual(
    sortByAssignedAt(coupons).map((c) => c.code),
    ["NEW", "OLD"]
  );
});

test("sortByAssignedAt: 한 행이라도 시각이 없으면 원래 순서를 둔다", () => {
  // 뒤섞느니 RPC 순서를 그대로 두는 편이 낫다(sortByIssuedAt과 같은 방침).
  const coupons = [{ code: "A", assignedAt: "2026-08-01T00:00:00Z" }, { code: "B" }];
  assert.deepEqual(
    sortByAssignedAt(coupons).map((c) => c.code),
    ["A", "B"]
  );
});

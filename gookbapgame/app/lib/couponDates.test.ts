import { test } from "node:test";
import assert from "node:assert/strict";
import { couponDateLines } from "./couponDates.ts";

/** 실제 t()와 같은 치환 규칙. 키를 그대로 남겨 순서·누락을 눈으로 확인할 수 있게 한다. */
const t = (key: string, vars?: Record<string, string>) =>
  vars?.date ? `${key}:${vars.date}` : key;

const BASE = {
  issuedAt: "2026-08-12T01:00:00.000Z",
  validFrom: "2026-08-13T00:00:00.000Z",
  expiredAt: "2026-08-19T14:59:59.999Z",
};

test("couponDateLines: 발급일 → 시작일 → 사용기한 순서로 조립한다", () => {
  const lines = couponDateLines(BASE, "ko", t);
  assert.deepEqual(
    lines.map((l) => l.key),
    ["issued", "valid", "expiry"]
  );
});

test("couponDateLines: 날짜는 KST로 렌더한다 — 기기 시간대를 타지 않는다", () => {
  // expired_at은 KST 23:59:59.999로 저장된다(= UTC 14:59:59.999).
  // 기기 시간대로 렌더하면 한국보다 서쪽 기기에서 하루 앞당겨 보인다.
  // 아래 값은 KST로 2026-08-19 23:59:59.999이므로 "8/19"여야 한다.
  const lines = couponDateLines({ ...BASE, issuedAt: undefined, validFrom: null }, "ko", t);
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /8\/19|2026\. 8\. 19/);
});

test("couponDateLines: UTC 자정 직전 발급도 KST 기준 날짜로 나온다", () => {
  // UTC 2026-08-12 16:00 = KST 2026-08-13 01:00. KST 기준이면 13일이다.
  const lines = couponDateLines(
    { issuedAt: "2026-08-12T16:00:00.000Z", validFrom: null, expiredAt: null },
    "ko",
    t
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /8\/13|2026\. 8\. 13/);
});

test("couponDateLines: 값이 없는 줄은 생략한다 — 자리를 비워두지 않는다", () => {
  // validFrom은 아직 get_my_coupons가 주지 않는다. 그때 2줄로 나와야 한다.
  const lines = couponDateLines({ ...BASE, validFrom: undefined }, "ko", t);
  assert.deepEqual(
    lines.map((l) => l.key),
    ["issued", "expiry"]
  );

  assert.deepEqual(
    couponDateLines({ issuedAt: undefined, validFrom: null, expiredAt: null }, "ko", t),
    []
  );
});

test("couponDateLines: 파싱되지 않는 값은 'Invalid Date'를 띄우지 않고 생략한다", () => {
  const lines = couponDateLines(
    { issuedAt: "not-a-date", validFrom: null, expiredAt: BASE.expiredAt },
    "ko",
    t
  );
  assert.deepEqual(
    lines.map((l) => l.key),
    ["expiry"]
  );
});

test("couponDateLines: 로케일별 메시지 키를 쓴다", () => {
  const lines = couponDateLines(BASE, "en", t);
  assert.deepEqual(
    lines.map((l) => l.text.split(":")[0]),
    ["coupon.issuedAt", "coupon.validFrom", "coupon.expiresAt"]
  );
});

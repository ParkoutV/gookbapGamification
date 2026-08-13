import { test } from "node:test";
import assert from "node:assert/strict";
import { couponDateLines } from "./couponDates.ts";

/** 실제 t()와 같은 치환 규칙. 키를 그대로 남겨 어느 메시지가 쓰였는지 눈으로 확인한다. */
const t = (key: string, vars?: Record<string, string>) => {
  if (vars?.from && vars?.until) return `${key}:${vars.from}~${vars.until}`;
  if (vars?.date) return `${key}:${vars.date}`;
  return key;
};

const BASE = {
  validFrom: "2026-08-13T00:00:00.000Z",
  expiredAt: "2026-08-19T14:59:59.999Z",
};

/*
 * **한 줄이어야 한다.** 2026-08-12에는 발급일·시작일·사용기한 3줄이었는데, 발급일이
 * 매장에서 쓰이지 않고 세로 3줄이 카드 안에서 QR과 무게를 다퉈 다음 날 합쳤다.
 * 줄이 다시 늘어나면 이 단정이 먼저 깨진다.
 */
test("couponDateLines: 시작일·사용기한이 다 있으면 기간 한 줄", () => {
  const lines = couponDateLines(BASE, "ko", t);
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /^coupon\.validPeriod:/);
});

test("couponDateLines: 발급일은 표시하지 않는다", () => {
  // issuedAt을 넘겨도 무시된다(타입에서도 빠졌지만 런타임 동작을 못 박아 둔다).
  const lines = couponDateLines({ ...BASE, issuedAt: "2026-08-12T01:00:00.000Z" } as never, "ko", t);
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0].text, /issuedAt/);
});

test("couponDateLines: 시작일이 없으면 사용기한만", () => {
  const lines = couponDateLines({ ...BASE, validFrom: null }, "ko", t);
  assert.deepEqual(
    lines.map((l) => l.text.split(":")[0]),
    ["coupon.expiresAt"]
  );
});

test("couponDateLines: 사용기한이 없으면 시작일만", () => {
  // expired_at이 null로 발급된 쿠폰이 실제로 있다(2026-08-13, AGENTS.md 참고).
  const lines = couponDateLines({ ...BASE, expiredAt: null }, "ko", t);
  assert.deepEqual(
    lines.map((l) => l.text.split(":")[0]),
    ["coupon.validFrom"]
  );
});

test("couponDateLines: 둘 다 없으면 빈 배열 — 자리를 비워두지 않는다", () => {
  assert.deepEqual(couponDateLines({ validFrom: null, expiredAt: null }, "ko", t), []);
});

test("couponDateLines: 날짜는 KST로 렌더한다 — 기기 시간대를 타지 않는다", () => {
  // expired_at은 KST 23:59:59.999로 저장된다(= UTC 14:59:59.999).
  // 기기 시간대로 렌더하면 한국보다 서쪽 기기에서 하루 앞당겨 보인다.
  // 아래 값은 KST로 2026-08-19 23:59:59.999이므로 "8/19"여야 한다.
  const lines = couponDateLines({ validFrom: null, expiredAt: BASE.expiredAt }, "ko", t);
  assert.match(lines[0].text, /8\/19|2026\. 8\. 19/);
});

test("couponDateLines: UTC 자정 직전 값도 KST 기준 날짜로 나온다", () => {
  // UTC 2026-08-12 16:00 = KST 2026-08-13 01:00. KST 기준이면 13일이다.
  const lines = couponDateLines(
    { validFrom: "2026-08-12T16:00:00.000Z", expiredAt: null },
    "ko",
    t
  );
  assert.match(lines[0].text, /8\/13|2026\. 8\. 13/);
});

test("couponDateLines: 파싱되지 않는 값은 'Invalid Date'를 띄우지 않고 생략한다", () => {
  const lines = couponDateLines({ validFrom: "not-a-date", expiredAt: BASE.expiredAt }, "ko", t);
  assert.deepEqual(
    lines.map((l) => l.text.split(":")[0]),
    ["coupon.expiresAt"]
  );

  assert.deepEqual(couponDateLines({ validFrom: "nope", expiredAt: "nope" }, "ko", t), []);
});

test("couponDateLines: 로케일별 메시지 키를 쓴다", () => {
  for (const locale of ["ko", "en", "ja"] as const) {
    const lines = couponDateLines(BASE, locale, t);
    assert.equal(lines[0].text.split(":")[0], "coupon.validPeriod", `${locale}에서 키가 다르다`);
  }
});

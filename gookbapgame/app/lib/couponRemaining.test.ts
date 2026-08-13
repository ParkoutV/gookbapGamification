import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCouponRemaining, COUPON_EXPIRY_SOON_DAYS } from "./couponRemaining.ts";

/** `expired_at`이 실제로 저장되는 형태 — KST 23:59:59.999 = UTC 14:59:59.999. */
const kstEndOfDay = (ymd: string) => `${ymd}T14:59:59.999Z`;

const coupon = (expiredAt: string | null, isUsed = false) => ({ expiredAt, isUsed });

test("만료일이 없으면 아무것도 표시하지 않는다", () => {
  assert.equal(resolveCouponRemaining(coupon(null)).kind, "none");
});

test("깨진 날짜는 없는 것으로 친다 — Invalid Date를 띄우지 않는다", () => {
  assert.equal(resolveCouponRemaining(coupon("어제까지")).kind, "none");
});

test("사용 완료가 만료보다 먼저다 — 이미 쓴 쿠폰에 남은 일수를 띄우지 않는다", () => {
  const used = coupon(kstEndOfDay("2026-09-30"), true);
  assert.equal(resolveCouponRemaining(used, new Date("2026-08-13T00:00:00Z")).kind, "used");
});

test("지난 쿠폰은 expired다", () => {
  const result = resolveCouponRemaining(
    coupon(kstEndOfDay("2026-08-12")),
    new Date("2026-08-13T05:00:00Z")
  );
  assert.equal(result.kind, "expired");
});

/*
 * 이 저장소가 실제로 겪은 함정이다. 밀리초 차이를 86400000으로 나누면 KST 밤에는
 * 남은 시간이 한 시간도 안 되므로 "오늘까지"인 쿠폰이 0일로 떨어지지 않는다.
 * 두 시각 모두 KST로 2026-08-13이고, 만료도 2026-08-13이므로 답은 항상 0이어야 한다.
 */
test("오늘까지인 쿠폰은 KST 하루 중 어느 시각에 봐도 0일이다", () => {
  const today = coupon(kstEndOfDay("2026-08-13"));
  // KST 09:00 (UTC 00:00)
  const morning = resolveCouponRemaining(today, new Date("2026-08-13T00:00:00Z"));
  // KST 23:00 (UTC 14:00) — 만료까지 1시간도 안 남은 시점
  const night = resolveCouponRemaining(today, new Date("2026-08-13T14:00:00Z"));

  assert.deepEqual(morning, { kind: "remaining", days: 0, soon: true });
  assert.deepEqual(night, { kind: "remaining", days: 0, soon: true });
});

test("KST 자정을 넘기면 하루가 준다", () => {
  const expiry = coupon(kstEndOfDay("2026-08-15"));
  // KST 8/13 23:00 → 2일 남음
  const before = resolveCouponRemaining(expiry, new Date("2026-08-13T14:00:00Z"));
  // KST 8/14 00:30 (UTC 8/13 15:30) → 1일 남음. 90분 차이지만 날짜가 넘어갔다.
  const after = resolveCouponRemaining(expiry, new Date("2026-08-13T15:30:00Z"));

  assert.deepEqual(before, { kind: "remaining", days: 2, soon: true });
  assert.deepEqual(after, { kind: "remaining", days: 1, soon: true });
});

test("기기 시간대가 KST보다 서쪽이어도 같은 값이다", () => {
  // UTC 자정은 KST 09:00이고, 미국 서부에서는 아직 전날 오후다. KST로 세므로 무관하다.
  const result = resolveCouponRemaining(
    coupon(kstEndOfDay("2026-08-16")),
    new Date("2026-08-13T00:00:00Z")
  );
  assert.deepEqual(result, { kind: "remaining", days: 3, soon: true });
});

test(`${COUPON_EXPIRY_SOON_DAYS}일 이하만 임박이다`, () => {
  const at = (ymd: string) =>
    resolveCouponRemaining(coupon(kstEndOfDay(ymd)), new Date("2026-08-13T00:00:00Z"));

  // 경계 양쪽: 3일 남음은 임박, 4일 남음은 아니다.
  assert.deepEqual(at("2026-08-16"), { kind: "remaining", days: 3, soon: true });
  assert.deepEqual(at("2026-08-17"), { kind: "remaining", days: 4, soon: false });
});

test("기기 시계가 앞서 있어도 음수 일수가 나오지 않는다", () => {
  /*
   * expired 분기를 통과하려면 만료 시각이 now보다 뒤여야 하지만, 날짜 칸으로 내려놓으면
   * 음수가 될 수 있는 조합이 존재한다 — KST 8/13 23:00 시점에 만료가 8/13 23:59:59.999면
   * 날짜 차는 0이다. 바닥이 실제로 필요한 것은 시계가 어긋난 기기이므로, 여기서는
   * 최소한 음수가 새어나가지 않는 것만 확인한다.
   */
  const result = resolveCouponRemaining(
    coupon(kstEndOfDay("2026-08-13")),
    new Date("2026-08-13T14:59:00Z")
  );
  assert.equal(result.kind, "remaining");
  assert.ok(result.kind === "remaining" && result.days >= 0);
});

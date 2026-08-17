import { test } from "node:test";
import assert from "node:assert/strict";
import { requestGatchaDraw } from "./gatchaApi.ts";

const API_URL = "https://analyze.example.com/api/gatcha/draw";

test("requestGatchaDraw: 당첨 응답이면 won:true를 반환한다(상품명은 싣지 않는다)", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return new Response(
      JSON.stringify({ success: true, coupon_type: { ko: "국밥 1그릇 무료", en: "Free Gookbap" }, score_used: 1200 }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const result = await requestGatchaDraw(API_URL, "participant-1");
    assert.deepEqual(result, { ok: true, won: true });
    assert.equal(capturedInit?.method, "POST");
    assert.deepEqual(JSON.parse(capturedInit?.body as string), { participant_id: "participant-1" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/*
 * 저쪽 draw 응답은 2026-08-04(`9774e07`)부터 `coupon_id`를, 2026-08-06(`504cfa7`)부터
 * `web_coupon_code`를 돌려준다. 우리 문서가 오래도록 "coupon_id는 없다"고 적어둔 탓에
 * `drawCoupon()`이 목록의 `[0]`을 "방금 그것"으로 추측해 왔다 — 온라인몰 쿠폰이 뽑히면
 * 그 행이 걸러져 추측이 무너진다.
 */
test("requestGatchaDraw: coupon_id를 실어 나른다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ success: true, coupon_type: { ko: "국밥 1그릇 무료" }, coupon_id: "c-1" }),
      { status: 200 }
    )) as typeof fetch;

  try {
    assert.deepEqual(await requestGatchaDraw(API_URL, "p"), {
      ok: true,
      won: true,
      couponId: "c-1",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 온라인몰 전용 효과가 뽑혔다는 유일한 신호다. 이게 오면 매장 쿠폰 목록을 뒤져도
// 못 찾는다(withoutOnlineCoupons가 걷어낸다).
test("requestGatchaDraw: web_coupon_code를 실어 나른다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        success: true,
        coupon_type: { ko: "웹 쿠폰" },
        coupon_id: "c-2",
        web_coupon_code: "8B0E1C3C2FEBE",
      }),
      { status: 200 }
    )) as typeof fetch;

  try {
    assert.deepEqual(await requestGatchaDraw(API_URL, "p"), {
      ok: true,
      won: true,
      couponId: "c-2",
      webCouponCode: "8B0E1C3C2FEBE",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/*
 * `code`와 같은 규칙이다 — 값이 없으면 **키 자체를 넣지 않는다.** `undefined`를 실으면
 * 값 없는 키가 생겨 호출부의 deepEqual 비교가 어긋난다(예전에 테스트 2건이 깨졌다).
 * 매장 쿠폰 당첨 응답에는 `web_coupon_code`가 아예 빠져서 온다.
 */
test("requestGatchaDraw: 없는 필드는 키를 만들지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: true, coupon_type: { ko: "국밥" } }), {
      status: 200,
    })) as typeof fetch;

  try {
    const result = await requestGatchaDraw(API_URL, "p");
    assert.deepEqual(result, { ok: true, won: true });
    assert.equal("couponId" in result, false);
    assert.equal("webCouponCode" in result, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestGatchaDraw: 꽝 응답(coupon_type: null)이면 won:false를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: true, message: "꽝", coupon_type: null }), { status: 200 })) as typeof fetch;

  try {
    const result = await requestGatchaDraw(API_URL, "participant-1");
    assert.deepEqual(result, { ok: true, won: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestGatchaDraw: 403이면 rejected:true와 서버 메시지를 담는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "쿨타임이 아직 지나지 않았습니다." }), { status: 403 })) as typeof fetch;

  try {
    const result = await requestGatchaDraw(API_URL, "participant-1");
    assert.deepEqual(result, { ok: false, rejected: true, error: "쿨타임이 아직 지나지 않았습니다." });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestGatchaDraw: 서버가 code를 보내면 그대로 싣는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ error: "게임을 플레이한 횟수만큼만 가챠를 돌릴 수 있습니다.", code: "PLAY_LIMIT_EXCEEDED" }),
      { status: 400 }
    )) as typeof fetch;

  try {
    const result = await requestGatchaDraw(API_URL, "participant-1");
    assert.deepEqual(result, {
      ok: false,
      rejected: true,
      error: "게임을 플레이한 횟수만큼만 가챠를 돌릴 수 있습니다.",
      code: "PLAY_LIMIT_EXCEEDED",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestGatchaDraw: 500이면 rejected:false로 분류한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 })) as typeof fetch;

  try {
    const result = await requestGatchaDraw(API_URL, "participant-1");
    assert.deepEqual(result, { ok: false, rejected: false, error: "Internal Server Error" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestGatchaDraw: fetch 자체가 실패하면 rejected:false로 분류한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  try {
    const result = await requestGatchaDraw(API_URL, "participant-1");
    assert.deepEqual(result, { ok: false, rejected: false, error: "network down" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

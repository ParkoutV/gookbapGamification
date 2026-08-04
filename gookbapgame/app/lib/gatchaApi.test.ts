import { test } from "node:test";
import assert from "node:assert/strict";
import { requestGatchaDraw } from "./gatchaApi.ts";

const API_URL = "https://analyze.example.com/api/gatcha/draw";

test("requestGatchaDraw: 당첨 응답이면 won:true와 couponType을 반환한다", async () => {
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
    assert.deepEqual(result, { ok: true, won: true, couponType: { ko: "국밥 1그릇 무료", en: "Free Gookbap" } });
    assert.equal(capturedInit?.method, "POST");
    assert.deepEqual(JSON.parse(capturedInit?.body as string), { participant_id: "participant-1" });
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

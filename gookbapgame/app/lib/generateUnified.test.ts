import { test } from "node:test";
import assert from "node:assert/strict";
import { requestUnifiedImage } from "./generateUnified.ts";

const API_URL = "https://analyze.example.com/api/generate-unified";

test("requestUnifiedImage: 성공 응답이면 ok:true와 url을 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return new Response(
      JSON.stringify({ success: true, url: "https://storage.example.com/game_assets/unified_cache/base1_x.webp" }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const result = await requestUnifiedImage(API_URL, 1, { 1: 2, 2: 5 });
    assert.deepEqual(result, {
      ok: true,
      url: "https://storage.example.com/game_assets/unified_cache/base1_x.webp",
    });
    assert.equal(capturedInit?.method, "POST");
    assert.equal(
      (capturedInit?.headers as Record<string, string>)["Content-Type"],
      "application/json"
    );
    assert.deepEqual(JSON.parse(capturedInit?.body as string), {
      baseImageId: 1,
      imageSlots: { 1: 2, 2: 5 },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestUnifiedImage: API가 {error} JSON을 반환하면 그 메시지를 그대로 담는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Base image not found" }), { status: 404 })) as typeof fetch;

  try {
    const result = await requestUnifiedImage(API_URL, 999, { 1: 2 });
    assert.deepEqual(result, { ok: false, error: "Base image not found" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestUnifiedImage: fetch 자체가 실패하면(네트워크 오류) 에러 메시지를 담는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network unreachable");
  }) as typeof fetch;

  try {
    const result = await requestUnifiedImage(API_URL, 1, { 1: 2 });
    assert.deepEqual(result, { ok: false, error: "network unreachable" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestUnifiedImage: 200이지만 success/url이 없는 이상 응답이면 상태코드를 담은 에러를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;

  try {
    const result = await requestUnifiedImage(API_URL, 1, { 1: 2 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /200/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

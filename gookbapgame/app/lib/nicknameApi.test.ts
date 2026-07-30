import { test } from "node:test";
import assert from "node:assert/strict";
import { requestNicknameAssign } from "./nicknameApi.ts";

const API_URL = "https://analyze.example.com/api/nickname/assign";

test("requestNicknameAssign: 성공 응답이면 ok:true와 nickname을 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({ success: true, nickname: "든든한 국밥" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await requestNicknameAssign(API_URL, "participant-1");
    assert.deepEqual(result, { ok: true, nickname: "든든한 국밥" });
    assert.equal(capturedInit?.method, "POST");
    assert.equal((capturedInit?.headers as Record<string, string>)["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(capturedInit?.body as string), { participant_id: "participant-1" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestNicknameAssign: API가 {error} JSON을 반환하면 그 메시지를 그대로 담는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Missing participant_id" }), { status: 400 })) as typeof fetch;

  try {
    const result = await requestNicknameAssign(API_URL, "");
    assert.deepEqual(result, { ok: false, error: "Missing participant_id" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestNicknameAssign: fetch 자체가 실패하면(네트워크 오류) 에러 메시지를 담는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network unreachable");
  }) as typeof fetch;

  try {
    const result = await requestNicknameAssign(API_URL, "participant-1");
    assert.deepEqual(result, { ok: false, error: "network unreachable" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestNicknameAssign: 200이지만 success/nickname이 없는 이상 응답이면 상태코드를 담은 에러를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;

  try {
    const result = await requestNicknameAssign(API_URL, "participant-1");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /200/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { requestNicknameAssign } from "./nicknameApi.ts";

const API_URL = "https://analyze.example.com/api/nickname/assign";

const SUCCESS_BODY = {
  success: true,
  first_nickname: { ko: "든든한", en: "Hearty", ja: "頼もしい" },
  last_nickname: { ko: "국밥", en: "Gookbap", ja: "クッパ" },
  first_id: "uuid-first",
  last_id: "uuid-last",
  number: "0023",
};

function mockFetchOnce(body: unknown, status = 200) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

test("requestNicknameAssign: 성공 응답이면 다국어 맵을 그대로 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify(SUCCESS_BODY), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await requestNicknameAssign(API_URL, "participant-1");
    assert.deepEqual(result, {
      ok: true,
      nickname: {
        first: { ko: "든든한", en: "Hearty", ja: "頼もしい" },
        last: { ko: "국밥", en: "Gookbap", ja: "クッパ" },
        number: "0023",
      },
    });
    assert.equal(capturedInit?.method, "POST");
    assert.equal((capturedInit?.headers as Record<string, string>)["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(capturedInit?.body as string), { participant_id: "participant-1" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestNicknameAssign: 맵이 빠진 응답이면 ok:false — 조립된 문자열로 폴백하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  // 예전 형식(nickname 문자열)은 더 이상 응답에 없다. 혹시 오더라도 로케일을 고를 수
  // 없으므로 성공으로 치지 않는다 — 한국어 고정 닉네임이 조용히 배정되는 편보다
  // 폴백(nicknameSynced: false)이 낫다.
  mockFetchOnce({ success: true, nickname: "든든한 국밥 #0023", number: "0023" });

  try {
    const result = await requestNicknameAssign(API_URL, "participant-1");
    assert.equal(result.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestNicknameAssign: number는 nullable — 없거나 공백이면 null", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const number of [null, "", "   ", undefined]) {
      mockFetchOnce({ ...SUCCESS_BODY, number });
      const result = await requestNicknameAssign(API_URL, "participant-1");
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.nickname.number, null);
    }
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

test("requestNicknameAssign: 200이지만 success/맵이 없는 이상 응답이면 상태코드를 담은 에러를 반환한다", async () => {
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

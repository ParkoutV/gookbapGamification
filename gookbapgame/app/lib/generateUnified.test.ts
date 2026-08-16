import { test } from "node:test";
import assert from "node:assert/strict";
import { requestUnifiedImages, type UnifiedCombination } from "./generateUnified.ts";

const API_URL = "https://analyze.example.com/api/generate-unified";

const COMBS: UnifiedCombination[] = [
  { baseImageId: 14, imageSlots: { 46: 112, 47: 115 } },
  { baseImageId: 14, imageSlots: { 46: 114, 47: 115 } },
  { baseImageId: 8, imageSlots: { 21: 55 } },
];

/** 저쪽이 실제로 돌려주는 형태 — 슬롯 값이 **문자열**이다(route.ts의 `toString()`). */
function resultRow(comb: UnifiedCombination, url: string) {
  return {
    baseImageId: comb.baseImageId,
    imageSlots: Object.fromEntries(
      Object.entries(comb.imageSlots).map(([k, v]) => [k, String(v)])
    ),
    url,
  };
}

function fakeApi(rows: unknown[], status = 200) {
  return (async () =>
    new Response(JSON.stringify({ success: true, results: rows }), { status })) as typeof fetch;
}

test("requestUnifiedImages: 조합 전체를 한 번의 POST로 보낸다", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  let calls = 0;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    calls += 1;
    capturedInit = init;
    return new Response(
      JSON.stringify({ success: true, results: COMBS.map((c, i) => resultRow(c, `u${i}`)) }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const result = await requestUnifiedImages(API_URL, COMBS);
    assert.deepEqual(result, { ok: true, urls: ["u0", "u1", "u2"] });
    assert.equal(calls, 1, "14장이든 3장이든 요청은 한 번뿐이다");
    assert.equal(capturedInit?.method, "POST");
    assert.deepEqual(JSON.parse(capturedInit?.body as string), { combinations: COMBS });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/*
 * 저쪽은 캐시 적중분을 먼저 담고 새로 합성한 것을 뒤에 이어붙인다(route.ts) — 캐시가
 * 일부만 더워지면 응답 순서가 요청 순서와 어긋난다. 인덱스로 짝지으면 3단계 화면에
 * 5단계 그림이 들어가는데 **에러 없이 조용히** 틀리고, 캐시가 비었거나 꽉 찬 로컬
 * 테스트에서는 재현되지 않는다.
 */
test("응답 순서가 뒤바뀌어도 요청 순서대로 복원한다 — 인덱스가 아니라 키로 짝짓는다", async () => {
  const originalFetch = globalThis.fetch;
  const rows = COMBS.map((c, i) => resultRow(c, `u${i}`)).reverse();
  globalThis.fetch = fakeApi(rows);

  try {
    const result = await requestUnifiedImages(API_URL, COMBS);
    assert.deepEqual(result, { ok: true, urls: ["u0", "u1", "u2"] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/*
 * 같은 baseImageId에 슬롯만 다른 좌/우 조합이 섞이면 안 된다 — COMBS[0]과 COMBS[1]이
 * 정확히 그 관계다(base 14, 슬롯 46만 다르다). baseImageId만 키로 쓰면 여기서 갈린다.
 */
test("같은 배경의 좌/우 조합을 슬롯까지 보고 구분한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeApi([
    resultRow(COMBS[1], "right"),
    resultRow(COMBS[0], "left"),
    resultRow(COMBS[2], "other"),
  ]);

  try {
    const result = await requestUnifiedImages(API_URL, COMBS);
    assert.deepEqual(result, { ok: true, urls: ["left", "right", "other"] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/*
 * 저쪽은 합성에 실패한 조합을 조용히 빼고 `success: true`를 준다
 * (route.ts의 `if (!res.error) results.push(res)`). 이걸 실패로 바꾸지 않으면
 * `undefined`가 그대로 `leftSceneUrl`이 된다.
 */
test("요청한 조합이 응답에서 빠지면 성공 응답이라도 실패로 처리한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeApi([resultRow(COMBS[0], "u0"), resultRow(COMBS[2], "u2")]);

  try {
    const result = await requestUnifiedImages(API_URL, COMBS);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /14/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestUnifiedImages: API가 {error} JSON을 반환하면 그 메시지를 그대로 담는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Base image not found" }), { status: 404 })) as typeof fetch;

  try {
    const result = await requestUnifiedImages(API_URL, COMBS);
    assert.deepEqual(result, { ok: false, error: "Base image not found" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestUnifiedImages: fetch 자체가 실패하면(네트워크 오류) 에러 메시지를 담는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network unreachable");
  }) as typeof fetch;

  try {
    const result = await requestUnifiedImages(API_URL, COMBS);
    assert.deepEqual(result, { ok: false, error: "network unreachable" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestUnifiedImages: 200이지만 results가 없는 이상 응답이면 상태코드를 담은 에러를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;

  try {
    const result = await requestUnifiedImages(API_URL, COMBS);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /200/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/** 빈 요청은 네트워크를 타지 않는다 — 7레벨이 전부 실패한 경우 여기로 온다. */
test("조합이 없으면 fetch를 부르지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("불려서는 안 된다");
  }) as typeof fetch;

  try {
    assert.deepEqual(await requestUnifiedImages(API_URL, []), { ok: true, urls: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { requestWebCouponAssign } from "./webCouponApi.ts";

const URL = "https://example.test/api/web-coupons/assign";

function stubFetch(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

/* 응답이 이중으로 감싸여 있다: { success, data: { success, code } }.
   바깥만 보고 body.code를 읽으면 undefined가 되어 발급이 성공했는데도
   실패로 처리된다 — 이 테스트가 그 회귀를 잡는다. */
test("성공 응답의 data.code를 꺼낸다", async () => {
  stubFetch(200, { success: true, data: { success: true, code: "7FB6E68B838F4" } });
  assert.deepEqual(await requestWebCouponAssign(URL, "pid"), {
    ok: true,
    code: "7FB6E68B838F4",
  });
});

test("바깥에만 code가 있으면 성공으로 치지 않는다", async () => {
  stubFetch(200, { success: true, code: "7FB6E68B838F4" });
  const result = await requestWebCouponAssign(URL, "pid");
  assert.equal(result.ok, false);
});

test("설문 미완료(403)는 rejected — 재시도해도 소용없다", async () => {
  stubFetch(403, { error: "설문조사를 먼저 완료해주세요.", survey_required: true });
  const result = await requestWebCouponAssign(URL, "pid");
  assert.deepEqual(result, {
    ok: false,
    rejected: true,
    error: "설문조사를 먼저 완료해주세요.",
  });
});

test("5xx는 rejected가 아니다 — 일시적일 수 있다", async () => {
  stubFetch(500, { error: "boom" });
  const result = await requestWebCouponAssign(URL, "pid");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.rejected, false);
});

test("200인데 코드가 비어 있으면 실패로 친다", async () => {
  stubFetch(200, { success: true, data: { success: true, code: "   " } });
  const result = await requestWebCouponAssign(URL, "pid");
  assert.equal(result.ok, false);
});

test("네트워크 실패를 던지지 않고 반환한다", async () => {
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const result = await requestWebCouponAssign(URL, "pid");
  assert.deepEqual(result, { ok: false, rejected: false, error: "network down" });
});

test("JSON이 아닌 응답도 던지지 않는다", async () => {
  globalThis.fetch = (async () => new Response("<html>502</html>", { status: 502 })) as typeof fetch;
  const result = await requestWebCouponAssign(URL, "pid");
  assert.equal(result.ok, false);
});

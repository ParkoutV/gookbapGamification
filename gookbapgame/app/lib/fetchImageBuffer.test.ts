import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchImageBuffer } from "./fetchImageBuffer.ts";

test("fetchImageBuffer: 응답이 ok가 아니면 label과 상태코드를 포함한 에러를 던진다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchImageBuffer("https://example.com/missing.png", "part(slot=1, part=2)"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /part\(slot=1, part=2\)/);
        assert.match(err.message, /404/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchImageBuffer: 응답이 ok면 Buffer를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  const bytes = new Uint8Array([1, 2, 3]);
  globalThis.fetch = (async () => new Response(bytes)) as typeof fetch;
  try {
    const buffer = await fetchImageBuffer("https://example.com/ok.png", "base_image(1)");
    assert.deepEqual(Uint8Array.from(buffer), bytes);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

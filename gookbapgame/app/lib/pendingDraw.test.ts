import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clearPendingDraw, hasPendingDraw, markPendingDraw } from "./pendingDraw.ts";

// node 런타임에는 localStorage가 없으므로 최소 스텁을 심는다.
function installStorageStub() {
  const store = new Map<string, string>();
  (globalThis as any).window = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

beforeEach(() => {
  installStorageStub();
});

test("hasPendingDraw: 기본값은 false다", () => {
  assert.equal(hasPendingDraw(), false);
});

test("markPendingDraw 후에는 true, clearPendingDraw 후에는 다시 false다", () => {
  markPendingDraw();
  assert.equal(hasPendingDraw(), true);
  clearPendingDraw();
  assert.equal(hasPendingDraw(), false);
});

test("window가 없으면(서버 렌더링) false를 반환하고 예외를 던지지 않는다", () => {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
  assert.equal(hasPendingDraw(), false);
  assert.doesNotThrow(() => markPendingDraw());
  assert.doesNotThrow(() => clearPendingDraw());
});

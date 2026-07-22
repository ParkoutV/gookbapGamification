import { test } from "node:test";
import assert from "node:assert/strict";
import { generateNickname, loadOrCreateNickname, regenerateNickname } from "./nickname.ts";

function installFakeLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  };
  return () => {
    delete (globalThis as any).window;
  };
}

test("generateNickname은 '형용사 명사' 형태의 문자열을 반환한다", () => {
  const nickname = generateNickname();
  const parts = nickname.split(" ");
  assert.equal(parts.length, 2);
  assert.ok(parts[0].length > 0);
  assert.ok(parts[1].length > 0);
});

test("loadOrCreateNickname은 최초 호출 시 생성한 값을 이후 호출에서도 그대로 반환한다", () => {
  const cleanup = installFakeLocalStorage();
  const first = loadOrCreateNickname();
  const second = loadOrCreateNickname();
  assert.equal(first, second);
  cleanup();
});

test("regenerateNickname은 저장된 값을 새로 덮어쓴다", () => {
  const cleanup = installFakeLocalStorage();
  loadOrCreateNickname();
  const regenerated = regenerateNickname();
  const reloaded = loadOrCreateNickname();
  assert.equal(reloaded, regenerated);
  cleanup();
});

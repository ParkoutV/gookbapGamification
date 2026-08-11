import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { isSfxMuted, setSfxMuted, playSfx, SFX } from "./sfx.ts";

// node 런타임에는 window도 localStorage도 없으므로 최소 스텁을 심는다.
// sfx.ts는 `window.localStorage`로 접근하므로 window 안에 넣어야 한다.
function installStorageStub() {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
}

/** localStorage가 던지는 환경(사파리 프라이빗 모드 등)을 흉내낸다. */
function installThrowingStorageStub() {
  (globalThis as any).window = {
    localStorage: {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    },
  };
}

beforeEach(() => {
  installStorageStub();
});

test("isSfxMuted: 기본값은 false다(소리 켜짐)", () => {
  assert.equal(isSfxMuted(), false);
});

test("setSfxMuted(true) 후에는 음소거 상태다", () => {
  setSfxMuted(true);
  assert.equal(isSfxMuted(), true);
});

test("setSfxMuted(false)로 다시 켤 수 있다", () => {
  setSfxMuted(true);
  setSfxMuted(false);
  assert.equal(isSfxMuted(), false);
});

test("localStorage가 던져도 예외를 흘리지 않고 소리는 켜진 것으로 본다", () => {
  installThrowingStorageStub();
  assert.equal(isSfxMuted(), false);
  assert.doesNotThrow(() => setSfxMuted(true));
});

test("window가 없으면(서버 렌더링) 예외를 던지지 않는다", () => {
  delete (globalThis as any).window;
  assert.equal(isSfxMuted(), false);
  assert.doesNotThrow(() => setSfxMuted(true));
});

// Audio가 없는 환경에서도 재생 시도가 게임을 멈추면 안 된다.
// 소리는 진행에 필수가 아니므로 어떤 실패도 조용히 삼켜야 한다.
test("playSfx: Audio가 없는 환경에서도 던지지 않는다", () => {
  assert.doesNotThrow(() => playSfx(SFX.click));
});

test("playSfx: 음소거 상태면 Audio를 만들지도 않는다", () => {
  setSfxMuted(true);
  let constructed = false;
  (globalThis as any).Audio = class {
    constructor() {
      constructed = true;
    }
  };
  try {
    playSfx(SFX.coupon);
    assert.equal(constructed, false);
  } finally {
    delete (globalThis as any).Audio;
  }
});

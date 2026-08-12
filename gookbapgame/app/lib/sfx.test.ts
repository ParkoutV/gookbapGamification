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

// AudioContext가 없는 환경에서도 재생 시도가 게임을 멈추면 안 된다.
// 소리는 진행에 필수가 아니므로 어떤 실패도 조용히 삼켜야 한다.
test("playSfx: AudioContext가 없는 환경에서도 던지지 않는다", () => {
  assert.doesNotThrow(() => playSfx(SFX.click));
});

// suspended context에서 resume()을 기다리지 않고 start()를 걸면 재생이 스케줄만
// 되고 소리가 나지 않는다. 2026-08-12에 실제로 데스크톱 효과음이 통째로 죽었다.
test("playSfx: suspended 상태면 resume이 끝난 뒤에 start한다", async () => {
  let resumed = false;
  let started = false;
  let startedWhileSuspended = false;
  const source = {
    buffer: null as unknown,
    connect: () => {},
    start: () => {
      started = true;
      if (!resumed) startedWhileSuspended = true;
    },
  };
  const fakeCtx = {
    get state() {
      return resumed ? "running" : "suspended";
    },
    // 실제 브라우저의 resume()은 비동기다. `async () => { resumed = true }`로 쓰면
    // 대입이 동기적으로 일어나 버그를 되돌려도 테스트가 통과한다(실제로 그랬다).
    // 상태 전환을 반드시 마이크로태스크 뒤로 미뤄야 검사가 성립한다.
    resume: () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          resumed = true;
          resolve();
        }, 0),
      ),
    createGain: () => ({ connect: () => {}, gain: { value: 1 } }),
    createBufferSource: () => source,
    decodeAudioData: async () => ({}) as AudioBuffer,
  };

  (globalThis as any).AudioContext = class {
    constructor() {
      return fakeCtx as unknown as AudioContext;
    }
  };
  // fetch를 스텁해 프리로드가 버퍼를 채우게 한다.
  (globalThis as any).fetch = async () => ({ arrayBuffer: async () => new ArrayBuffer(8) });

  try {
    const { preloadSfx, playSfx: play, SFX: names } = await import(`./sfx.ts?resume-test`);
    preloadSfx();
    // 디코드 프라미스가 풀릴 때까지 한 틱 넘긴다.
    await new Promise((r) => setTimeout(r, 0));
    play(names.click);
    // resume()이 풀리고 그 then의 fire()까지 도는 데 두 틱이 필요하다.
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(startedWhileSuspended, false, "suspended 상태에서 start()가 불렸다");
    assert.equal(started, true, "resume 후에도 start()가 불리지 않았다");
    assert.equal(resumed, true, "resume()이 불리지 않았다");
  } finally {
    delete (globalThis as any).AudioContext;
    delete (globalThis as any).fetch;
  }
});

// 음소거 검사가 getCtx()보다 뒤로 밀리면 이 테스트가 깨진다.
// 소리를 끈 사람에게 오디오 하드웨어를 깨울 이유가 없다.
test("playSfx: 음소거 상태면 AudioContext를 만들지도 않는다", () => {
  setSfxMuted(true);
  let constructed = false;
  (globalThis as any).AudioContext = class {
    constructor() {
      constructed = true;
    }
  };
  try {
    playSfx(SFX.coupon);
    assert.equal(constructed, false);
  } finally {
    delete (globalThis as any).AudioContext;
  }
});

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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

// BGM이 효과음 경로로 새어 들어가는 것을 막는 가드.
//
// preloadSfx()는 SFX 전체를 fetch해서 decodeAudioData로 **압축을 풀어 상주시킨다.**
// 효과음은 전부 합쳐 166KB라 괜찮지만, BGM은 58초·64초짜리라 디코드하면 각각
// 20MB·21MB의 PCM이 된다. SFX에 BGM 이름을 하나 넣는 순간 마운트에서 500KB를 받고
// 41MB를 물고 있게 된다 — 데스크톱에서는 티가 나지 않고 실기에서만 드러난다.
// BGM은 `bgm.ts`가 <audio>로 스트리밍한다.
test("SFX 목록에 BGM이 섞여 있지 않다", () => {
  const names = Object.values(SFX) as string[];
  const bgm = names.filter((n) => n.startsWith("bgm"));
  assert.deepEqual(bgm, [], `BGM이 SFX에 들어갔다: ${bgm.join(", ")}`);
});

// preloadSfx가 실제로 무엇을 받는지 확인한다. 위 테스트는 이름 규칙만 보므로
// 이름을 다르게 지은 BGM은 잡지 못한다.
test("preloadSfx: BGM 파일은 요청하지 않는다", async () => {
  const requested: string[] = [];
  (globalThis as any).AudioContext = class {
    createGain() {
      return { connect() {}, gain: { value: 1 } };
    }
    decodeAudioData() {
      return Promise.resolve({});
    }
  };
  (globalThis as any).fetch = (url: string) => {
    requested.push(url);
    return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
  };
  try {
    const { preloadSfx } = await import("./sfx.ts?bgm-leak-test");
    preloadSfx();
    const bgmHits = requested.filter((u) => u.includes("bgm"));
    assert.deepEqual(bgmHits, [], `preloadSfx가 BGM을 받았다: ${bgmHits.join(", ")}`);
    assert.ok(requested.length > 0, "아무것도 요청하지 않았다 — 테스트가 무의미하다");
  } finally {
    delete (globalThis as any).AudioContext;
    delete (globalThis as any).fetch;
  }
});

// 이름만 등록하고 파일을 안 넣으면 **아무 에러 없이 그 소리만 안 난다** —
// `load()`가 fetch 실패를 삼키고, `playSfx`는 버퍼가 없으면 조용히 건너뛴다.
// 만점 축하음처럼 재현 조건이 까다로운 소리는 실기에서도 눈치채기 어렵다.
test("SFX 이름마다 public/sfx에 파일이 있다", () => {
  const missing = (Object.values(SFX) as string[]).filter(
    (n) => !existsSync(new URL(`../../public/sfx/${n}.m4a`, import.meta.url)),
  );
  assert.deepEqual(missing, [], `음원 파일이 없다: ${missing.join(", ")}`);
});

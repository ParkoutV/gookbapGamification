import { test } from "node:test";
import assert from "node:assert/strict";

/** 노드 테스트에는 브라우저 전역이 없다. 심고 지우기 위한 창구 —
    globalThis 자체는 인덱스 접근을 허용하지 않아 한 번 넓혀 둔다. */
const globals = globalThis as unknown as Record<string, unknown>;


/*
 * `bgm.ts`는 **import 시점에** `visibilitychange` 리스너를 단다. 그래서 스텁은
 * import보다 먼저 심어야 하고, 그 때문에 이 파일은 정적 import를 쓸 수 없다.
 *
 * node 런타임에는 document도 Audio도 없다 — 실제로 없는 채로 import되는 경로가
 * SSR이므로, 그 안전성은 `bgm.ts` 쪽 가드(`typeof document`)가 담당한다.
 */
const listeners = new Map<string, () => void>();
let visibilityState = "visible";
const audio = { paused: true, loop: false, preload: "", src: "" };

globals.document = {
  get visibilityState() {
    return visibilityState;
  },
  addEventListener: (type: string, fn: () => void) => void listeners.set(type, fn),
};
globals.window = {};
globals.Audio = class {
  constructor() {
    return audio as unknown as HTMLAudioElement;
  }
};
Object.assign(audio, {
  pause() {
    audio.paused = true;
  },
  play() {
    audio.paused = false;
    return Promise.resolve();
  },
  removeAttribute() {},
});

const { BGM, playBgm, resumeBgm } = await import("./bgm.ts");

test("탭이 숨겨지면 BGM이 멎는다 (앱을 벗어나도 계속 울리던 것)", () => {
  playBgm(BGM.main, false);
  assert.equal(audio.paused, false, "사전 조건: 재생 중이어야 한다");

  visibilityState = "hidden";
  listeners.get("visibilitychange")?.();
  assert.equal(audio.paused, true);
});

test("돌아와도 스스로 재생하지 않는다 — 제스처(resumeBgm)가 살린다", () => {
  visibilityState = "visible";
  listeners.get("visibilitychange")?.();
  assert.equal(audio.paused, true, "자동재생 정책에 막히므로 여기서 틀지 않는다");

  // `useButtonClickSfx`가 매 pointerdown에서 부르는 그 경로.
  resumeBgm(false);
  assert.equal(audio.paused, false);
});

test("음소거 상태면 복귀 제스처로도 살아나지 않는다", () => {
  visibilityState = "hidden";
  listeners.get("visibilitychange")?.();
  assert.equal(audio.paused, true);

  resumeBgm(true);
  assert.equal(audio.paused, true);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { remainingLoadingMs, MIN_LOADING_MS } from "./minimumDelay.ts";

test("시작 전이면 기다리지 않는다", () => {
  assert.equal(remainingLoadingMs(null, 1000), 0);
});

test("최소 시간을 아직 못 채웠으면 남은 만큼 돌려준다", () => {
  assert.equal(remainingLoadingMs(1000, 1200, 600), 400);
});

test("최소 시간을 정확히 채웠으면 0이다", () => {
  assert.equal(remainingLoadingMs(1000, 1600, 600), 0);
});

test("최소 시간을 넘겼으면 음수가 아니라 0이다", () => {
  // 음수를 그대로 돌려주면 setTimeout이 즉시 실행돼 우연히 동작하지만,
  // 호출부가 `remaining > 0`으로 분기할 때 의미가 뒤집힌다.
  assert.equal(remainingLoadingMs(1000, 5000, 600), 0);
});

test("시계가 뒤로 가도 minMs를 넘게 기다리지 않는다", () => {
  // NTP 보정 등으로 now가 startedAt보다 이전이 될 수 있다. 그대로 빼면
  // 600 - (-3000) = 3600ms를 기다려 사용자가 멈춘 화면을 본다.
  assert.equal(remainingLoadingMs(4000, 1000, 600), 600);
});

test("기본 최소 시간은 MIN_LOADING_MS다", () => {
  assert.equal(remainingLoadingMs(0, 0), MIN_LOADING_MS);
});

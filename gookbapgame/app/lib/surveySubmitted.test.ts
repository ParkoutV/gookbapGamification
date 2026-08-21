import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { hasSurveySubmitted, markSurveySubmitted } from "./surveySubmitted.ts";

/** 노드 테스트에는 브라우저 전역이 없다. 심고 지우기 위한 창구 —
    globalThis 자체는 인덱스 접근을 허용하지 않아 한 번 넓혀 둔다. */
const globals = globalThis as unknown as Record<string, unknown>;


// node 런타임에는 localStorage가 없으므로 최소 스텁을 심는다.
function installStorageStub() {
  const store = new Map<string, string>();
  globals.window = {};
  globals.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

beforeEach(() => {
  installStorageStub();
});

test("hasSurveySubmitted: 기본값은 false다", () => {
  assert.equal(hasSurveySubmitted(), false);
});

test("markSurveySubmitted 후에는 true다", () => {
  markSurveySubmitted();
  assert.equal(hasSurveySubmitted(), true);
});

test("window가 없으면(서버 렌더링) false를 반환하고 예외를 던지지 않는다", () => {
  delete globals.window;
  delete globals.localStorage;
  assert.equal(hasSurveySubmitted(), false);
  assert.doesNotThrow(() => markSurveySubmitted());
});

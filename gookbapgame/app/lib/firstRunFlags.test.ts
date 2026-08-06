import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  hasAcknowledgedTerm,
  markTermAcknowledged,
  hasSeenTutorial,
  markTutorialSeen,
} from "./firstRunFlags.ts";

// node 런타임에는 document가 없으므로 최소 쿠키 스텁을 심는다.
// document.cookie는 "읽으면 전체 목록, 쓰면 한 건 추가"라는 비대칭 접근자다.
let rawWrites: string[] = [];

function installCookieStub() {
  const jar = new Map<string, string>();
  rawWrites = [];
  (globalThis as any).document = {
    get cookie(): string {
      return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(str: string) {
      rawWrites.push(str);
      const pair = str.split(";")[0];
      const idx = pair.indexOf("=");
      jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    },
  };
}

beforeEach(() => {
  installCookieStub();
});

test("기본값은 둘 다 false다", () => {
  assert.equal(hasAcknowledgedTerm(), false);
  assert.equal(hasSeenTutorial(), false);
});

test("mark 후에는 true가 된다", () => {
  markTermAcknowledged();
  assert.equal(hasAcknowledgedTerm(), true);
  markTutorialSeen();
  assert.equal(hasSeenTutorial(), true);
});

test("두 플래그는 서로 독립적이다", () => {
  markTermAcknowledged();
  assert.equal(hasAcknowledgedTerm(), true);
  assert.equal(hasSeenTutorial(), false);
});

test("다른 쿠키가 섞여 있어도 오탐하지 않는다", () => {
  document.cookie = "gookbapgame_token=abc123";
  assert.equal(hasAcknowledgedTerm(), false);
  markTermAcknowledged();
  assert.equal(hasAcknowledgedTerm(), true);
});

test("쓰기에 path/max-age/SameSite 속성이 붙는다", () => {
  markTermAcknowledged();
  const written = rawWrites.at(-1) ?? "";
  assert.match(written, /path=\//);
  assert.match(written, /max-age=63072000/);
  assert.match(written, /SameSite=Lax/);
});

test("document가 없으면(서버 렌더링) false를 반환하고 예외를 던지지 않는다", () => {
  delete (globalThis as any).document;
  assert.equal(hasAcknowledgedTerm(), false);
  assert.equal(hasSeenTutorial(), false);
  assert.doesNotThrow(() => markTermAcknowledged());
  assert.doesNotThrow(() => markTutorialSeen());
});

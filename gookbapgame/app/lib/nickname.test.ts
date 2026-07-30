import { test } from "node:test";
import assert from "node:assert/strict";
import { generateNickname } from "./nickname.ts";

test("generateNickname은 '형용사 명사' 형태의 문자열을 반환한다", () => {
  const nickname = generateNickname();
  const parts = nickname.split(" ");
  assert.equal(parts.length, 2);
  assert.ok(parts[0].length > 0);
  assert.ok(parts[1].length > 0);
});

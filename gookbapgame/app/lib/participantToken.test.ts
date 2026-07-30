import { test } from "node:test";
import assert from "node:assert/strict";
import { hashToken } from "./participantToken.ts";

test("hashToken은 같은 입력에 항상 같은 SHA-256 hex를 반환한다", () => {
  const result = hashToken("example-token");
  // echo -n "example-token" | sha256sum
  assert.equal(result, "4d1566a1d7df42a8517456d60ea06ed284e535cfe4c956aa6ee172dbcdf945f7");
});

test("hashToken은 다른 입력에 다른 값을 반환한다", () => {
  assert.notEqual(hashToken("token-a"), hashToken("token-b"));
});

test("hashToken 결과는 64자 hex 문자열이다", () => {
  const result = hashToken("아무 문자열");
  assert.equal(result.length, 64);
  assert.match(result, /^[0-9a-f]{64}$/);
});

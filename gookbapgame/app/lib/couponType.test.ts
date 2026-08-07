import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCouponType } from "./couponType.ts";
import { resolveLocalizedName } from "./i18n/localizedName.ts";

// 프로덕션이 실제로 보내는 형태. 파싱을 빼먹으면 이름이 "—"로 조용히 떨어진다.
test("text 컬럼의 JSON 문자열을 이름 맵으로 편다", () => {
  const parsed = parseCouponType('{"ko":"국밥 1그릇 무료","en":"Free Gookbap"}');
  assert.equal(resolveLocalizedName(parsed, "ko"), "국밥 1그릇 무료");
  assert.equal(resolveLocalizedName(parsed, "en"), "Free Gookbap");
});

test("이미 객체면 그대로 둔다 — 컬럼이 jsonb로 바뀌어도 깨지지 않게", () => {
  const input = { ko: "수육 한 접시" };
  assert.equal(parseCouponType(input), input);
});

test("JSON이 아닌 평문은 한국어 이름으로 본다", () => {
  assert.equal(resolveLocalizedName(parseCouponType("공기밥 추가"), "ko"), "공기밥 추가");
});

// JSON.parse는 "123"이나 "null"도 통과시킨다. 객체가 아니면 이름 맵일 수 없다.
test("객체가 아닌 JSON은 평문으로 취급한다", () => {
  assert.equal(resolveLocalizedName(parseCouponType("123"), "ko"), "123");
  assert.equal(resolveLocalizedName(parseCouponType("null"), "ko"), "null");
});

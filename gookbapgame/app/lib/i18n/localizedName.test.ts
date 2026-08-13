// app/lib/i18n/localizedName.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLocalizedName, MISSING_NAME_PLACEHOLDER } from "./localizedName.ts";

test("현재 로케일의 값이 있으면 그것을 쓴다", () => {
  const name = { ko: "국밥그릇", en: "Gukbap Bowl", ja: "クッパの器" };
  assert.equal(resolveLocalizedName(name, "en"), "Gukbap Bowl");
  assert.equal(resolveLocalizedName(name, "ja"), "クッパの器");
});

test("현재 로케일 키가 없고 en도 없으면 ko로 폴백한다", () => {
  const name = { ko: "국밥그릇" };
  assert.equal(resolveLocalizedName(name, "ja"), "국밥그릇");
});

/* 중국어 추가(2026-08-13)와 함께 en 단계가 들어왔다 — `translate.ts`의 문구 폴백과
   같은 순서(요청 → en → ko)로 맞춘 것이다. 두 경로가 갈리면 같은 화면에서 문구는
   영어인데 상품명만 한국어로 뜬다. DB의 `coupon_effects`에 zh가 아직 없어서
   당분간 zh 사용자는 이 경로를 항상 탄다. */
test("현재 로케일 키가 없으면 ko보다 en을 먼저 쓴다", () => {
  const name = { ko: "국밥그릇", en: "Gukbap Bowl" };
  assert.equal(resolveLocalizedName(name, "zh"), "Gukbap Bowl");
  assert.equal(resolveLocalizedName(name, "ja"), "Gukbap Bowl");
});

test("en이 빈 문자열이면 건너뛰고 ko로 간다", () => {
  const name = { ko: "국밥그릇", en: "  " };
  assert.equal(resolveLocalizedName(name, "zh"), "국밥그릇");
});

test("현재 로케일 값이 빈 문자열이면 ko로 폴백한다", () => {
  const name = { ko: "국밥그릇", en: "" };
  assert.equal(resolveLocalizedName(name, "en"), "국밥그릇");
});

test("공백만 있는 값도 없는 것으로 보고 ko로 폴백한다", () => {
  const name = { ko: "국밥그릇", en: "   " };
  assert.equal(resolveLocalizedName(name, "en"), "국밥그릇");
});

test("ko도 없으면 플레이스홀더를 반환한다(빈 문자열이 아니다)", () => {
  assert.equal(resolveLocalizedName({ fr: "Bol" }, "en"), MISSING_NAME_PLACEHOLDER);
});

test("null이면 플레이스홀더를 반환한다", () => {
  assert.equal(resolveLocalizedName(null, "ko"), MISSING_NAME_PLACEHOLDER);
});

test("undefined면 플레이스홀더를 반환한다", () => {
  assert.equal(resolveLocalizedName(undefined, "ko"), MISSING_NAME_PLACEHOLDER);
});

test("빈 객체면 플레이스홀더를 반환한다", () => {
  assert.equal(resolveLocalizedName({}, "ko"), MISSING_NAME_PLACEHOLDER);
});

test("플레이스홀더는 빈 문자열이 아니다 — 줄이 사라지면 안 되기 때문", () => {
  assert.notEqual(MISSING_NAME_PLACEHOLDER, "");
});

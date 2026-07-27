// app/lib/i18n/detectLocale.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLocale } from "./detectLocale.ts";

test("ko-KR은 ko로 매핑된다", () => {
  assert.equal(detectLocale("ko-KR"), "ko");
});

test("en-US는 en으로 매핑된다", () => {
  assert.equal(detectLocale("en-US"), "en");
});

test("ja는 ja로 매핑된다(지역 서브태그 없이)", () => {
  assert.equal(detectLocale("ja"), "ja");
});

test("지원하지 않는 언어(fr-FR)는 en으로 폴백한다", () => {
  assert.equal(detectLocale("fr-FR"), "en");
});

test("대소문자가 섞여 있어도(EN-US) 정상 매핑된다", () => {
  assert.equal(detectLocale("EN-US"), "en");
});

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

/* 간체 하나만 지원하기로 했으므로(2026-08-13, 이란토) 번체권 태그도 전부 zh로 모은다.
   **스크립트 판별(Hans/Hant)을 넣지 말 것** — 번체 사전이 없어서 갈라봐야 갈 곳이 없고,
   요청서가 "간체자 하나만 추가하는 편이 가장 무난하다"고 명시했다. */
test("zh 계열은 지역·스크립트와 무관하게 zh(간체)로 모인다", () => {
  assert.equal(detectLocale("zh"), "zh");
  assert.equal(detectLocale("zh-CN"), "zh");
  assert.equal(detectLocale("zh-TW"), "zh");
  assert.equal(detectLocale("zh-Hant-HK"), "zh");
});

test("지원하지 않는 언어(fr-FR)는 en으로 폴백한다", () => {
  assert.equal(detectLocale("fr-FR"), "en");
});

test("대소문자가 섞여 있어도(EN-US) 정상 매핑된다", () => {
  assert.equal(detectLocale("EN-US"), "en");
});

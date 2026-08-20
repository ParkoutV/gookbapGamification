import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseAgreementBody, pickAgreementBody, toAgreementBodies } from "./agreements.ts";

test("jsonb 객체와 JSON 문자열을 모두 받는다", () => {
  // 계약상 `body`는 jsonb지만, 같은 성격의 `coupon_effects.coupon_type`이 `text`에
  // JSON 문자열로 들어 있는 전례가 있다. 한쪽만 가정하면 본문이 조용히 빈다.
  const fromObject = toAgreementBodies([{ doc_id: "terms", body: { ko: "약관" } }]);
  const fromString = toAgreementBodies([{ doc_id: "terms", body: '{"ko": "약관"}' }]);
  assert.deepEqual(fromObject, fromString);
  assert.equal(fromObject.terms?.ko, "약관");
});

test("빈 문자열 로케일은 없는 것으로 친다", () => {
  // 대시보드에서 칸만 열고 안 채운 로케일이 실제로 있다(`web_coupon_settings`의 ja).
  const bodies = toAgreementBodies([{ doc_id: "terms", body: { ko: "약관", ja: "  " } }]);
  assert.equal(bodies.terms?.ja, undefined);
  assert.equal(pickAgreementBody(bodies, "terms", "ja")?.locale, "ko");
});

test("모르는 doc_id와 빈 본문은 버린다", () => {
  const bodies = toAgreementBodies([
    { doc_id: "unknown", body: { ko: "무엇" } },
    { doc_id: "privacy", body: {} },
    { doc_id: "coupon", body: null },
  ]);
  assert.deepEqual(bodies, {});
});

test("폴백 순서는 요청 → en → ko다", () => {
  // UI 문구(`translate.ts`)·DB 다국어 맵(`localizedName.ts`)과 같은 순서를 쓴다.
  const bodies = toAgreementBodies([
    { doc_id: "privacy", body: { ko: "한국어", en: "English", ja: "日本語" } },
  ]);
  assert.deepEqual(pickAgreementBody(bodies, "privacy", "ja"), { text: "日本語", locale: "ja" });
  assert.deepEqual(pickAgreementBody(bodies, "privacy", "zh"), { text: "English", locale: "en" });

  const koOnly = toAgreementBodies([{ doc_id: "privacy", body: { ko: "한국어" } }]);
  assert.deepEqual(pickAgreementBody(koOnly, "privacy", "en"), { text: "한국어", locale: "ko" });
});

test("조회 실패(null)나 없는 문서는 null — 화면이 번들 폴백으로 떨어진다", () => {
  // 여기서 빈 문자열을 돌려주면 개인정보처리방침 창이 비고, 그것은 고지 실패다.
  assert.equal(pickAgreementBody(null, "terms", "ko"), null);
  assert.equal(pickAgreementBody({}, "terms", "ko"), null);
});

test("요청 로케일이 DB에 있을 때만 DB가 번들을 이긴다", () => {
  // 이관 초기의 DB에는 ko만 있다. 순서를 뒤집으면 영어 사용자가 한국어 본문을 본다.
  const dbKo = { text: "DB 한국어", locale: "ko" };
  const bundleEn = { text: "bundle English", locale: "en" };
  assert.deepEqual(chooseAgreementBody(dbKo, "en", bundleEn), bundleEn);
  assert.deepEqual(chooseAgreementBody(dbKo, "ko", { text: "번들 한국어", locale: "ko" }), dbKo);
  // 조회 실패면 번들.
  assert.deepEqual(chooseAgreementBody(null, "ko", bundleEn), bundleEn);
  // 번들에도 없으면 그때만 DB의 다른 로케일을 쓴다.
  assert.deepEqual(chooseAgreementBody(dbKo, "en", { text: "", locale: "en" }), dbKo);
});

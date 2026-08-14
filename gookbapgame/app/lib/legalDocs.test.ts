import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEGAL_DOC_IDS,
  couponGuideBody,
  legalDocBody,
  pickLegalLocale,
} from "./legalDocs.ts";
import { ko } from "./i18n/locales/ko.ts";
import { en } from "./i18n/locales/en.ts";
import { ja } from "./i18n/locales/ja.ts";
import { zh } from "./i18n/locales/zh.ts";

test("본문 로케일은 ko와 en 둘뿐 — ja·zh는 en으로 접힌다", () => {
  assert.equal(pickLegalLocale("ko"), "ko");
  assert.equal(pickLegalLocale("en"), "en");
  // 한국 법률 원문에 떨어뜨리지 않는다(`t()`의 폴백 체인과 다른 점).
  assert.equal(pickLegalLocale("ja"), "en");
  assert.equal(pickLegalLocale("zh"), "en");
});

test("문서 3종이 ko·en 모두 비어 있지 않다", () => {
  for (const locale of ["ko", "en"] as const) {
    for (const id of LEGAL_DOC_IDS) {
      assert.ok(legalDocBody(locale, id).length > 200, `${locale}/${id}이 비어 있거나 너무 짧다`);
    }
    assert.ok(couponGuideBody(locale).length > 200, `${locale} 쿠폰안내가 비어 있거나 너무 짧다`);
  }
});

/* 쿠폰 이용안내는 약관 창의 탭이 아니다(2026-08-14, 이란토) — 뽑기 화면과 보관함에서
   여는 별도 팝업이다. 탭 목록에 되돌려 넣으면 시작 화면 푸터에서만 닿게 되어,
   쿠폰을 받는 자리에서 조건을 알 수 없다. */
test("쿠폰 이용안내는 약관 창의 탭이 아니다", () => {
  assert.deepEqual([...LEGAL_DOC_IDS], ["terms", "privacy"]);
});

/* 자리표시자가 프로덕션에 literal로 나가는 것을 막는다. 원본 docx의
   `[담당자명]`·`[대표 연락처]`는 값을 못 받아 줄째로 뺐다(legalDocs.ts의
   ponytail 주석) — 나중에 값을 채울 때 대괄호째 복사해 넣기 쉬운 자리다. */
test("본문에 채워지지 않은 자리표시자가 남아 있지 않다", () => {
  for (const locale of ["ko", "en"] as const) {
    for (const id of LEGAL_DOC_IDS) {
      assert.doesNotMatch(
        legalDocBody(locale, id),
        /\[[^\]]+\]/,
        `${locale}/${id}에 [자리표시자]가 남아 있다`
      );
    }
    assert.doesNotMatch(couponGuideBody(locale), /\[[^\]]+\]/);
  }
});

/* 국외 이전 고지는 개인정보보호법이 요구하는 항목이라 누락되면 법적 문제가 된다.
   전사 중에 통째로 빠뜨려도 화면은 멀쩡해 보이므로 여기서 잡는다. */
test("개인정보처리방침에 국외 이전 고지가 들어 있다", () => {
  assert.match(legalDocBody("ko", "privacy"), /제28조의8/);
  assert.match(legalDocBody("ko", "privacy"), /인도/);
  assert.match(legalDocBody("en", "privacy"), /Article 28-8/);
  assert.match(legalDocBody("en", "privacy"), /India/);
});

/* UI 껍데기는 본문과 달리 로케일 4종을 모두 따른다. 하나라도 빠지면 그 로케일
   화면에서 탭 이름이 키 문자열(`legal.tab.terms`)로 그대로 뜬다. */
test("legal.* UI 키가 로케일 4종에 모두 있다", () => {
  const keys = [
    "legal.title",
    "legal.agreeNotice",
    "legal.confirmButton",
    "legal.closeAria",
    "legal.openButton",
    "legal.originalNotice",
    "couponGuide.title",
    "couponGuide.openButton",
    ...LEGAL_DOC_IDS.map((id) => `legal.tab.${id}`),
  ];
  for (const [name, dict] of [
    ["ko", ko],
    ["en", en],
    ["ja", ja],
    ["zh", zh],
  ] as const) {
    for (const key of keys) {
      assert.ok(dict[key], `${name}에 ${key}가 없다`);
    }
  }
});

/* 본문을 로케일 사전으로 되돌리면 법률 팝업을 열지도 않는 전원의 번들에 실린다
   (첫 화면 660KB 절감 작업과 어긋난다). 되돌림을 여기서 잡는다. */
test("법률 본문이 로케일 사전에 섞여 들어가지 않았다", () => {
  for (const dict of [ko, en, ja, zh]) {
    for (const key of Object.keys(dict)) {
      assert.ok(
        !key.startsWith("legal.body"),
        `${key}: 본문은 legalDocs.ts에 두고 사전에는 UI 문구만 둔다`
      );
    }
  }
});

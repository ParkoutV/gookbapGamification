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

/* 연락처 4개(2026-08-19)에 이어 시행일까지 채워, **남은 자리표시자가 없다**
   (2026-08-19, 이란토가 2026년 8월 21일로 지정). 목록을 비워 둬서 새 자리표시자나
   오타로 생긴 대괄호가 조용히 배포되는 것을 막는다. */
const ALLOWED_PLACEHOLDERS = new Set<string>([]);

test("본문의 자리표시자는 아는 것뿐이다", () => {
  for (const locale of ["ko", "en"] as const) {
    const bodies = [...LEGAL_DOC_IDS.map((id) => legalDocBody(locale, id)), couponGuideBody(locale)];
    for (const body of bodies) {
      for (const found of body.match(/\[[^\]]*\]/g) ?? []) {
        assert.ok(ALLOWED_PLACEHOLDERS.has(found), `${locale}에 모르는 자리표시자 ${found}`);
      }
    }
  }
});

/* 개인정보보호법상 처리방침에는 보호담당자 연락처가 있어야 한다. 예전에는 자리표시자가
   남아 있는지를 검사했는데, 값을 채운 지금은 **줄째로 사라지는 것**이 회귀다.
   실제로 전사 중에 문서 끝이 잘려 이 줄들이 통째로 빠진 적이 있다(아래 11항 테스트 참고). */
test("담당자 연락처가 ko·en 양쪽에 실제 값으로 들어 있다", () => {
  for (const locale of ["ko", "en"] as const) {
    const privacy = legalDocBody(locale, "privacy");
    assert.match(privacy, /official@wavenvibe\.com/);
    assert.match(privacy, /8302-3932/);
    assert.match(legalDocBody(locale, "terms"), /official@wavenvibe\.com/);
  }
});

/* **전사 중에 문서 끝이 잘리는 것을 잡는다.** 실제로 한 번 겪었다(2026-08-14):
   docx를 `head`로 잘라 읽은 탓에 처리방침 11항(변경 안내)과 이메일·연락처·시행일이
   통째로 빠진 채로 커밋됐다. 화면은 멀쩡해 보이고 앞부분이 다 맞아서 눈으로는
   드러나지 않는다 — 마지막 항의 존재를 직접 박아두는 편이 확실하다.
   원문에 항이 추가되면 이 숫자도 함께 올릴 것. */
test("개인정보처리방침이 마지막 항까지 전사돼 있다", () => {
  assert.match(legalDocBody("ko", "privacy"), /11\. 개인정보처리방침의 변경/);
  assert.match(legalDocBody("ko", "privacy"), /시행일: 2026년 8월 21일/);
  assert.match(legalDocBody("en", "privacy"), /11\. Changes to This Privacy Policy/);
  assert.match(legalDocBody("en", "privacy"), /Effective date: August 21, 2026/);
});

/* 이용약관은 7조, 쿠폰안내는 '기타'가 마지막이다(원문 실측). 위와 같은 이유. */
test("나머지 두 문서도 마지막 절까지 전사돼 있다", () => {
  assert.match(legalDocBody("ko", "terms"), /제7조 문의/);
  assert.match(couponGuideBody("ko"), /운영 상황에 따라 동일한 가치의 다른 혜택으로 변경될 수 있습니다\./);
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

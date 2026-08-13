import { test } from "node:test";
import assert from "node:assert/strict";
import { formatNickname } from "./nicknameParts.ts";

const PARTS = {
  first: { ko: "든든한", en: "Hearty", ja: "しっかり" },
  last: { ko: "국밥", en: "Gookbap", ja: "クッパ" },
  number: "0023",
};

test("formatNickname: 로케일에 맞는 언어로 조립한다", () => {
  // 이번 수정의 핵심. 예전에는 서버가 한국어로 확정해서 넘겨 영문 환경에서도
  // "든든한 국밥 #0023"이 나왔다(2026-08-12 제보).
  assert.equal(formatNickname(PARTS, "ko"), "든든한 국밥 #0023");
  assert.equal(formatNickname(PARTS, "en"), "Hearty Gookbap #0023");
  assert.equal(formatNickname(PARTS, "ja"), "しっかり クッパ #0023");
});

test("formatNickname: '#' 앞은 non-breaking space다", () => {
  // 좁은 화면에서 번호만 다음 줄로 떨어지지 않게 한다
  // (gookbapanalyze의 CouponScanner와 같은 규칙). 단어 사이는 일반 공백이다.
  const out = formatNickname(PARTS, "ko");
  assert.ok(out.includes(" #"), "번호 앞이 non-breaking space가 아니다");
  assert.ok(out.includes("든든한 국밥"), "단어 사이는 일반 공백이어야 한다");
});

test("formatNickname: 번역이 없는 언어는 한국어로 떨어진다", () => {
  // 대시보드에서 번역을 채우지 않은 항목이 있을 수 있다. 그때도 화면이 비지 않아야 한다.
  const partial = { first: { ko: "든든한" }, last: { ko: "국밥" }, number: null };
  assert.equal(formatNickname(partial, "en"), "든든한 국밥");
});

test("formatNickname: 한쪽만 번역돼 있으면 통째로 한국어 — 언어를 섞지 않는다", () => {
  // 프리셋 번역이 부분적으로만 채워져 있을 때 단어별로 폴백하면 "Hearty 국밥"처럼
  // 한 이름 안에 두 언어가 섞인다. 어색해서 통째로 한국어로 떨어뜨린다
  // (2026-08-12, 이란토). 번역이 채워지면 자동으로 해당 언어가 나온다.
  const KO = "든든한 국밥\u00a0#0023"; // '#' 앞은 NBSP다(위 테스트 참고).

  const firstOnly = { first: { ko: "든든한", en: "Hearty" }, last: { ko: "국밥" }, number: "0023" };
  assert.equal(formatNickname(firstOnly, "en"), KO);

  const lastOnly = { first: { ko: "든든한" }, last: { ko: "국밥", en: "Gookbap" }, number: "0023" };
  assert.equal(formatNickname(lastOnly, "en"), KO);

  // 빈 문자열·공백도 "번역 없음"으로 친다.
  const blank = { first: { ko: "든든한", en: "  " }, last: { ko: "국밥", en: "Gookbap" }, number: null };
  assert.equal(formatNickname(blank, "en"), "든든한 국밥");

  // 둘 다 있으면 당연히 해당 언어로 나온다(위 폴백이 과하게 걸리지 않는지 확인).
  assert.equal(formatNickname(PARTS, "en"), "Hearty Gookbap\u00a0#0023");
});

/* \uc911\uad6d\uc5b4 \ucd94\uac00(2026-08-13)\ub85c `resolveLocalizedName`\uc5d0 en \ud3f4\ubc31\uc774 \ub4e4\uc5b4\uac14\uc9c0\ub9cc,
   \ub2c9\ub124\uc784\uc740 **\uadf8 \uacbd\ub85c\ub97c \ud0c0\uc9c0 \uc54a\ub294\ub2e4** \u2014 `formatNickname`\uc774 \uc790\uccb4 `pickExact`\ub85c \uc804\uccb4
   \ub2e8\uc704 \ud310\uc815\uc744 \ud558\uace0 `resolveLocalizedName`\uc740 ko \uace0\uc815 \uc778\uc790\ub85c\ub9cc \ubd80\ub974\uae30 \ub54c\ubb38\uc774\ub2e4.
   \uc774 \uad6c\ubd84\uc774 \ubb34\ub108\uc9c0\uba74 `Hearty \uad6d\ubc25`\uc774 zh \uc0ac\uc6a9\uc790\uc5d0\uac8c \ub418\uc0b4\uc544\ub09c\ub2e4(\uc704 \ud14c\uc2a4\ud2b8 \ucc38\uace0).
   `nickname_presets.text`\uc5d0 zh\ub294 \ub2f9\ubd84\uac04 \uc5c6\uc73c\ubbc0\ub85c \uc2e4\uc81c\ub85c \ub298 \uac78\ub9ac\ub294 \uacbd\ub85c\ub2e4. */
test("formatNickname: zh \ubc88\uc5ed\uc774 \uc5c6\uc73c\uba74 en\uc774 \uc544\ub2c8\ub77c \ud55c\uad6d\uc5b4\ub85c \ub5a8\uc5b4\uc9c4\ub2e4", () => {
  assert.equal(formatNickname(PARTS, "zh"), "\ub4e0\ub4e0\ud55c \uad6d\ubc25\u00a0#0023");

  // \ud55c\ucabd\uc5d0\ub9cc zh\uac00 \uc788\uc5b4\ub3c4 \ub9c8\ucc2c\uac00\uc9c0 \u2014 \uc5b8\uc5b4\ub97c \uc11e\uc9c0 \uc54a\ub294\ub2e4.
  const firstOnly = {
    first: { ko: "\ub4e0\ub4e0\ud55c", en: "Hearty", zh: "\u624e\u5b9e\u7684" },
    last: { ko: "\uad6d\ubc25", en: "Gookbap" },
    number: null,
  };
  assert.equal(formatNickname(firstOnly, "zh"), "\ub4e0\ub4e0\ud55c \uad6d\ubc25");

  // \ub458 \ub2e4 zh\uac00 \uc788\uc73c\uba74 \uc911\uad6d\uc5b4\ub85c \ub098\uc628\ub2e4.
  const both = {
    first: { ko: "\ub4e0\ub4e0\ud55c", zh: "\u624e\u5b9e\u7684" },
    last: { ko: "\uad6d\ubc25", zh: "\u6c64\u996d" },
    number: null,
  };
  assert.equal(formatNickname(both, "zh"), "\u624e\u5b9e\u7684 \u6c64\u996d");
});

test("formatNickname: number가 없으면 붙이지 않는다", () => {
  assert.equal(formatNickname({ ...PARTS, number: null }, "en"), "Hearty Gookbap");
});

test("formatNickname: 이미 조립된 문자열은 그대로 쓴다", () => {
  // 배정 API가 아직 한국어 문자열만 주는 경로(첫 방문)와 로컬 폴백이 여기 해당한다.
  // gookbapanalyze가 응답에 맵을 추가하면 이 분기는 줄어든다.
  assert.equal(formatNickname({ text: "든든한 국밥 #0023" }, "en"), "든든한 국밥 #0023");
});

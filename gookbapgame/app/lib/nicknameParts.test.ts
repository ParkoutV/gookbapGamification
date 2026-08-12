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

test("formatNickname: number가 없으면 붙이지 않는다", () => {
  assert.equal(formatNickname({ ...PARTS, number: null }, "en"), "Hearty Gookbap");
});

test("formatNickname: 이미 조립된 문자열은 그대로 쓴다", () => {
  // 배정 API가 아직 한국어 문자열만 주는 경로(첫 방문)와 로컬 폴백이 여기 해당한다.
  // gookbapanalyze가 응답에 맵을 추가하면 이 분기는 줄어든다.
  assert.equal(formatNickname({ text: "든든한 국밥 #0023" }, "en"), "든든한 국밥 #0023");
});

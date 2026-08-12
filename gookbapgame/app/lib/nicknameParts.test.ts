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

test("formatNickname: number가 없으면 붙이지 않는다", () => {
  assert.equal(formatNickname({ ...PARTS, number: null }, "en"), "Hearty Gookbap");
});

test("formatNickname: 이미 조립된 문자열은 그대로 쓴다", () => {
  // 배정 API가 아직 한국어 문자열만 주는 경로(첫 방문)와 로컬 폴백이 여기 해당한다.
  // gookbapanalyze가 응답에 맵을 추가하면 이 분기는 줄어든다.
  assert.equal(formatNickname({ text: "든든한 국밥 #0023" }, "en"), "든든한 국밥 #0023");
});

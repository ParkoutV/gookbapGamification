import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * phase 1(쿠폰 설문)의 판정 권위가 서버 RPC(`check_pending_survey`)에 있어야 한다.
 *
 * 예전에는 localStorage(`hasSurveySubmitted`)만 보고 설문을 건너뛰었는데, 쿠키가
 * 새로 발급되면 participant_id가 바뀌어도 그 플래그는 남아 **설문을 안 한 사람이
 * 뽑기로 직행하고 서버가 403(SURVEY_REQUIRED)으로 거절했다**(2026-08-15, 구자건 제보).
 *
 * 이 검사는 그 회귀를 막는다. 런타임 동작이 아니라 소스 구조를 보는 이유는, 이
 * 저장소에 컴포넌트 테스트 기반이 없고(모든 테스트가 순수 `app/lib` 모듈이다)
 * 문제의 본질이 "어느 값을 판정에 쓰는가"라는 구조적 선택이기 때문이다.
 */

const PAGE = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");
const FLOW = readFileSync(
  new URL("../hooks/useCouponFlow.ts", import.meta.url),
  "utf8"
);
const ACTIONS = readFileSync(new URL("../actions.ts", import.meta.url), "utf8");

test("설문 건너뛰기 판정에 RPC 결과를 쓴다", () => {
  assert.match(PAGE, /fetchPendingSurvey\(COUPON_SURVEY_PHASE\)/);
});

test("localStorage로 설문을 건너뛰지 않는다 — 쿠키와 수명이 달라 403을 부른다", () => {
  // 주석에는 남아 있어도 되지만 호출은 없어야 한다.
  const calls = PAGE.match(/hasSurveySubmitted\(\)/g) ?? [];
  const inComment = PAGE.match(/^\s*(\/\/|\*).*hasSurveySubmitted\(\)/gm) ?? [];
  assert.equal(
    calls.length,
    inComment.length,
    "page.tsx가 hasSurveySubmitted()를 실제로 호출하고 있다"
  );
});

test("설문 안내 진입만으로는 check_pending_survey를 부르지 않는다", () => {
  // 그 RPC는 선택 문항을 돌려주며 '1회 노출'로 기록한다(대시보드 optional_survey_once).
  // 안내(surveyIntro)에 들어오자마자 부르면, '다음에 하기'를 누른 사람의 단 한 번뿐인
  // (선택) 문항 노출이 타버려 재진입해도 영영 안 뜬다(2026-08-31 이란토 제보).
  // 조회는 '참여하기'(participateSurvey) 뒤로 미뤄야 한다.
  const enterStart = PAGE.indexOf("const enterSurveyFlow");
  const enterEnd = PAGE.indexOf("const participateSurvey");
  assert.ok(
    enterStart >= 0 && enterEnd > enterStart,
    "enterSurveyFlow / participateSurvey 정의를 찾지 못했다"
  );
  assert.doesNotMatch(
    PAGE.slice(enterStart, enterEnd),
    /fetchPendingSurvey/,
    "enterSurveyFlow가 아직 RPC를 부른다 — 선택 문항 노출이 거절로 타버린다"
  );
  assert.match(PAGE, /onParticipate=\{participateSurvey\}/);
});

test("조회 실패는 건너뛰지 않는다 (fail closed)", () => {
  // `ok`가 true일 때만 건너뛴다. `pending.questionIds.length === 0`만 보면
  // 실패가 빈 배열로 위장돼 그대로 403이 된다.
  assert.match(PAGE, /pending\.ok\s*&&\s*pending\.questionIds\.length === 0/);
});

test("fetchPendingSurvey는 실패와 빈 목록을 구분해서 돌려준다", () => {
  assert.match(ACTIONS, /ok:\s*false,\s*questionIds:\s*\[\]/);
  assert.match(ACTIONS, /ok:\s*true,/);
});

test("재제출 가드는 localStorage가 아니라 세션 ref를 본다", () => {
  // 서버가 설문을 띄웠다는 것은 아직 응답을 못 받았다는 뜻이므로, 옛 localStorage
  // 플래그로 제출을 건너뛰면 답이 저장되지 않고 403이 남는다.
  assert.match(FLOW, /if \(hasSubmittedRef\.current\) return true;/);
  assert.doesNotMatch(FLOW, /if \(hasSurveySubmitted\(\)\) return true;/);
});

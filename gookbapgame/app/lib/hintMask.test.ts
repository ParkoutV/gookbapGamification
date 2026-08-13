import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickHintMaskIndex,
  applyHintMask,
  pickHintSurveyQuestion,
  HINT_MASK_GLYPH,
  HINT_MASK_MIN_SLOTS,
} from "./hintMask.ts";
import type { SurveyQuestion } from "./surveyAnswers.ts";

const NAMES = ["깍두기", "숟가락", "대파", "고춧가루", "뚝배기"];

/*
 * **슬롯이 2개 이하면 가리지 않는다.** 1개면 유일한 줄이 사라져 힌트가 완전히
 * 무의미해지고, 2개면 절반이 날아가 힌트 값이 과하게 떨어진다(스펙 §7).
 * 실제 출제 개수는 이미지별 questions_count가 정하므로 1~2개 단계가 나올 수 있다.
 */
test("슬롯이 2개 이하면 가리지 않는다(-1)", () => {
  assert.equal(pickHintMaskIndex(0), -1);
  assert.equal(pickHintMaskIndex(1), -1);
  assert.equal(pickHintMaskIndex(2), -1);
});

test("슬롯이 3개 이상이면 범위 안의 인덱스를 고른다", () => {
  assert.equal(HINT_MASK_MIN_SLOTS, 3);
  assert.equal(pickHintMaskIndex(3, 0), 0);
  assert.equal(pickHintMaskIndex(3, 0.5), 1);
  // random이 1에 가까우면 floor가 length를 넘길 수 있어 상한을 걸어둔다.
  assert.equal(pickHintMaskIndex(3, 0.999999), 2);
  assert.equal(pickHintMaskIndex(3, 1), 2);
});

/*
 * **줄 수가 보존되는 것이 핵심이다.** HintClipboard는 "줄 수 == 차이 슬롯 수"를
 * 지키고 있어서, 줄이 사라지면 플레이어가 문제를 다 찾은 것으로 착각한다.
 */
test("가림은 줄 수를 보존하고 정확히 1줄만 바꾼다", () => {
  const masked = applyHintMask(NAMES, 2);
  assert.equal(masked.length, NAMES.length);
  assert.equal(masked.filter((n) => n === HINT_MASK_GLYPH).length, 1);
  assert.equal(masked[2], HINT_MASK_GLYPH);
  assert.deepEqual([masked[0], masked[1], masked[3], masked[4]], [
    NAMES[0],
    NAMES[1],
    NAMES[3],
    NAMES[4],
  ]);
});

/* 정답 문자열이 결과에 남아 있으면 개발자도구·스크린리더로 읽힌다 — 글자를 아예
   렌더하지 않는 것이 blur/검은 사각형 대신 가토를 쓰는 이유다. */
test("가려진 줄에는 원래 이름이 남지 않는다", () => {
  const masked = applyHintMask(NAMES, 0);
  assert.equal(masked.includes(NAMES[0]), false);
});

test("maskIndex가 -1이면 아무 줄도 가리지 않는다", () => {
  assert.deepEqual(applyHintMask(NAMES, -1), NAMES);
  // 슬롯 1·2개 단계가 실제로 이 경로를 탄다.
  assert.deepEqual(applyHintMask(["깍두기"], pickHintMaskIndex(1)), ["깍두기"]);
  assert.deepEqual(applyHintMask(["깍두기", "대파"], pickHintMaskIndex(2)), ["깍두기", "대파"]);
});

const q = (id: string): SurveyQuestion => ({
  questionId: id,
  questionType: 0,
  text: { ko: id },
  options: [{ ko: "예" }, { ko: "아니오" }],
  isRequired: true,
});

test("pending 목록이 있으면 그중에서 고른다", () => {
  const questions = [q("a"), q("b"), q("c")];
  assert.equal(pickHintSurveyQuestion(questions, ["b", "c"], 0)?.questionId, "b");
  assert.equal(pickHintSurveyQuestion(questions, ["b", "c"], 0.99)?.questionId, "c");
});

/*
 * pending이 비어 있는 경우는 두 가지다 — 전부 응답했거나 check_pending_survey
 * 조회가 실패했거나. 둘 다 **설문을 포기하지 않고** 전체에서 무작위로 재탕한다
 * (phase 0은 중복 응답 허용이라 서버에서 막히지 않는다).
 */
test("pending이 비면 전체에서 고른다(재탕)", () => {
  const questions = [q("a"), q("b")];
  assert.equal(pickHintSurveyQuestion(questions, [], 0)?.questionId, "a");
  assert.equal(pickHintSurveyQuestion(questions, [], 0.99)?.questionId, "b");
});

test("pending id가 전체 목록에 없어도 전체에서 고른다", () => {
  const questions = [q("a")];
  assert.equal(pickHintSurveyQuestion(questions, ["없는id"], 0)?.questionId, "a");
});

/* 전체도 비면 null — 호출부는 설문을 건너뛰고 곧바로 클립보드를 열되 **차감은 한다**
   (힌트를 실제로 받았으므로 공짜가 아니다). */
test("문항이 아예 없으면 null", () => {
  assert.equal(pickHintSurveyQuestion([], [], 0.5), null);
  assert.equal(pickHintSurveyQuestion([], ["a"], 0.5), null);
});

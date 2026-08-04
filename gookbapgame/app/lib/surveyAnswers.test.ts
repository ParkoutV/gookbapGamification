import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSurveyResponseRows, type SurveyQuestion } from "./surveyAnswers.ts";

const single: SurveyQuestion = {
  questionId: 1,
  questionType: 0,
  text: { ko: "국밥을 얼마나 자주 드시나요?" },
  options: [{ ko: "주 1회" }, { ko: "주 3회" }],
};
const multi: SurveyQuestion = {
  questionId: 2,
  questionType: 1,
  text: { ko: "좋아하는 반찬을 모두 고르세요" },
  options: [{ ko: "깍두기" }, { ko: "김치" }, { ko: "양파" }],
};
const free: SurveyQuestion = {
  questionId: 3,
  questionType: 2,
  text: { ko: "한마디 남겨주세요" },
  options: [{ ko: "자유롭게 적어주세요" }],
};

test("buildSurveyResponseRows: 단일 선택은 answer_data에 인덱스 숫자를 담는다", () => {
  // 대시보드 renderType0이 String(answer_data)를 옵션 인덱스로 대조하므로
  // 배열이 아니라 숫자여야 한다.
  const rows = buildSurveyResponseRows([single], { 1: [1] });
  assert.deepEqual(rows, [{ question_id: 1, answer_data: 1 }]);
});

test("buildSurveyResponseRows: 다중 선택은 행 1개에 인덱스 배열을 담는다", () => {
  const rows = buildSurveyResponseRows([multi], { 2: [0, 2] });
  assert.deepEqual(rows, [{ question_id: 2, answer_data: [0, 2] }]);
});

test("buildSurveyResponseRows: 주관식은 answer_data에 문자열을 담고 앞뒤 공백을 제거한다", () => {
  const rows = buildSurveyResponseRows([free], { 3: "  맛있었어요 " });
  assert.deepEqual(rows, [{ question_id: 3, answer_data: "맛있었어요" }]);
});

test("buildSurveyResponseRows: 미응답 문항은 행을 만들지 않는다", () => {
  const rows = buildSurveyResponseRows([single, multi, free], { 2: [], 3: "   " });
  assert.deepEqual(rows, []);
});

test("buildSurveyResponseRows: 여러 문항이 섞여도 문항 순서대로 만든다", () => {
  const rows = buildSurveyResponseRows([single, multi, free], { 1: [0], 2: [1], 3: "굿" });
  assert.deepEqual(rows, [
    { question_id: 1, answer_data: 0 },
    { question_id: 2, answer_data: [1] },
    { question_id: 3, answer_data: "굿" },
  ]);
});

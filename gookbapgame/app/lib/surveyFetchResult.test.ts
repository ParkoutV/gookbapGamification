import { test } from "node:test";
import assert from "node:assert/strict";
import { toSurveyFetchResult } from "./surveyFetchResult.ts";

test("조회 성공 + 문항 있음 -> ok:true, questions 매핑", () => {
  const result = toSurveyFetchResult(
    [
      {
        question_id: "11111111-1111-1111-1111-111111111111",
        question_type: 1,
        question_text: { ko: "무엇을 드셨나요?" },
        options: [{ ko: "국밥" }, { ko: "수육" }],
      },
    ],
    null
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.questions, [
    {
      questionId: "11111111-1111-1111-1111-111111111111",
      questionType: 1,
      text: { ko: "무엇을 드셨나요?" },
      options: [{ ko: "국밥" }, { ko: "수육" }],
      isRequired: true,
    },
  ]);
});

// 이 테스트가 핵심이다. 기존 fetchSurveyQuestions는 두 경우 모두 []를 반환해
// 호출부에서 구분할 수 없었고, 그래서 프로덕션 장애가 "문항 0개"로 위장됐다.
test("조회 실패(error) -> ok:false. 빈 결과와 반드시 구분된다", () => {
  const failed = toSurveyFetchResult(null, { message: "permission denied" });
  const empty = toSurveyFetchResult([], null);

  assert.equal(failed.ok, false, "error가 있으면 ok:false여야 한다");
  assert.equal(empty.ok, true, "정상 조회 결과가 0건인 것은 실패가 아니다");
  assert.notEqual(
    failed.ok,
    empty.ok,
    "장애와 '문항 0개'가 호출부에서 구분 가능해야 한다"
  );
  assert.deepEqual(empty.questions, []);
});

test("정상 조회인데 문항이 0건 -> ok:true, questions:[] (설문 스킵은 정당)", () => {
  const result = toSurveyFetchResult([], null);
  assert.equal(result.ok, true);
  assert.deepEqual(result.questions, []);
});

test("question_id는 uuid 문자열을 그대로 보존한다", () => {
  const uuid = "abcdef01-2345-6789-abcd-ef0123456789";
  const result = toSurveyFetchResult(
    [{ question_id: uuid, question_type: 0, question_text: { ko: "q" }, options: [] }],
    null
  );
  assert.equal(result.questions[0].questionId, uuid);
});

test("알 수 없는 question_type은 0(단일 선택)으로 수렴시킨다", () => {
  const result = toSurveyFetchResult(
    [{ question_id: "id-1", question_type: 99, question_text: { ko: "q" }, options: [] }],
    null
  );
  assert.equal(result.questions[0].questionType, 0);
});

test("options가 null이면 빈 배열로 정규화한다", () => {
  const result = toSurveyFetchResult(
    [{ question_id: "id-1", question_type: 0, question_text: { ko: "q" }, options: null }],
    null
  );
  assert.deepEqual(result.questions[0].options, []);
});

// question_text는 jsonb가 아니라 text 컬럼이라 JSON 문자열로 온다.
// 파싱하지 않으면 화면에 질문 제목이 전부 "—"로 나온다(2026-08-07 프로덕션에서 확인).
test("question_text가 JSON 문자열로 오면 파싱해서 객체로 만든다", () => {
  const result = toSurveyFetchResult(
    [
      {
        question_id: "id-1",
        question_type: 0,
        question_text: '{"ko":"거주 지역은?","en":"Where do you live?"}',
        options: [],
      },
    ],
    null
  );
  assert.deepEqual(result.questions[0].text, {
    ko: "거주 지역은?",
    en: "Where do you live?",
  });
});

test("question_text가 이미 객체면 그대로 둔다", () => {
  const result = toSurveyFetchResult(
    [{ question_id: "id-1", question_type: 0, question_text: { ko: "질문" }, options: [] }],
    null
  );
  assert.deepEqual(result.questions[0].text, { ko: "질문" });
});

test("question_text가 JSON이 아닌 평문이면 기본 언어(ko) 텍스트로 취급한다", () => {
  const result = toSurveyFetchResult(
    [{ question_id: "id-1", question_type: 0, question_text: "그냥 평문", options: [] }],
    null
  );
  assert.deepEqual(result.questions[0].text, { ko: "그냥 평문" });
});

test("is_required가 false면 선택 문항(isRequired:false)이 된다", () => {
  const result = toSurveyFetchResult(
    [{ question_id: "id-1", question_type: 0, question_text: { ko: "성별" }, options: [], is_required: false }],
    null
  );
  assert.equal(result.questions[0].isRequired, false);
});

// NULL/누락은 필수로 본다 — 선택으로 잘못 열어주는 것보다 안전하다.
test("is_required가 null이거나 없으면 필수로 취급한다", () => {
  const nulled = toSurveyFetchResult(
    [{ question_id: "id-1", question_type: 0, question_text: { ko: "q" }, options: [], is_required: null }],
    null
  );
  const missing = toSurveyFetchResult(
    [{ question_id: "id-2", question_type: 0, question_text: { ko: "q" }, options: [] }],
    null
  );
  assert.equal(nulled.questions[0].isRequired, true);
  assert.equal(missing.questions[0].isRequired, true);
});

test("data와 error가 모두 null이어도 ok:true, 빈 목록으로 처리한다", () => {
  const result = toSurveyFetchResult(null, null);
  assert.equal(result.ok, true);
  assert.deepEqual(result.questions, []);
});

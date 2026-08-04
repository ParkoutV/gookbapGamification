import type { LocalizedName } from "./i18n/localizedName.ts";

export type SurveyQuestion = {
  questionId: number;
  /** 0: 단일 선택, 1: 다중 선택, 2: 주관식 단답형 */
  questionType: 0 | 1 | 2;
  text: LocalizedName;
  /**
   * 선택형(0, 1)에서는 선택지 목록.
   * 주관식(2)에서는 options[0]이 선택지가 아니라 다국어 placeholder다
   * (gookbapanalyze/AGENTS.md).
   */
  options: LocalizedName[];
};

/** 키는 questionId. 선택형은 선택한 옵션 인덱스 배열, 주관식은 입력 문자열. */
export type SurveyAnswerMap = Record<number, number[] | string>;

/**
 * 문항 하나당 행 하나. 답변은 answer_data(jsonb) 한 컬럼에 담는다.
 * 형태는 대시보드 SurveyResultsClient.tsx의 렌더러가 해석하는 것을 따른다:
 * type 0 → 인덱스 숫자, type 1 → 인덱스 배열, type 2 → 문자열.
 */
export type SurveyResponseRow = {
  question_id: number;
  answer_data: number | number[] | string;
};

export function buildSurveyResponseRows(
  questions: SurveyQuestion[],
  answers: SurveyAnswerMap
): SurveyResponseRow[] {
  const rows: SurveyResponseRow[] = [];

  for (const question of questions) {
    const answer = answers[question.questionId];

    if (question.questionType === 2) {
      if (typeof answer !== "string") continue;
      const trimmed = answer.trim();
      if (trimmed === "") continue;
      rows.push({ question_id: question.questionId, answer_data: trimmed });
      continue;
    }

    if (!Array.isArray(answer) || answer.length === 0) continue;

    // 단일 선택은 배열이 아니라 숫자로 넣는다. renderType0이 String(answer_data)를
    // 옵션 인덱스와 직접 대조하기 때문에 [1]로 넣으면 집계에서 누락된다.
    rows.push({
      question_id: question.questionId,
      answer_data: question.questionType === 0 ? answer[0] : answer,
    });
  }

  return rows;
}

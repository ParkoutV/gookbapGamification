import type { LocalizedName } from "./i18n/localizedName.ts";
import type { SurveyQuestion } from "./surveyAnswers.ts";

export type SurveyQuestionRow = {
  question_id: string;
  question_type: number;
  /** `text` 컬럼이라 JSON 문자열로 온다(jsonb인 options와 다름). */
  question_text: LocalizedName | string;
  options: LocalizedName[] | null;
  is_required?: boolean | null;
};

/**
 * `question_text`는 jsonb가 아니라 `text` 컬럼이고 다국어 JSON이 **문자열로 직렬화**돼
 * 저장된다(gookbapanalyze/AGENTS.md 372). 파싱하지 않으면 문자열이 그대로 넘어가
 * `resolveLocalizedName`이 객체 키를 못 찾고 전부 "—"로 렌더된다.
 * 대시보드 SurveyManager의 safeJSONParse와 같은 처리다.
 */
function parseLocalized(value: LocalizedName | string): LocalizedName {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    // 다국어 JSON이 아니라 평문으로 저장된 경우. 기본 언어 텍스트로 취급한다.
    return { ko: value };
  }
}

/**
 * 조회 성공 여부(`ok`)와 문항 목록을 분리해서 담는다.
 *
 * 이 타입이 존재하는 이유: 이전 구현은 조회 실패 시에도 `[]`를 반환했다.
 * 그래서 호출부(useCouponFlow)에서 "DB 장애"와 "Phase 1 문항이 0개"가
 * 완전히 동일하게 보였고, 장애가 조용한 설문 스킵으로 위장됐다.
 * `ok`가 이 둘을 구분한다.
 */
export type SurveyFetchResult = {
  /** false면 조회 자체가 실패한 것. 문항이 0건인 정상 응답과 다르다. */
  ok: boolean;
  questions: SurveyQuestion[];
};

function normalizeQuestionType(value: number): 0 | 1 | 2 {
  return (value === 1 || value === 2 ? value : 0) as 0 | 1 | 2;
}

/**
 * supabase 응답(data, error)을 SurveyFetchResult로 변환한다.
 * DB 클라이언트에 의존하지 않는 순수 함수라 단위 테스트가 가능하다.
 */
export function toSurveyFetchResult(
  data: SurveyQuestionRow[] | null,
  error: { message: string } | null
): SurveyFetchResult {
  if (error) return { ok: false, questions: [] };

  return {
    ok: true,
    questions: (data ?? []).map((row) => ({
      questionId: row.question_id,
      questionType: normalizeQuestionType(row.question_type),
      text: parseLocalized(row.question_text),
      options: row.options ?? [],
      // NULL이면 필수로 본다 — 안전한 쪽. 명시적 false만 선택 문항.
      isRequired: row.is_required !== false,
    })),
  };
}

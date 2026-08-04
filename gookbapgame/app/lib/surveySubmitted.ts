const STORAGE_KEY = "gukbap_survey_submitted";

/**
 * "이 기기에서 설문을 이미 제출했다"는 표시. survey_responses는 INSERT만 열려 있어
 * 서버가 SELECT로 중복 제출을 막을 수 없다(app/hooks/useCouponFlow.ts 참고).
 * 마운트 스코프 ref만으로는 새로고침에 씻겨나가므로, pendingDraw.ts와 같은 방식으로
 * localStorage에 영속화한다.
 *
 * 발급 자격의 근거가 아니라 UI 힌트다 — 이 값을 조작해도 서버 쪽 응답 데이터가
 * 사라지거나 생기지 않는다.
 */
function isAvailable(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function markSurveySubmitted(): void {
  if (!isAvailable()) return;
  localStorage.setItem(STORAGE_KEY, "1");
}

export function hasSurveySubmitted(): boolean {
  if (!isAvailable()) return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

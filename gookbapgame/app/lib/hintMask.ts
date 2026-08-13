import type { SurveyQuestion } from "./surveyAnswers.ts";

/**
 * 가림을 적용하는 최소 슬롯 수. **3개 미만이면 가리지 않는다.**
 *
 * `STAGE_CONFIG`의 `diffCount`는 5·5·5·5·5·5·7이지만 실제 출제 개수는 이미지별
 * `questions_count`가 정하므로(`stageConfig.ts` 주석) 슬롯이 1~2개인 단계가 나올 수
 * 있다. 1개면 유일한 줄이 가려져 힌트가 완전히 무의미해지고, 2개면 절반이 사라져
 * 힌트 값이 과하게 떨어진다.
 */
export const HINT_MASK_MIN_SLOTS = 3;

/** 감열지 인쇄가 날아간 자리. 로케일 파일이 아니라 여기 하드코딩하는 이유는
 *  `HintClipboard`가 `fontFamily: "monospace"`라 픽셀 폰트 서브셋과 무관하기
 *  때문이다 — 로케일에 넣으면 서브셋 재빌드 대상이 되고 빠뜨리면 두부가 된다. */
export const HINT_MASK_GLYPH = "░░░░";

/**
 * 가릴 줄의 인덱스. 슬롯이 `HINT_MASK_MIN_SLOTS` 미만이면 -1(가리지 않음).
 *
 * **호출부는 이 값을 한 번 뽑아 고정해야 한다.** 클립보드를 열 때마다 다시 뽑으면
 * 여닫는 것만으로 전부 드러난다 — `GameScreen`이 `useState` 초기화로 잡는다
 * (`HintClipboard`는 닫을 때 언마운트되므로 그쪽에 두면 매번 다시 뽑힌다).
 */
export function pickHintMaskIndex(slotCount: number, random: number = Math.random()): number {
  if (slotCount < HINT_MASK_MIN_SLOTS) return -1;
  return Math.min(slotCount - 1, Math.floor(random * slotCount));
}

/**
 * 가린 이름 목록. **글자를 렌더하지 않고 가토로 갈아치운다** — blur나 검은
 * 사각형은 정답 문자열이 DOM과 접근성 트리에 그대로 남아 개발자도구·스크린리더로
 * 읽힌다.
 *
 * **줄 수는 반드시 보존된다.** `HintClipboard`가 "줄 수 == 차이 슬롯 수"를 지키고
 * 있어서(그쪽 주석 참고) 줄이 사라지면 플레이어가 문제를 다 찾은 것으로 착각한다.
 */
export function applyHintMask(names: string[], maskIndex: number): string[] {
  return names.map((name, i) => (i === maskIndex ? HINT_MASK_GLYPH : name));
}

/**
 * 이번에 띄울 phase 0 문항 1건. 없으면 null(→ 설문을 건너뛰고 곧바로 클립보드).
 *
 * `pendingIds`는 `check_pending_survey`가 돌려준 미응답 문항 id 목록이다.
 * 교집합이 있으면 그중 무작위 1건, 비어 있으면(전부 응답했거나 조회 실패)
 * **전체에서 무작위 1건으로 재탕한다** — phase 0은 중복 응답이 허용되므로
 * 서버에서 막히지 않는다(phase 1·2만 트리거로 막는다).
 *
 * `order_index`는 정렬 순서일 뿐 우선순위가 아니라 무작위가 기본이다.
 */
export function pickHintSurveyQuestion(
  questions: SurveyQuestion[],
  pendingIds: string[],
  random: number = Math.random()
): SurveyQuestion | null {
  const pendingSet = new Set(pendingIds);
  const pending = questions.filter((q) => pendingSet.has(q.questionId));
  const pool = pending.length > 0 ? pending : questions;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))];
}

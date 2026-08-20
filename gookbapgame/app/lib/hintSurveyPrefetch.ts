import { fetchSurveyQuestions, fetchPendingSurveyQuestionIds } from "../actions";
import type { SurveyQuestion } from "./surveyAnswers";

/**
 * 힌트 설문(phase 0) 문항을 **게임 화면에 들어올 때 미리** 받아 둔다.
 *
 * **왜 있는가.** 예전에는 '?'를 누른 뒤에야 서버 액션 두 개를 부르기 시작해서,
 * 그동안 화면에 아무 변화가 없었다 — 누른 사람은 안 눌린 줄 안다. 게다가 게임
 * 타이머가 도는 중이라 그 침묵이 그대로 손해다.
 *
 * **로딩 표시를 붙이는 것으로는 부족하다.** 여기서 진짜 문제는 "기다린다는 사실을
 * 모르는 것"이 아니라 **기다린다는 것 자체**다. 카운트다운(3.2초)과 첫 힌트를
 * 누르기까지의 시간이면 조회는 이미 끝나 있다.
 *
 * **모듈 스코프에 캐시한다.** `GameScreen`은 단계마다 리마운트될 수 있어
 * (`lastSceneUrls`가 같은 이유로 모듈 스코프에 있다) 마운트 이펙트에 그냥 두면
 * 한 판에 7번 요청이 나간다. Promise를 그대로 들고 있으므로, 아직 안 끝났을 때
 * 클릭이 들어와도 그 Promise를 기다릴 뿐 요청이 겹치지 않는다.
 *
 * 판이 바뀌어도 비우지 않는다 — phase 0은 중복 응답이 허용되고(`pendingSurvey` 절),
 * `pickHintSurveyQuestion`이 미응답 목록이 비어도 전체에서 재탕하므로 낡은 값이
 * 사고가 되지 않는다.
 */
export interface HintSurveyData {
  questions: SurveyQuestion[];
  pendingIds: string[];
}

/** phase 0. `GameScreen`의 `HINT_SURVEY_PHASE`와 같은 값이다. */
const HINT_SURVEY_PHASE = 0;

let cached: Promise<HintSurveyData> | null = null;

async function load(): Promise<HintSurveyData> {
  const [result, pendingIds] = await Promise.all([
    fetchSurveyQuestions(HINT_SURVEY_PHASE),
    fetchPendingSurveyQuestionIds(HINT_SURVEY_PHASE),
  ]);
  return { questions: result.questions, pendingIds };
}

/**
 * 미리 받아 두거나, 이미 받아 둔 것을 돌려준다. 프리페치와 실제 사용이 **같은
 * 함수**를 부르는 것이 요점이다 — 두 경로로 가르면 프리페치가 빠진 채 배포돼도
 * 화면은 멀쩡해서 아무도 모른다.
 */
export function getHintSurvey(): Promise<HintSurveyData> {
  if (!cached) {
    // 실패한 Promise를 계속 들고 있으면 그 판 내내 설문이 뜨지 않는다.
    // 비워 두면 다음 클릭이 다시 시도한다(그 경로도 결국 힌트는 준다).
    cached = load().catch((error) => {
      console.error("[getHintSurvey] 힌트 설문 조회 실패:", error);
      cached = null;
      return { questions: [], pendingIds: [] };
    });
  }
  return cached;
}

/** 테스트용. 화면 코드에서 부를 일은 없다. */
export function resetHintSurveyPrefetch(): void {
  cached = null;
}

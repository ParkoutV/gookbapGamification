export type StageDef = {
  level: number;
  /**
   * **폴백값이다.** 실제 출제 개수는 뽑힌 이미지의 `base_images.questions_count`가
   * 정한다(대시보드에서 이미지마다 설정, 어느 레벨에 나올지도 이미지가 정한다).
   * 이 값은 그 컬럼이 비었을 때만 쓰인다 — `planGameSession` 참고.
   *
   * 2026-08-07 이전에는 이쪽이 유일한 기준이라 대시보드 설정이 무시됐다.
   */
  diffCount: number;
  pointPool: number;
};

export const STAGE_CONFIG: StageDef[] = [
  { level: 1, diffCount: 5, pointPool: 50 },
  { level: 2, diffCount: 5, pointPool: 50 },
  { level: 3, diffCount: 5, pointPool: 100 },
  { level: 4, diffCount: 5, pointPool: 100 },
  { level: 5, diffCount: 5, pointPool: 150 },
  { level: 6, diffCount: 5, pointPool: 150 },
  { level: 7, diffCount: 7, pointPool: 200 },
];

export const TOTAL_STAGE_SCORE = STAGE_CONFIG.reduce((sum, s) => sum + s.pointPool, 0);

// 이제 환산 대상이 아니라 총점의 실제 만점이다(총점은 항상 0~1953으로 계산된다).
export const DISPLAY_MAX_SCORE = 1953;

export const GLOBAL_TIME_LIMIT_SEC = 180;
export const WRONG_TOUCH_LIMIT_PER_LEVEL = 3;
/**
 * 힌트 사용 한도. **단계당이 아니라 게임 전체 기준이다.**
 *
 * 그래서 카운터(`hintsUsed`)는 `useGameProgress`에 있다 — `GameScreen`은 단계마다
 * 리마운트되므로(page.tsx의 key) 거기 두면 조용히 "단계당 3회"가 되고 설문도 매
 * 단계 뜬다. 단계 하나만 열어보는 테스트는 그 버그를 통과시킨다.
 */
export const HINT_LIMIT_PER_GAME = 3;
export const WRONG_TOUCH_PENALTY = 10;
export const INCOMPLETE_LEVEL_PENALTY = 10;

export const TIME_BONUS_MAX = 600;
/**
 * 이 시간 안에 끝내면 정답률 티어 점수를 깎지 않는다. 넘기면 `TIME_BONUS_STEP_SEC`마다
 * `TIME_BONUS_STEP_VALUE`씩 깎인다.
 *
 * **아래 세 상수와 `GLOBAL_TIME_LIMIT_SEC`은 독립이 아니다.** 최고 티어(600점)가 0에
 * 닿는 시각이 곧 `FAST_THRESHOLD + (600 / STEP_VALUE) * STEP_SEC`이고, 이것이 제한시간과
 * 어긋나면 설계 의도가 깨진다:
 *   - 제한시간보다 **뒤**면 시간을 다 쓰고 초과로 끝나도 시간 보너스가 남는다.
 *     (300s/100s/30점 → 180s/30s/30점으로 줄이려다 실제로 밟은 함정, 2026-08-19)
 *   - 너무 **앞**이면 후반이 통째로 0점 구간이라 시간 압박이 사라진다.
 * 현재 값은 60 + (600/50)*10 = 180으로 제한시간과 정확히 일치한다. **하나를 바꾸면
 * 나머지도 같이 계산할 것.**
 *
 * 60초는 "실력자는 닿고 초심자는 못 닿는" 자리다(2026-08-19, 이란토). 더 짧게 잡으면
 * 대부분의 손님이 감점 구간에서 시작해 보너스가 상이 아니라 벌점이 된다. 출제자는
 * 정답 위치를 알아 30초에도 끝내지만 그 시간을 기준으로 삼지 않는 이유다.
 */
export const TIME_BONUS_FAST_THRESHOLD_SEC = 60;
export const TIME_BONUS_STEP_SEC = 10;
export const TIME_BONUS_STEP_VALUE = 50;

const ACCURACY_TIME_BONUS_TIERS: { minPercent: number; points: number }[] = [
  { minPercent: 91, points: 600 },
  { minPercent: 81, points: 400 },
  { minPercent: 61, points: 200 },
  { minPercent: 41, points: 100 },
  { minPercent: 21, points: 50 },
  { minPercent: 0, points: 0 },
];

export function calcAccuracyTierPoints(accuracyPercent: number): number {
  const found = ACCURACY_TIME_BONUS_TIERS.find((t) => accuracyPercent >= t.minPercent);
  return found ? found.points : 0;
}

export function calcTimeBonus(elapsedSec: number, accuracyPercent: number): number {
  const tierPoints = calcAccuracyTierPoints(accuracyPercent);
  if (elapsedSec <= TIME_BONUS_FAST_THRESHOLD_SEC) {
    return tierPoints;
  }
  const overSec = elapsedSec - TIME_BONUS_FAST_THRESHOLD_SEC;
  const steps = Math.ceil(overSec / TIME_BONUS_STEP_SEC);
  return Math.max(0, tierPoints - TIME_BONUS_STEP_VALUE * steps);
}

// ponytail: 총 문항 수가 바뀌면 콤보 만점 도달 난이도가 달라진다(아래 식이
// streakLength/totalAnswers의 제곱이라, 문항이 적을수록 한 문제의 비중이 커진다).
// 2026-08-07에 출제 개수가 STAGE_CONFIG 고정에서 이미지별 questions_count로
// 바뀌면서 총 문항이 유동적이 됐다 — 대시보드 값이 확정되면 밸런스 재검토 필요.
// 지금 손대지 않는 이유는 조정 기준이 될 실제 설정값이 아직 없어서다.
export const COMBO_BONUS_MAX = 553;

export function calcComboBonusForStreak(streakLength: number, totalAnswers: number): number {
  if (totalAnswers <= 0) return 0;
  const ratio = streakLength / totalAnswers;
  return COMBO_BONUS_MAX * ratio * ratio;
}

export type LevelResult = {
  pointPool: number;
  foundCount: number;
  actualDiffCount: number;
};

export function calcStageScore(levelResults: LevelResult[]): number {
  return levelResults.reduce((sum, r) => {
    if (r.actualDiffCount <= 0) return sum;
    return sum + (r.pointPool / r.actualDiffCount) * r.foundCount;
  }, 0);
}

export function calcWrongTouchPenalty(totalWrongTouches: number): number {
  return totalWrongTouches * WRONG_TOUCH_PENALTY;
}

export function calcIncompleteLevelPenalty(levelsReached: number, totalLevels: number): number {
  const unreached = Math.max(0, totalLevels - levelsReached);
  return unreached * INCOMPLETE_LEVEL_PENALTY;
}

export type ScoreBreakdown = {
  stageScore: number;
  timeBonus: number;
  comboBonus: number;
  wrongTouchPenalty: number;
  incompleteLevelPenalty: number;
  total: number;
};

export type CalcFinalScoreInput = {
  levelResults: LevelResult[];
  elapsedSec: number;
  totalWrongTouches: number;
  comboBankedScore: number;
  comboCurrentStreak: number;
  comboTotalAnswers: number;
  levelsReached: number;
};

export function calcFinalScore(input: CalcFinalScoreInput): ScoreBreakdown {
  const stageScore = calcStageScore(input.levelResults);
  const totalFound = input.levelResults.reduce((sum, r) => sum + r.foundCount, 0);
  const accuracyPercent =
    input.comboTotalAnswers > 0 ? (totalFound / input.comboTotalAnswers) * 100 : 0;
  const timeBonus = calcTimeBonus(input.elapsedSec, accuracyPercent);
  const comboBonus =
    input.comboBankedScore +
    calcComboBonusForStreak(input.comboCurrentStreak, input.comboTotalAnswers);
  const wrongTouchPenalty = calcWrongTouchPenalty(input.totalWrongTouches);
  const incompleteLevelPenalty = calcIncompleteLevelPenalty(input.levelsReached, STAGE_CONFIG.length);
  const rawTotal = stageScore + timeBonus + comboBonus - wrongTouchPenalty - incompleteLevelPenalty;

  return {
    stageScore: Math.round(stageScore),
    timeBonus,
    comboBonus: Math.round(comboBonus),
    wrongTouchPenalty,
    incompleteLevelPenalty,
    total: Math.max(0, Math.round(rawTotal)),
  };
}

export type GukbapTier =
  | "1953 Master"
  | "국밥 단골"
  | "국밥 미식가"
  | "국밥 탐험가"
  | "국밥 입문생";

const GUKBAP_TIER_CUTOFFS: { min: number; tier: GukbapTier }[] = [
  { min: 1953, tier: "1953 Master" },
  { min: 1500, tier: "국밥 단골" },
  { min: 1200, tier: "국밥 미식가" },
  { min: 800, tier: "국밥 탐험가" },
  { min: 0, tier: "국밥 입문생" },
];

// 컷오프 값은 구 2-pass 환산 시절과 동일한 절대 점수를 유지한다(밸런스 테스트 후 조정 예정 —
// docs/superpowers/specs/2026-07-31-native-1953-score-design.md 리스크 항목 참고).
export function calcGukbapTier(totalScore: number): GukbapTier {
  const found = GUKBAP_TIER_CUTOFFS.find((c) => totalScore >= c.min);
  return found ? found.tier : "국밥 입문생";
}

/*
 * `INDICATOR_SLOT_CAP`(9)은 삭제했다(2026-08-13). 문항 인디케이터가 항상 9칸을
 * 그리고 초과분을 `opacity: 0`으로 감추던 시절의 상수인데, 감춘 칸이 자리를 차지한
 * 탓에 보이는 칸이 왼쪽으로 쏠렸다 — `resolveIndicatorCells` 주석 참고.
 * **되살리지 말 것.** 칸 수 고정이 필요해 보이면 `justify-center`가 이미 그 몫을
 * 하고 있는지 먼저 볼 것(중심이 고정이라 좌우로 균등하게 자란다).
 */

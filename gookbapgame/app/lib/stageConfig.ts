export type StageDef = {
  level: number;
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

export const GLOBAL_TIME_LIMIT_SEC = 300;
export const WRONG_TOUCH_LIMIT_PER_LEVEL = 3;
export const WRONG_TOUCH_PENALTY = 10;
export const INCOMPLETE_LEVEL_PENALTY = 10;

export const TIME_BONUS_MAX = 600;
export const TIME_BONUS_FAST_THRESHOLD_SEC = 100;
export const TIME_BONUS_STEP_SEC = 10;
export const TIME_BONUS_STEP_VALUE = 30;

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

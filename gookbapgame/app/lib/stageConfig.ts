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

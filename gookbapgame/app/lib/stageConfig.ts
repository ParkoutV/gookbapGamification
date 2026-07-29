export type StageDef = {
  level: number;
  timeLimitSec: number;
  diffCount: number;
  stageScore: number;
};

export const STAGE_CONFIG: StageDef[] = [
  { level: 1, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 2, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 3, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 4, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 5, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 6, timeLimitSec: 60, diffCount: 5, stageScore: 180 },
  { level: 7, timeLimitSec: 60, diffCount: 7, stageScore: 320 },
  { level: 8, timeLimitSec: 60, diffCount: 7, stageScore: 320 },
  { level: 9, timeLimitSec: 60, diffCount: 7, stageScore: 320 },
];

export const TOTAL_STAGE_SCORE = STAGE_CONFIG.reduce((sum, s) => sum + s.stageScore, 0);
export const COMPLETION_BONUS = 100;
export const MAX_TIME_BONUS = 400;
export const STREAK_BONUS = 53;
// 내부 raw 만점(레벨 수에 따라 변동). 화면 표시는 항상 DISPLAY_MAX_SCORE(1953)로 환산한다.
const RAW_MAX_SCORE = TOTAL_STAGE_SCORE + COMPLETION_BONUS + MAX_TIME_BONUS + STREAK_BONUS;
export const DISPLAY_MAX_SCORE = 1953;

const TOTAL_TIME_BUDGET_SEC = STAGE_CONFIG.reduce((sum, s) => sum + s.timeLimitSec, 0);
// GDD 6.2: "일정 수준 이상의 남은 시간을 확보하면 최대 점수" — 세부 환산은 밸런스 테스트로
// 확정 예정이므로, 이 비율(전체 예산의 60%)을 상수 하나로 분리해 나중에 조정 가능하게 한다.
const TIME_BONUS_TARGET_RATIO = 0.6;

export function calcTimeBonus(remainingTimeByStage: number[]): number {
  const totalRemaining = remainingTimeByStage.reduce((sum, t) => sum + t, 0);
  const target = TOTAL_TIME_BUDGET_SEC * TIME_BONUS_TARGET_RATIO;
  const ratio = target > 0 ? totalRemaining / target : 0;
  return Math.min(MAX_TIME_BONUS, Math.round(MAX_TIME_BONUS * ratio));
}

export function calcStreakBonus(hadWrongTouch: boolean): number {
  return hadWrongTouch ? 0 : STREAK_BONUS;
}

// 내부 계산은 항상 0~100 비율로 표현한다. 1953점 환산은 화면 표시 시점에만 적용한다.
export type ScoreBreakdown = {
  stageScore: number;
  completionBonus: number;
  timeBonus: number;
  streakBonus: number;
  total: number;
};

export function calcFinalScore(
  remainingTimeByStage: number[],
  hadWrongTouch: boolean
): ScoreBreakdown {
  const timeBonus = calcTimeBonus(remainingTimeByStage);
  const streakBonus = calcStreakBonus(hadWrongTouch);
  const rawTotal = TOTAL_STAGE_SCORE + COMPLETION_BONUS + timeBonus + streakBonus;
  const toRatio = (raw: number) => (raw / RAW_MAX_SCORE) * 100;
  return {
    stageScore: toRatio(TOTAL_STAGE_SCORE),
    completionBonus: toRatio(COMPLETION_BONUS),
    timeBonus: toRatio(timeBonus),
    streakBonus: toRatio(streakBonus),
    total: toRatio(rawTotal),
  };
}

// 0~100 비율 점수를 화면 표시용 1953 만점 점수로 반올림 변환한다.
export function toDisplayScore(ratioScore: number): number {
  return Math.round((ratioScore / 100) * DISPLAY_MAX_SCORE);
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

// totalRatio는 calcFinalScore가 반환하는 0~100 비율 total이다.
export function calcGukbapTier(totalRatio: number): GukbapTier {
  const displayScore = toDisplayScore(totalRatio);
  const found = GUKBAP_TIER_CUTOFFS.find((c) => displayScore >= c.min);
  return found ? found.tier : "국밥 입문생";
}

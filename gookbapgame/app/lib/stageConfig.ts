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

import type { Dictionary } from "../types.ts";

export const en: Partial<Dictionary> = {
  "meta.title": "Spot the Difference - Gukbap",
  "meta.description": "A spot-the-difference game set around a bowl of gukbap",

  "common.retry": "Retry",

  "start.title": "Spot the Difference",
  "start.welcome": "Welcome, {nickname}",
  "start.regenerateNicknameAria": "Regenerate nickname",
  "start.playButton": "Start Game",
  "start.myResult": "My Results",
  "start.ranking": "Ranking",

  "preload.preparing": "Preparing gukbap...",
  "preload.sessionError": "Failed to load game data. Please check your network connection.",
  "preload.levelSessionError": "Failed to load game data for stage {level}.",
  "preload.imageError": "Failed to load images. Please check your network connection.",

  "gameResult.title": "Game Result",
  "gameResult.stageScore": "Stage Score",
  "gameResult.completionBonus": "Completion Bonus",
  "gameResult.timeBonus": "Time Bonus",
  "gameResult.streakBonus": "Streak Bonus",
  "gameResult.totalLabel": "Total",
  "gameResult.gukbapPowerLabel": "Gukbap Power: {tier}",
  "gameResult.nextButton": "Next",

  "dailyResult.title": "Today's Result",
  "dailyResult.nicknameLabel": "Today's Nickname",
  "dailyResult.gukbapPowerLabel": "Gukbap Power",
  "dailyResult.finalScoreLabel": "Final Score",
  "dailyResult.restartButton": "Back to Start",

  "gukbapTier.1953Master": "1953 Master",
  "gukbapTier.regular": "Gukbap Regular",
  "gukbapTier.gourmet": "Gukbap Gourmet",
  "gukbapTier.explorer": "Gukbap Explorer",
  "gukbapTier.beginner": "Gukbap Beginner",

  "stageTransition.clearTitle": "Congratulations!!",
  "stageTransition.failTitle": "Unfortunately",
  "stageTransition.clearMessage": "You cleared this stage.",
  "stageTransition.failMessage": "Time's up.",
  "stageTransition.loading": "Loading...",
  "stageTransition.nextButton": "Next",
  "stageTransition.retryButton": "Retry Stage",

  "wheel.title": "Lucky Wheel",
  "wheel.preparing": "Coming soon.",
  "wheel.nextButton": "Next",

  "game.stageProgress": "Stage {current} / {total}",
  "game.timeRemainingLabel": "Time Remaining:",
  "game.secondsUnit": "{seconds}s",
  "game.hintButton": "Hint",
  "game.remainingCount": "Remaining: {found}/{total}",
};

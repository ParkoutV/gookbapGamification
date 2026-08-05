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
  "gameResult.timeBonus": "Time Bonus",
  "gameResult.comboBonus": "Combo Bonus",
  "gameResult.wrongTouchPenalty": "Wrong Touch Penalty",
  "gameResult.incompleteLevelPenalty": "Incomplete Level Penalty",
  "gameResult.totalLabel": "Total",
  "gameResult.gukbapPowerLabel": "Gukbap Power: {tier}",
  "gameResult.nextButton": "Next",

  "dailyResult.title": "Today's Result",
  "dailyResult.nicknameLabel": "Today's Nickname",
  "dailyResult.gukbapPowerLabel": "Gukbap Power",
  "dailyResult.finalScoreLabel": "Final Score",
  "dailyResult.restartButton": "Back to Start",
  "dailyResult.surveyAgainButton": "Take the survey for a coupon",

  "gukbapTier.1953Master": "1953 Master",
  "gukbapTier.regular": "Gukbap Regular",
  "gukbapTier.gourmet": "Gukbap Gourmet",
  "gukbapTier.explorer": "Gukbap Explorer",
  "gukbapTier.beginner": "Gukbap Beginner",


  "surveyIntro.title": "Care to take a quick survey?",
  "surveyIntro.description": "Answer a few questions to spin the coupon wheel.",
  "surveyIntro.participateButton": "Take the survey",
  "surveyIntro.declineLink": "Maybe later",

  "survey.submitButton": "Submit and spin",
  "survey.submitting": "Submitting...",
  "survey.submitError": "Submission failed. Please try again.",
  "survey.requiredNotice": "Please answer every question.",

  "wheel.title": "Wheel of Fortune",
  "wheel.spinning": "Drawing your coupon...",
  "wheel.wonTitle": "You won a coupon!",
  "wheel.missTitle": "No luck this time",
  "wheel.missDescription": "Please try again next time.",
  "wheel.rejected": "The wheel isn't available right now. Please try again later.",
  "wheel.error": "We can't reach the server right now. Please try again later.",
  "start.goToDrawButton": "Go draw your coupon",
  "wheel.nextButton": "Next",

  "coupon.myCouponsButton": "View my coupons",
  "coupon.myCouponsTitle": "My Coupons",
  "coupon.empty": "You don't have any coupons yet.",
  "coupon.usedBadge": "Used",
  "coupon.expiredBadge": "Expired",
  "coupon.expiresAt": "Valid until {date}",
  "coupon.showQrButton": "Show QR code",
  "coupon.closeButton": "Close",
  "coupon.qrUnavailable": "This coupon's QR code can't be displayed.",
  "coupon.issuedButHidden": "Your coupon was issued but can't be shown right now. Check \"My Coupons\" in a moment.",

  "game.stageProgress": "Stage {current} / {total}",
  "game.timeRemainingLabel": "Time Remaining:",
  "game.secondsUnit": "{seconds}s",
  "game.hintButton": "Hint",
  "game.remainingCount": "Remaining: {found}/{total}",
  "game.wrongTouchAria": "{count}/{limit} wrong touches",
  "game.hintTitle": "TODAY'S ORDER",
  "game.hintCloseAria": "Close hint",
};

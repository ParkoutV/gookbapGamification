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

  "term.title": "Privacy Notice",
  "term.body":
    "This game collects the following information to run the game and issue coupons.\n\n" +
    "· An anonymous identification cookie (no name, contact details, or other personally identifying information is collected)\n" +
    "· Game scores and play records\n" +
    "· Your survey answers\n" +
    "· Coupon issuance and redemption history\n\n" +
    "This information is used only to operate the game and issue coupons, and is discarded after the event ends.",
  "term.agreeNotice": "Tapping Confirm means you agree to the above.",
  "term.confirmButton": "Confirm",

  "tutorial.openButton": "How to Play",
  "tutorial.progress": "{current} / {total}",
  "tutorial.prevButton": "Back",
  "tutorial.nextButton": "Next",
  "tutorial.startButton": "Start",
  "tutorial.closeButton": "Close",
  "tutorial.exitAria": "Close tutorial",
  "tutorial.waiting": "Getting ready...",

  "tutorial.what.title": "Spot the Difference",
  "tutorial.what.body":
    "Tap the spots that differ between the two pictures.\n" +
    "There are 7 stages with 5 differences each — except the final stage, which has 7.",

  "tutorial.limit.title": "Time and Chances",
  "tutorial.limit.body":
    "You get 300 seconds for the whole game, not per stage.\n" +
    "Three wrong taps in a stage ends that stage and moves you on.\n" +
    "Each wrong tap costs 10 points.",

  "tutorial.score.title": "Scoring",
  "tutorial.score.body":
    "Finishing faster earns a time bonus.\n" +
    "Consecutive correct taps build a combo bonus.\n" +
    "When the game ends you get a Gukbap rank, then a coupon draw.",

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
  "surveyIntro.description": "Answer a few questions to draw a coupon card.",
  "surveyIntro.participateButton": "Take the survey",
  "surveyIntro.declineLink": "Maybe later",

  "survey.submitButton": "Submit and draw",
  "survey.submitting": "Submitting...",
  "survey.submitError": "Submission failed. Please try again.",
  "survey.requiredNotice": "Please answer the required questions.",
  "survey.optional": "(optional)",

  "wheel.title": "Card of Fortune",
  "wheel.spinning": "Drawing your card...",
  "wheel.flipHint": "Tap the card to flip it",
  "card.saveButton": "Save as image",
  "card.saving": "Saving...",
  "card.saveError": "Couldn't save the image. Please try again later.",

  "sound.muteAria": "Mute sound",
  "sound.unmuteAria": "Unmute sound",

  "wheel.wonTitle": "You won a coupon!",
  "wheel.missTitle": "No luck this time",
  "wheel.missDescription": "Please try again next time.",
  "wheel.rejected": "You can't draw a card right now. Please try again later.",
  "wheel.error": "We can't reach the server right now. Please try again later.",
  "start.goToDrawButton": "Go draw your coupon",
  "start.inviteButton": "Invite a friend",
  "start.invitePromo": "Come play Gookbap Spot-the-Difference with me! There are coupons 🍲",
  "start.inviteCopied": "Invite link copied!",
  "start.inviteFailed": "Couldn't copy. Please try again in a moment.",
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

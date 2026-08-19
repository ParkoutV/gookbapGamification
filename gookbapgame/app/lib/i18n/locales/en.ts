import type { Dictionary } from "../types.ts";

export const en: Partial<Dictionary> = {
  "meta.title": "Spot the Difference 1953 - Gukbap",
  "meta.description": "A spot-the-difference game set around a bowl of gukbap",

  "common.retry": "Retry",

  // Brand name shown in the window title bar (90s desktop concept), not the screen heading.
  //
  // **`Pork`를 다시 넣지 말 것**(2026-08-15 이란토). 공식 영문 표기에 없다 —
  // 영어권에서는 `Gukbap`만으로도 이미 읽기 어려운데 수식어까지 붙으면 더 길어진다.
  //
  // 철자는 문체부 표준 로마자 `Gukbap`이다. 홈페이지 로고에는 `GUKBOB`으로 보이지만
  // 브랜드가 그 표기를 밀고 있는지 불확실하고, **대시보드(`gookbapanalyze`)가 이미
  // `Gukbap`으로 등록하고 있어** 그쪽에 맞춘다. 이 파일의 다른 9곳(`Gukbap Power` 등)과도
  // 철자가 일치한다 — 한쪽만 바꾸면 같은 화면에 두 철자가 뜬다.
  "window.brand": "1953 Brothers Gukbap",

  "start.title": "Spot the Difference 1953",
  "start.welcome": "Welcome, {nickname}",
  "start.regenerateNicknameAria": "Regenerate nickname",
  "start.playButton": "Start Game",
  "start.myResult": "My Results",
  "start.ranking": "Ranking",

  // Ranking screen. Tabs are calendar-based, not rolling windows (2026-08-13).
  "ranking.title": "Ranking",
  "ranking.tab.daily": "Today",
  "ranking.tab.weekly": "7 Days",
  "ranking.tab.monthly": "30 Days",
  "ranking.tab.total": "All Time",
  "ranking.myBestScore": "Your best {score}",
  "ranking.pageIndicator": "{current} / {total}",
  "ranking.prevPageAria": "Previous page",
  "ranking.nextPageAria": "Next page",
  "ranking.rankHeader": "Rank",
  "ranking.nicknameHeader": "Nickname",
  "ranking.scoreHeader": "Score",
  // Must differ from loadFailed - otherwise a DB outage looks like "nobody played".
  "ranking.empty": "No records yet.",
  "ranking.loadFailed": "Could not load the ranking. Please try again shortly.",
  "ranking.loading": "Loading...",
  "ranking.limitNotice": "Showing the top {limit}.",
  "ranking.partialNotice": "Too many records - only part of them were counted.",
  "ranking.closeButton": "Close",

  "legal.title": "Terms and Privacy",
  "legal.tab.terms": "Terms",
  "legal.tab.privacy": "Privacy",
  "couponGuide.title": "Coupon Guide",
  "couponGuide.openButton": "Coupon Guide",
  "legal.agreeNotice": "Tapping Confirm means you agree to the above.",
  "legal.confirmButton": "Confirm",
  "legal.closeAria": "Close",
  "legal.openButton": "Terms & Privacy Policy",
  "legal.originalNotice":
    "The original text of these documents is in Korean; translations are for reference only.",

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
    "You get 180 seconds for the whole game, not per stage.\n" +
    "Three wrong taps in a stage ends that stage and moves you on.\n" +
    "Each wrong tap costs 10 points.",

  "tutorial.score.title": "Scoring",
  "tutorial.score.body":
    "Finishing faster earns a time bonus.\n" +
    "Consecutive correct taps build a combo bonus.\n" +
    "When the game ends you get a Gukbap rank, then a coupon draw.",

  "tutorial.drawLimitDaily": "You can draw up to {count} coupon cards per day.",
  "tutorial.drawLimitDays": "You can draw up to {count} coupon cards every {days} days.",
  "tutorial.drawLimitHours": "You can draw up to {count} coupon cards every {hours} hours.",

  "preload.preparing": "Loading...",
  "preload.sessionError": "Failed to load game data. Please check your network connection.",
  "preload.levelSessionError": "Failed to load game data for stage {level}.",
  "preload.imageError": "Failed to load images. Please check your network connection.",

  // 로딩 화면 읽을거리 — 근거와 주의사항은 ko.ts의 같은 자리 주석 참고.
  "preload.brandLine1": "We welcome you with a warm bowl of gukbap.",
  "preload.brandLine2": "A bowl of pork gukbap, simmered in Busan.",
  "preload.brandLine3": "Simmered with care, served fresh for every guest.",

  "gameResult.title": "Game Result",
  "gameResult.stageScore": "Stage Score",
  "gameResult.timeBonus": "Time Bonus",
  "gameResult.comboBonus": "Combo Bonus",
  "gameResult.wrongTouchPenalty": "Wrong Touch Penalty",
  "gameResult.incompleteLevelPenalty": "Incomplete Level Penalty",
  "gameResult.totalLabel": "Total",
  "gameResult.gukbapPowerLabel": "Gukbap Power: {tier}",
  "gameResult.nextButton": "Next",

  "gameEnd.nextButton": "See Result",

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
  "wheel.waiting": "Please wait a moment",
  "wheel.spinning": "Shuffling the deck",
  "wheel.flipHint": "Tap the card to flip it",
  "card.saveButton": "Save as image",
  "card.saving": "Saving...",
  "card.saveError": "Couldn't save the image. Please try again later.",
  "card.saveRecommendNotice":
    "You can find it again under \"My Coupons\". Records may be lost depending on your browsing environment, so saving the image is recommended.",
  "card.saveRecommendNoticeShort":
    "Records may be lost depending on your browsing environment, so saving the image is recommended.",

  "sound.muteAria": "Mute sound",
  "sound.unmuteAria": "Unmute sound",

  "wheel.wonTitle": "You won a coupon!",
  "wheel.missTitle": "No luck this time",
  "wheel.missDescription": "Please try again next time.",
  "wheel.rejectedHasCoupons": "You already have a coupon.",
  "wheel.rejected": "You can't draw a card right now. Please try again later.",
  "wheel.error": "We can't reach the server right now. Please try again later.",
  "start.goToDrawButton": "Go draw your coupon",
  "start.inviteButton": "Invite a friend",
  "start.drawAvailableNotice": "You have a coupon draw available",
  // 상호와 일반명사 모두 `Gukbap`으로 통일한다(`window.brand` 주석 참고).
  "start.invitePromo": "Who's the true Gukbap Master?\nJoin the <1953 Spot-the-Difference Challenge> and grab a 1953 Brothers Gukbap coupon! 🍲",
  "start.inviteCopied": "Invite link copied!",
  "start.inviteFailed": "Couldn't copy. Please try again in a moment.",
  "wheel.nextButton": "Next",

  "webCoupon.label": "Online store coupon",
  "webCoupon.copyButton": "Copy",
  "webCoupon.copied": "Code copied!",
  "webCoupon.copyFailed": "Copy failed. Please enter the code manually.",
  "webCoupon.grantedTitle": "You got an online store coupon!",
  "webCoupon.grantedBody":
    "Register the code below at the official online store to use it.\nYou can find it again under 'My coupons'.",
  "webCoupon.grantedConfirm": "OK",

  "coupon.myCouponsButton": "View my coupons",
  "coupon.myCouponsTitle": "My Coupons",
  "coupon.empty": "You don't have any coupons yet.",
  "coupon.usedBadge": "Used",
  "coupon.expiredBadge": "Expired",
  "coupon.remainingToday": "Today only",
  /* 영어만 단수형이 필요하다. ko·ja는 조수사가 바뀌지 않으므로 두 키가 같은 문구를
     가리킨다 — 키를 안 만들면 t()가 키 문자열을 그대로 뱉는다. */
  "coupon.remainingDay": "1 day left",
  "coupon.remainingDays": "{days} days left",
  // 구분자는 en dash(–)가 아니라 ASCII 하이픈이다. 픽셀 폰트 서브셋은 로케일 파일에
  // 등장하는 문자로 만들어지므로(docs/build-pixel-font.sh) 비ASCII를 넣으면 폰트를
  // 다시 빌드해야 하고, 빠뜨리면 에러 없이 두부로 보인다.
  "coupon.validPeriod": "Valid {from} - {until}",
  "coupon.expiresAt": "Valid until {date}",
  "coupon.validFrom": "Valid from {date}",
  "coupon.backToAlbum": "Back",
  "coupon.closeButton": "Close",
  "coupon.qrUnavailable": "This coupon's QR code can't be displayed.",
  "coupon.issuedButHidden": "Your coupon was issued but can't be shown right now. Check \"My Coupons\" in a moment.",
  "coupon.wonOnlineDescription":
    "This one is for the online store, so it comes as a code instead of a QR card. You can view and copy it under \"My Coupons\".",

  "game.stageProgress": "Stage {current} / {total}",
  "game.timeRemainingLabel": "Time Remaining:",
  "game.secondsUnit": "{seconds}s",
  "game.hintButton": "Hint",
  "game.remainingCount": "Remaining: {found}/{total}",
  "game.wrongTouchAria": "{count}/{limit} wrong touches",
  "game.hintTitle": "TODAY'S ORDER",
  "game.hintCloseAria": "Close hint",
  "game.hintRemainingAria": "Hints left {remaining}/{limit}",
  "game.hintExhaustedAria": "No hints left",
  // 가려진 줄. **정답을 읽어주면 안 된다** — 화면에서는 가토(░)로 지워지는 자리다.
  "game.hintMaskedAria": "Line faded out",
  "game.hintSurveyTitle": "One quick question",
  "game.hintSurveyCloseAria": "Close without answering",
  "game.hintSurveyNotice": "Answer to see the hint. The clock keeps running.",
};

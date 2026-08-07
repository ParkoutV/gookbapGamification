import type { Dictionary } from "../types.ts";

export const ko: Dictionary = {
  "meta.title": "다른그림찾기 - 국밥",
  "meta.description": "국밥 한 상차림 다른그림찾기 게임",

  "common.retry": "다시 시도",

  "start.title": "다른그림찾기",
  "start.welcome": "{nickname} 님 환영합니다",
  "start.regenerateNicknameAria": "닉네임 다시 생성",
  "start.playButton": "게임 시작",
  "start.myResult": "내 결과",
  "start.ranking": "랭킹",

  "term.title": "개인정보 처리 안내",
  "term.body":
    "이 게임은 원활한 참여와 쿠폰 발급을 위해 아래 정보를 수집합니다.\n\n" +
    "· 익명 식별용 쿠키 (이름·연락처 등 개인을 특정하는 정보는 수집하지 않습니다)\n" +
    "· 게임 점수 및 진행 기록\n" +
    "· 설문에 응답한 내용\n" +
    "· 쿠폰 발급 및 사용 내역\n\n" +
    "수집된 정보는 게임 운영과 쿠폰 지급 목적으로만 사용되며, 행사 종료 후 파기됩니다.",
  "term.agreeNotice": "확인을 누르면 위 내용에 동의한 것으로 간주합니다.",
  "term.confirmButton": "확인",

  "tutorial.openButton": "게임 방법",
  "tutorial.progress": "{current} / {total}",
  "tutorial.prevButton": "이전",
  "tutorial.nextButton": "다음",
  "tutorial.startButton": "시작하기",
  "tutorial.closeButton": "닫기",
  "tutorial.exitAria": "튜토리얼 닫기",
  "tutorial.waiting": "준비 중...",

  "tutorial.what.title": "다른 곳을 찾아라",
  "tutorial.what.body":
    "좌우 두 그림에서 다른 곳을 찾아 터치하세요.\n" +
    "총 7단계, 단계마다 5곳씩 숨어 있습니다. 마지막 7단계만 7곳입니다.",

  "tutorial.limit.title": "시간과 기회",
  "tutorial.limit.body":
    "제한시간은 단계별이 아니라 전체 300초입니다.\n" +
    "한 단계에서 3번 틀리면 그 단계는 거기서 끝나고 다음 단계로 넘어갑니다.\n" +
    "틀릴 때마다 10점이 깎입니다.",

  "tutorial.score.title": "점수 올리기",
  "tutorial.score.body":
    "빨리 끝낼수록 시간 보너스가 붙습니다.\n" +
    "연속으로 맞히면 콤보 보너스가 쌓입니다.\n" +
    "게임이 끝나면 국밥력 등급이 나오고, 쿠폰 뽑기로 이어집니다.",

  "preload.preparing": "국밥 준비 중...",
  "preload.sessionError": "게임 데이터를 불러오는데 실패했습니다. 네트워크 상태를 확인해주세요.",
  "preload.levelSessionError": "{level}단계 게임 데이터를 불러오지 못했습니다.",
  "preload.imageError": "이미지를 불러오는데 실패했습니다. 네트워크 상태를 확인해주세요.",

  "gameResult.title": "게임 결과",
  "gameResult.stageScore": "Stage 점수",
  "gameResult.timeBonus": "시간 보너스",
  "gameResult.comboBonus": "콤보 보너스",
  "gameResult.wrongTouchPenalty": "오답 감점",
  "gameResult.incompleteLevelPenalty": "미완주 감점",
  "gameResult.totalLabel": "총점",
  "gameResult.gukbapPowerLabel": "국밥력: {tier}",
  "gameResult.nextButton": "다음",

  "dailyResult.title": "오늘의 결과",
  "dailyResult.nicknameLabel": "오늘의 별명",
  "dailyResult.gukbapPowerLabel": "국밥력",
  "dailyResult.finalScoreLabel": "최종점수",
  "dailyResult.restartButton": "처음으로",
  "dailyResult.surveyAgainButton": "설문하고 쿠폰 받기",

  "gukbapTier.1953Master": "1953 Master",
  "gukbapTier.regular": "국밥 단골",
  "gukbapTier.gourmet": "국밥 미식가",
  "gukbapTier.explorer": "국밥 탐험가",
  "gukbapTier.beginner": "국밥 입문생",


  "surveyIntro.title": "설문에 참여하시겠어요?",
  "surveyIntro.description": "설문에 답하면 쿠폰 카드를 뽑을 수 있어요.",
  "surveyIntro.participateButton": "참여하기",
  "surveyIntro.declineLink": "다음에 할게요",

  "survey.submitButton": "제출하고 카드 뽑기",
  "survey.submitting": "제출 중...",
  "survey.submitError": "제출에 실패했어요. 다시 시도해주세요.",
  "survey.requiredNotice": "필수 문항에 답해주세요.",
  "survey.optional": "(선택)",

  "wheel.title": "행운의 카드",
  "wheel.spinning": "카드를 뽑는 중...",
  "wheel.flipHint": "카드를 눌러서 뒤집어보세요",
  "wheel.wonTitle": "쿠폰에 당첨됐어요!",
  "wheel.missTitle": "아쉽게도 꽝이에요",
  "wheel.missDescription": "다음 기회에 다시 도전해주세요.",
  "wheel.rejected": "지금은 카드를 뽑을 수 없어요. 잠시 후 다시 시도해주세요.",
  "wheel.error": "지금은 접속이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.",
  "start.goToDrawButton": "쿠폰 뽑으러 가기",
  "wheel.nextButton": "다음",

  "coupon.myCouponsButton": "내 쿠폰 보기",
  "coupon.myCouponsTitle": "내 쿠폰",
  "coupon.empty": "아직 받은 쿠폰이 없어요.",
  "coupon.usedBadge": "사용 완료",
  "coupon.expiredBadge": "기간 만료",
  "coupon.expiresAt": "{date}까지",
  "coupon.showQrButton": "QR 코드 보기",
  "coupon.closeButton": "닫기",
  "coupon.qrUnavailable": "이 쿠폰의 QR 코드를 표시할 수 없어요.",
  "coupon.issuedButHidden": "쿠폰은 발급되었지만 지금 표시할 수 없어요. 잠시 후 '내 쿠폰'에서 확인해주세요.",

  "game.stageProgress": "{current} / {total} 단계",
  "game.timeRemainingLabel": "남은 시간:",
  "game.secondsUnit": "{seconds}초",
  "game.hintButton": "힌트",
  "game.remainingCount": "남은 개수: {found}/{total}",
  "game.wrongTouchAria": "오답 {count}/{limit}",
  "game.hintTitle": "오늘의 주문서",
  "game.hintCloseAria": "힌트 닫기",
};

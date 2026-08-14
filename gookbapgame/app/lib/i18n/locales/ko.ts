import type { Dictionary } from "../types.ts";

export const ko: Dictionary = {
  "meta.title": "1953 눈썰미 대결!",
  "meta.description": "틀린그림찾기의 달인을 찾습니다.",

  "common.retry": "다시 시도",

  // 창 제목 표시줄(90s 데스크톱 컨셉)에 쓰는 브랜드명. 화면 제목과 별개다.
  "window.brand": "1953 형제돼지국밥",

  "start.title": "도전! 1953 틀린그림찾기",
  "start.welcome": "{nickname} 님, 어서오세요",
  "start.regenerateNicknameAria": "닉네임 바꾸기",
  "start.playButton": "게임 시작",
  "start.myResult": "내 결과",
  "start.ranking": "랭킹",

  // 랭킹 화면. 탭은 **롤링 윈도우**다(달력 기준이 아니다) — 주 경계로 자르면
  // 월요일 오전과 매월 1일에 탭이 통째로 비어, 매장 QR로 막 들어온 사람이 빈 랭킹을
  // 본다(2026-08-14, 이란토). 근거와 계산은 `rankingPeriod.ts`에.
  // **이름을 "이번 주/이번 달"로 되돌리려면 그쪽 계산도 함께 되돌릴 것** —
  // 한쪽만 바꾸면 표시와 집계가 조용히 어긋난다.
  "ranking.title": "랭킹",
  "ranking.tab.daily": "오늘",
  "ranking.tab.weekly": "최근 7일",
  "ranking.tab.monthly": "최근 30일",
  "ranking.tab.total": "전체",
  /* 내 최고점. **순위는 붙이지 않는다** — ranking_view에 participant_id가 없어서
     목록에서 내 줄을 확실히 특정할 수 없다(2026-08-13, 이란토). */
  "ranking.myBestScore": "내 최고점 {score}",
  // 페이지네이션. 한 페이지 10위, 최대 20위까지.
  "ranking.pageIndicator": "{current} / {total}",
  "ranking.prevPageAria": "이전 페이지",
  "ranking.nextPageAria": "다음 페이지",
  "ranking.rankHeader": "순위",
  "ranking.nicknameHeader": "닉네임",
  "ranking.scoreHeader": "점수",
  // 기록이 0건인 정상 상태. 조회 실패와 **반드시 다른 문구여야 한다** — 같은 문구를
  // 쓰면 DB 장애가 "오늘 아무도 안 함"으로 위장된다(설문 조회에서 얻은 교훈).
  "ranking.empty": "아직 기록이 없어요.",
  "ranking.loadFailed": "랭킹을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
  "ranking.loading": "불러오는 중...",
  // 표시 상한을 넘겼다는 안내. 조용히 잘라내면 "전체가 이만큼"으로 읽힌다.
  "ranking.limitNotice": "상위 {limit}위까지 보여줍니다.",
  // 서버 응답 자체가 잘린 경우(PostgREST 행 상한). 위 표시 상한과 다른 사정이다.
  "ranking.partialNotice": "기록이 많아 일부만 집계했습니다.",
  "ranking.closeButton": "닫기",

  /* 법률 문서 창(`LegalNotice`). **본문은 여기 없다** — `app/lib/legalDocs.ts`에
     ko/en 2종으로 따로 있다(첫 로드 전송량 + 번역 정책, 그 파일 주석 참고).
     여기 있는 것은 탭 이름·버튼 같은 UI 껍데기뿐이고 이쪽은 로케일 4종을 따른다. */
  "legal.title": "이용약관 및 개인정보 처리 안내",
  "legal.tab.terms": "이용약관",
  "legal.tab.privacy": "개인정보",
  /* 쿠폰 이용안내는 약관 창의 탭이 아니라 별도 팝업이다(`CouponGuideNotice`) —
     뽑기 화면과 보관함에서 연다. */
  "couponGuide.title": "쿠폰 이용안내",
  "couponGuide.openButton": "쿠폰 이용안내",
  "legal.agreeNotice": "확인을 누르면 위 내용에 동의한 것으로 간주합니다.",
  "legal.confirmButton": "확인",
  "legal.closeAria": "닫기",
  "legal.openButton": "이용약관·개인정보처리방침",
  // ko 화면에서는 원문이 한국어인 것이 자명하므로 쓰이지 않는다(`LegalNotice`가 건너뛴다).
  "legal.originalNotice": "본 문서의 원문은 한국어이며, 번역본은 참고용입니다.",

  "tutorial.openButton": "게임 방법",
  "tutorial.progress": "{current} / {total}",
  "tutorial.prevButton": "이전",
  "tutorial.nextButton": "다음",
  "tutorial.startButton": "시작하기",
  "tutorial.closeButton": "닫기",
  "tutorial.exitAria": "튜토리얼 닫기",
  "tutorial.waiting": "준비 중...",

  "tutorial.what.title": "다른 점을 찾아보세요",
  "tutorial.what.body":
    "두 그림을 잘 보세요. 서로 다른 점이 분명 있습니다.\n" +
    "레벨 1부터 7까지 파이팅입니다!",

  "tutorial.limit.title": "제한 시간과 오답",
  "tutorial.limit.body":
    "주어진 시간은 단 '5분'!\n" +
    "그림에서 정답이 아닌 곳을 누르면 오답 처리되며, 레벨당 3번의 오답 기회가 주어집니다.\n" +
    "틀릴 때마다 10점이 줄어들고, 오답 기회를 소진하면 다음 레벨로 넘어갑니다.",

  "tutorial.score.title": "점수 발표와 쿠폰 확인",
  "tutorial.score.body":
    "빨리 끝낼수록 시간 보너스가 붙습니다.\n" +
    "연속으로 맞히면 콤보 보너스 처리됩니다.\n" +
    "게임이 끝나면 국밥력 등급이 나오고, 쿠폰을 확인하실 수 있습니다!",

  "preload.preparing": "게임 시작 중...",
  "preload.sessionError": "게임 데이터를 불러오는데 실패했습니다. 접속이 원활하지 않습니다.",
  "preload.levelSessionError": "{level}단계 게임 데이터를 불러오지 못했습니다.",
  "preload.imageError": "이미지를 불러오는데 실패했습니다. 접속이 원활하지 않습니다.",

  "gameResult.title": "게임 결과",
  "gameResult.stageScore": "Stage 점수",
  "gameResult.timeBonus": "시간 보너스",
  "gameResult.comboBonus": "콤보 보너스",
  "gameResult.wrongTouchPenalty": "오답 감점",
  "gameResult.incompleteLevelPenalty": "미완주 감점",
  "gameResult.totalLabel": "총점",
  "gameResult.gukbapPowerLabel": "국밥력: {tier}",
  "gameResult.nextButton": "다음",

  // 시작·종료 연출. 세 문자열은 픽셀 폰트로 크게 뜨는 로고성 문구라 세 로케일이
  // 같은 라틴 대문자를 쓴다 — 나중에 「クリア」처럼 갈릴 여지를 남겨 세 파일에 다 넣는다.
  "gameEnd.nextButton": "결과 발표!",

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
  "surveyIntro.description": "감사의 뜻으로 작은 선물을 준비했습니다.",
  "surveyIntro.participateButton": "참여하기",
  "surveyIntro.declineLink": "다음에 할게요",

  "survey.submitButton": "제출하고 카드 뽑기",
  "survey.submitting": "제출 중...",
  "survey.submitError": "제출에 실패했어요. 다시 시도해주세요.",
  "survey.requiredNotice": "필수 문항에 답해주세요.",
  "survey.optional": "(선택)",

  "wheel.title": "행운의 카드",
  // 서버 응답을 기다리는 1단계. 결과를 아직 모르므로 중립적이어야 한다 —
  // 거절당할 사람에게 "카드를 섞고 있어요"가 뜨면 괜히 기대하게 된다.
  "wheel.waiting": "잠시만 기다려 주세요",
  // 쿠폰이 실제로 발급된 뒤에만 뜨는 2단계.
  "wheel.spinning": "카드를 섞고 있어요",
  "wheel.flipHint": "카드를 눌러서 뒤집어보세요",
  "card.saveButton": "이미지로 저장",
  "card.saving": "저장하는 중...",
  "card.saveError": "저장에 실패했어요. 잠시 후 다시 시도해주세요.",
  /* 쿠폰 유실 주의문(2026-08-13, 이란토). '다음'을 처음부터 띄우면서 함께 넣었다.
     participant_id는 로그인이 아닌 느슨한 식별자라 기기를 바꾸거나 브라우저 데이터를
     지우면 쿠폰을 되찾을 수 없다 — **구체적인 기술 용어는 쓰지 않는다**(이란토 지시:
     편의상 생략하여 이해를 돕는다). '내 쿠폰'에서 다시 볼 수 있다는 사실만 알리고
     그 조건을 숨기면, 나중에 못 찾는 사람이 생겼을 때 알릴 의무를 다하지 않은 셈이 된다. */
  "card.saveRecommendNotice":
    "'내 쿠폰'에서 다시 볼 수 있어요. 다만 접속 환경에 따라 기록이 사라질 수 있으니 이미지로 저장해 두시는 것을 권합니다.",
  /* 앨범용. 이미 "다시 볼 수 있는 곳"에 있으므로 그 문장은 빼고 유실 주의만 남긴다. */
  "card.saveRecommendNoticeShort":
    "접속 환경에 따라 기록이 사라질 수 있으니 이미지로 저장해 두시는 것을 권합니다.",

  "sound.muteAria": "소리 끄기",
  "sound.unmuteAria": "소리 켜기",

  "wheel.wonTitle": "쿠폰에 당첨됐어요!",
  "wheel.missTitle": "아쉽게도 꽝이에요",
  "wheel.missDescription": "다음 기회에 다시 도전해주세요.",
  "wheel.rejected": "지금은 카드를 뽑을 수 없어요. 잠시 후 다시 시도해주세요.",
  "wheel.error": "지금은 접속이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.",
  "start.goToDrawButton": "쿠폰 뽑으러 가기",
  "start.inviteButton": "친구 초대하기",
  /* '내 쿠폰' 버튼의 red-dot을 스크린리더에 알리는 문장. 점은 aria-hidden이라
     이것이 없으면 뽑기 기회가 남은 것을 전혀 알 수 없다. */
  "start.drawAvailableNotice": "뽑을 수 있는 쿠폰이 있어요",
  "start.invitePromo": "국밥 마스터의 주인공은 누구?\n<도전! 1953 틀린그림찾기>에 도전하고, 1953 형제돼지국밥 쿠폰도 받자! 🍲",
  "start.inviteCopied": "초대 링크를 복사했어요!",
  "start.inviteFailed": "복사에 실패했어요. 잠시 후 다시 시도해주세요.",
  "wheel.nextButton": "다음",

  /* 온라인몰 전용 쿠폰(2026-08-13). 매장 QR 쿠폰과 달리 평문 코드를 복사해
     공식 온라인몰에 등록하는 것이라, 문구가 '어디서 쓰는지'를 분명히 해야 한다 —
     매장에서 이 코드를 내밀면 스캐너가 읽지 못한다. */
  /* **기본 문구다 — 평소에는 화면에 뜨지 않는다.** 티켓 이름은 DB
     (`web_coupon_settings.title`)에서 오고 운영자가 대시보드에서 적는다
     ("1원 할인 쿠폰" 등). 이 키는 그 조회가 실패했거나 값이 비었을 때만 쓰인다 —
     혜택 내용을 여기 적지 말 것. */
  "webCoupon.label": "온라인몰 쿠폰",
  "webCoupon.copyButton": "복사",
  "webCoupon.copied": "코드를 복사했어요!",
  "webCoupon.copyFailed": "복사에 실패했어요. 코드를 직접 입력해주세요.",
  // 설문 직후 발급 안내 팝업.
  "webCoupon.grantedTitle": "온라인몰 쿠폰을 받았어요!",
  "webCoupon.grantedBody":
    "공식 온라인몰에서 아래 코드를 등록하면 사용할 수 있어요.\n'내 쿠폰'에서 다시 확인할 수 있습니다.",
  "webCoupon.grantedConfirm": "확인",

  "coupon.myCouponsButton": "내 쿠폰 보기",
  "coupon.myCouponsTitle": "내 쿠폰",
  "coupon.empty": "아직 받은 쿠폰이 없어요.",
  "coupon.usedBadge": "사용 완료",
  "coupon.expiredBadge": "기간 만료",
  /* 0일은 "0일 남음"이 아니라 "오늘까지"다 — 숫자 0은 이미 끝났다는 뜻으로 읽힌다. */
  "coupon.remainingToday": "오늘까지",
  /* 한국어는 단수·복수가 갈리지 않지만 en이 갈리므로 키를 둘 다 둔다(en.ts 참고). */
  "coupon.remainingDay": "1일 남음",
  "coupon.remainingDays": "{days}일 남음",
  // 쿠폰 사용 가능 기간. 시작일·사용기한이 모두 있으면 validPeriod 한 줄,
  // 한쪽만 있으면 아래 둘 중 하나로 떨어진다(`couponDates.ts`).
  // 발급일은 표시하지 않는다 — 매장에서 쓰지 않아 2026-08-13에 뺐다.
  "coupon.validPeriod": "{from} ~ {until}",
  "coupon.expiresAt": "{date}까지",
  "coupon.validFrom": "{date}부터",
  // 앨범(격자)으로 돌아가기. 'QR 코드 보기'는 앨범 개편으로 사라졌다 —
  // 카드 앞면에 QR이 이미 있어서 따로 펼칠 것이 없다(2026-08-13).
  "coupon.backToAlbum": "목록으로",
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
  "game.hintRemainingAria": "남은 힌트 {remaining}/{limit}",
  "game.hintExhaustedAria": "힌트를 모두 사용했어요",
  // 가려진 줄. **정답을 읽어주면 안 된다** — 화면에서는 가토(░)로 지워지는 자리다.
  "game.hintMaskedAria": "인쇄가 지워진 줄",
  "game.hintSurveyTitle": "설문 한 가지",
  /* 설문 닫기는 힌트 닫기와 결과가 다르다 — 이쪽은 답하지 않고 나가는 것이라
     힌트 횟수가 줄지 않는다. 같은 문구를 쓰면 스크린리더 사용자가 그 차이를
     알 수 없다. */
  "game.hintSurveyCloseAria": "답하지 않고 닫기",
  "game.hintSurveyNotice": "답하면 힌트를 볼 수 있어요. 그동안에도 시간은 흘러갑니다.",
};

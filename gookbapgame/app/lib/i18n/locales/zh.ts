import type { Dictionary } from "../types.ts";

// 간체 중국어(2026-08-13 추가). 부산을 찾는 중화권 관광객이 가장 많다는 회사 피드백에서
// 나왔고, 번체는 따로 두지 않는다 — `detectLocale`이 zh-TW·zh-HK도 여기로 모은다.
//
// 한국 음식 이름은 중국어에 대응 어휘가 없으면 음차한다(국밥 → 汤饭, 돼지국밥 → 猪肉汤饭).
// 汤饭은 중화권에서 한식 국밥을 가리킬 때 실제로 쓰이는 표기다.
// 값이 없는 키는 en → ko 순으로 폴백된다.
//
// **초벌 번역이다 — 이란토 검수 대기 중**(2026-08-13). 원어민 감수 전이므로
// 문구가 어색할 수 있다. 특히 `start.invitePromo`(홍보 문구)는 톤이 걸린 자리라
// 그대로 배포하지 말 것.
//
// **법률 본문은 여기 없다**(2026-08-14). 약관·개인정보처리방침·쿠폰안내는
// `app/lib/legalDocs.ts`에 ko/en 2종만 두고, zh 사용자는 en 본문을 본다 —
// 개인정보보호법 조문 인용이 들어간 문서라 오역이 곧 법적 리스크다.
// 여기 있는 `legal.*`는 탭 이름·버튼 같은 UI 껍데기뿐이다.
export const zh: Partial<Dictionary> = {
  "meta.title": "挑战！1953 找不同 - 汤饭",
  "meta.description": "以汤饭套餐为主题的找不同游戏",

  "common.retry": "重试",

  // 창 제목 표시줄(90s 데스크톱 컨셉)에 쓰는 브랜드명. 화면 제목과 별개다.
  "window.brand": "1953 兄弟猪肉汤饭",

  "start.title": "挑战！1953 找不同",
  "start.welcome": "欢迎您，{nickname}",
  "start.regenerateNicknameAria": "重新生成昵称",
  "start.playButton": "开始游戏",
  "start.myResult": "我的成绩",
  "start.ranking": "排行榜",

  // 랭킹 화면. 탭은 달력 기준이다(롤링 윈도우가 아니다, 2026-08-13).
  "ranking.title": "排行榜",
  "ranking.tab.daily": "今天",
  "ranking.tab.weekly": "最近7天",
  "ranking.tab.monthly": "最近30天",
  "ranking.tab.total": "总榜",
  "ranking.myBestScore": "我的最高分 {score}",
  "ranking.pageIndicator": "{current} / {total}",
  "ranking.prevPageAria": "上一页",
  "ranking.nextPageAria": "下一页",
  "ranking.rankHeader": "排名",
  "ranking.nicknameHeader": "昵称",
  "ranking.scoreHeader": "分数",
  // 조회 실패와 반드시 다른 문구여야 한다 — 같은 문구를 쓰면 DB 장애가
  // "오늘 아무도 안 함"으로 위장된다.
  "ranking.empty": "还没有任何记录。",
  "ranking.loadFailed": "无法加载排行榜，请稍后再试。",
  "ranking.loading": "加载中...",
  "ranking.limitNotice": "仅显示前 {limit} 名。",
  "ranking.partialNotice": "记录较多，仅统计了一部分。",
  "ranking.closeButton": "关闭",

  "legal.title": "使用条款及个人信息处理须知",
  "legal.tab.terms": "使用条款",
  "legal.tab.privacy": "个人信息",
  "couponGuide.title": "优惠券使用须知",
  "couponGuide.openButton": "优惠券使用须知",
  "legal.agreeNotice": "点击「确认」即视为您同意以上内容。",
  "legal.confirmButton": "确认",
  "legal.closeAria": "关闭",
  "legal.openButton": "使用条款·隐私政策",
  "legal.originalNotice": "本文件原文为韩语，译文仅供参考，正文以英文显示。",

  "tutorial.openButton": "游戏玩法",
  "tutorial.progress": "{current} / {total}",
  "tutorial.prevButton": "上一步",
  "tutorial.nextButton": "下一步",
  "tutorial.startButton": "开始",
  "tutorial.closeButton": "关闭",
  "tutorial.exitAria": "关闭教程",
  "tutorial.waiting": "准备中...",

  "tutorial.what.title": "找出不同之处",
  "tutorial.what.body":
    "请在左右两幅图中找出不同的地方并点击。\n" +
    "共 7 个关卡，每关藏有 5 处不同。仅最后的第 7 关有 7 处。",

  "tutorial.limit.title": "时间与机会",
  "tutorial.limit.body":
    "限时不是按关卡计算，而是全程共 180 秒。\n" +
    "在同一关中错 3 次，该关即结束并进入下一关。\n" +
    "每错一次扣 10 分。",

  "tutorial.score.title": "提高分数",
  "tutorial.score.body":
    "越早完成，时间奖励越高。\n" +
    "连续答对可累积连击奖励。\n" +
    "游戏结束后会显示汤饭力等级，并进入优惠券抽取环节。",

  "tutorial.drawLimitDaily": "优惠券抽卡每天最多可参与{count}次。",
  "tutorial.drawLimitDays": "优惠券抽卡每{days}天最多可参与{count}次。",
  "tutorial.drawLimitHours": "优惠券抽卡每{hours}小时最多可参与{count}次。",

  "preload.preparing": "正在启动游戏...",
  "preload.sessionError": "游戏数据加载失败，请检查网络状况。",
  "preload.levelSessionError": "无法加载第 {level} 关的游戏数据。",
  "preload.imageError": "图片加载失败，请检查网络状况。",

  /* 로딩 화면 읽을거리 — 근거와 주의사항은 ko.ts의 같은 자리 주석 참고.
     zh는 초벌 번역이라 수사 없이 평서문으로만 썼다(AGENTS.md의 zh 절).
     국밥은 다른 키와 같이 `汤饭`/`猪肉汤饭` 표기를 따른다. */
  "preload.brandLine1": "用一碗热腾腾的汤饭迎接您。",
  "preload.brandLine2": "在釜山熬煮的一碗猪肉汤饭。",
  "preload.brandLine3": "今天也用心熬煮，等待每一位客人。",

  "gameResult.title": "游戏结果",
  "gameResult.stageScore": "关卡得分",
  "gameResult.timeBonus": "时间奖励",
  "gameResult.comboBonus": "连击奖励",
  "gameResult.wrongTouchPenalty": "错误扣分",
  "gameResult.incompleteLevelPenalty": "未通关扣分",
  "gameResult.totalLabel": "总分",
  "gameResult.gukbapPowerLabel": "汤饭力：{tier}",
  "gameResult.nextButton": "下一步",

  "gameEnd.nextButton": "查看结果",

  "dailyResult.title": "今日结果",
  "dailyResult.nicknameLabel": "今日昵称",
  "dailyResult.gukbapPowerLabel": "汤饭力",
  "dailyResult.finalScoreLabel": "最终得分",
  "dailyResult.restartButton": "回到首页",
  "dailyResult.surveyAgainButton": "填问卷领优惠券",

  "gukbapTier.1953Master": "1953 Master",
  "gukbapTier.regular": "汤饭常客",
  "gukbapTier.gourmet": "汤饭美食家",
  "gukbapTier.explorer": "汤饭探索者",
  "gukbapTier.beginner": "汤饭新手",

  "surveyIntro.title": "要参与问卷调查吗？",
  "surveyIntro.description": "填写问卷即可抽取优惠券卡片。",
  "surveyIntro.participateButton": "参与",
  "surveyIntro.declineLink": "下次再说",

  "survey.submitButton": "提交并抽卡",
  "survey.submitting": "提交中...",
  "survey.submitError": "提交失败，请重试。",
  "survey.requiredNotice": "请回答必答题。",
  "survey.optional": "（选填）",

  "wheel.title": "幸运卡片",
  // 서버 응답을 기다리는 1단계. 결과를 아직 모르므로 중립적이어야 한다 —
  // 거절당할 사람에게 "카드를 섞고 있어요"가 뜨면 괜히 기대하게 된다.
  "wheel.waiting": "请稍候",
  // 쿠폰이 실제로 발급된 뒤에만 뜨는 2단계.
  "wheel.spinning": "正在洗牌",
  "wheel.flipHint": "点击卡片翻开",
  "card.saveButton": "保存为图片",
  "card.saving": "保存中...",
  "card.saveError": "保存失败，请稍后再试。",
  /* 쿠폰 유실 주의문. 구체적인 기술 용어는 쓰지 않는다(이란토 지시) — ko.ts 참고. */
  "card.saveRecommendNotice":
    "您可以在「我的优惠券」中再次查看。但记录可能会因使用环境而丢失，建议保存为图片。",
  /* 앨범용. 이미 "다시 볼 수 있는 곳"에 있으므로 그 문장은 빼고 유실 주의만 남긴다. */
  "card.saveRecommendNoticeShort": "记录可能会因使用环境而丢失，建议保存为图片。",

  "sound.muteAria": "关闭声音",
  "sound.unmuteAria": "开启声音",

  "wheel.wonTitle": "恭喜您中奖了！",
  "wheel.missTitle": "很遗憾，未中奖",
  "wheel.missDescription": "请下次再来挑战。",
  "wheel.rejectedHasCoupons": "您已经领取过优惠券。",
  "wheel.rejected": "目前无法抽卡，请稍后再试。",
  "wheel.error": "目前连接不畅，请稍后再试。",
  "start.goToDrawButton": "去抽优惠券",
  "start.inviteButton": "邀请好友",
  /* '내 쿠폰' 버튼의 red-dot을 스크린리더에 알리는 문장. 점은 aria-hidden이라
     이것이 없으면 뽑기 기회가 남은 것을 전혀 알 수 없다. */
  "start.drawAvailableNotice": "还有可以抽取的优惠券",
  "start.invitePromo": "谁是汤饭大师？\n参加〈1953 眼力大比拼〉，还能领取 1953 兄弟猪肉汤饭优惠券！🍲",
  "start.inviteCopied": "已复制邀请链接！",
  "start.inviteFailed": "复制失败，请稍后再试。",
  "wheel.nextButton": "下一步",

  "webCoupon.label": "网上商城优惠券",
  "webCoupon.copyButton": "复制",
  "webCoupon.copied": "已复制优惠码！",
  "webCoupon.copyFailed": "复制失败，请手动输入优惠码。",
  "webCoupon.grantedTitle": "您获得了网上商城优惠券！",
  "webCoupon.grantedBody":
    "在官方网上商城登记下方的优惠码即可使用。\n您可以在「我的优惠券」中再次查看。",
  "webCoupon.grantedConfirm": "确认",

  "coupon.myCouponsButton": "查看我的优惠券",
  "coupon.myCouponsTitle": "我的优惠券",
  "coupon.empty": "还没有领取过优惠券。",
  "coupon.usedBadge": "已使用",
  "coupon.expiredBadge": "已过期",
  /* 0일은 "0일 남음"이 아니라 "오늘까지"다 — 숫자 0은 이미 끝났다는 뜻으로 읽힌다. */
  "coupon.remainingToday": "仅限今日",
  /* 중국어는 단수·복수가 갈리지 않지만 en이 갈리므로 키를 둘 다 둔다(en.ts 참고). */
  "coupon.remainingDay": "剩 1 天",
  "coupon.remainingDays": "剩 {days} 天",
  // 쿠폰 사용 가능 기간. 발급일은 표시하지 않는다 — 매장에서 쓰지 않아 2026-08-13에 뺐다.
  "coupon.validPeriod": "{from} ~ {until}",
  "coupon.expiresAt": "至 {date}",
  "coupon.validFrom": "自 {date} 起",
  "coupon.backToAlbum": "返回列表",
  "coupon.closeButton": "关闭",
  "coupon.qrUnavailable": "无法显示此优惠券的二维码。",
  "coupon.issuedButHidden": "优惠券已发放，但目前无法显示。请稍后在「我的优惠券」中查看。",
  "coupon.wonOnlineDescription":
    "这是网上商城专用的优惠券，因此以优惠码形式发放，而非二维码卡片。您可以在「我的优惠券」中查看并复制优惠码。",

  "game.stageProgress": "第 {current} / {total} 关",
  "game.timeRemainingLabel": "剩余时间：",
  "game.secondsUnit": "{seconds} 秒",
  "game.hintButton": "提示",
  "game.remainingCount": "剩余：{found}/{total}",
  "game.wrongTouchAria": "错误 {count}/{limit}",
  "game.hintTitle": "今日订单",
  "game.hintCloseAria": "关闭提示",
  "game.hintRemainingAria": "剩余提示 {remaining}/{limit}",
  "game.hintExhaustedAria": "提示已全部用完",
  // 가려진 줄. **정답을 읽어주면 안 된다** — 화면에서는 가토(░)로 지워지는 자리다.
  "game.hintMaskedAria": "印刷模糊的一行",
  "game.hintSurveyTitle": "一道问卷题",
  /* 설문 닫기는 힌트 닫기와 결과가 다르다 — 이쪽은 답하지 않고 나가는 것이라
     힌트 횟수가 줄지 않는다. */
  "game.hintSurveyCloseAria": "不回答并关闭",
  "game.hintSurveyNotice": "回答后即可查看提示。期间时间仍在流逝。",
};

import type { Dictionary } from "../types.ts";

// 한국 음식 이름은 일본어에 대응 어휘가 없으면 그대로 가타카나로 음차한다
// (국밥 → クッパ, 돼지국밥 → テジクッパ). 값이 없는 키는 en → ko 순으로 폴백된다.
export const ja: Partial<Dictionary> = {
  "meta.title": "挑戦！1953 間違い探し - クッパ",
  "meta.description": "クッパのお膳で遊ぶ間違い探しゲーム",

  "common.retry": "再試行",

  // ウィンドウのタイトルバー（90s デスクトップ風）に表示するブランド名。画面見出しとは別。
  //
  // `豚クッパ`가 아니라 `テジクッパ`다(2026-08-15 이란토 확인, 공식 표기).
  // 위 주석의 음차 규칙(돼지국밥 → テジクッパ)과도 일치한다 — 예전에는 상호에만
  // `豚`을 써서 규칙과 어긋나 있었다.
  "window.brand": "1953 兄弟テジクッパ",

  "start.title": "挑戦！1953 間違い探し",
  "start.welcome": "{nickname} さん、ようこそ",
  "start.regenerateNicknameAria": "ニックネームを再生成",
  "start.playButton": "ゲーム開始",
  "start.myResult": "自分の結果",
  "start.ranking": "ランキング",

  // ランキング画面。タブは暦基準(ローリングウィンドウではない、2026-08-13)。
  "ranking.title": "ランキング",
  "ranking.tab.daily": "今日",
  "ranking.tab.weekly": "直近7日",
  "ranking.tab.monthly": "直近30日",
  "ranking.tab.total": "全体",
  "ranking.myBestScore": "自己最高 {score}",
  "ranking.pageIndicator": "{current} / {total}",
  "ranking.prevPageAria": "前のページ",
  "ranking.nextPageAria": "次のページ",
  "ranking.rankHeader": "順位",
  "ranking.nicknameHeader": "ニックネーム",
  "ranking.scoreHeader": "スコア",
  // 読み込み失敗と必ず違う文言にする。同じにするとDB障害が「誰もプレイしていない」に化ける。
  "ranking.empty": "まだ記録がありません。",
  "ranking.loadFailed": "ランキングを読み込めませんでした。しばらくしてからもう一度お試しください。",
  "ranking.loading": "読み込み中...",
  "ranking.limitNotice": "上位{limit}位まで表示します。",
  "ranking.partialNotice": "記録が多いため一部のみ集計しました。",
  "ranking.closeButton": "閉じる",

  "legal.title": "利用規約およびプライバシーポリシー",
  "legal.tab.terms": "利用規約",
  "legal.tab.privacy": "個人情報",
  "couponGuide.title": "クーポンのご利用案内",
  "couponGuide.openButton": "クーポンのご利用案内",
  "legal.agreeNotice": "「確認」を押すと、上記の内容に同意したものとみなします。",
  "legal.confirmButton": "確認",
  "legal.closeAria": "閉じる",
  "legal.openButton": "利用規約・プライバシーポリシー",
  "legal.originalNotice": "本文書の原文は韓国語です。翻訳は参考用であり、本文は英語で表示されます。",

  "tutorial.openButton": "遊び方",
  "tutorial.progress": "{current} / {total}",
  "tutorial.prevButton": "戻る",
  "tutorial.nextButton": "次へ",
  "tutorial.startButton": "はじめる",
  "tutorial.closeButton": "閉じる",
  "tutorial.exitAria": "チュートリアルを閉じる",
  "tutorial.waiting": "準備中...",

  "tutorial.what.title": "違うところを探そう",
  "tutorial.what.body":
    "左右の絵で違うところを見つけてタッチしてください。\n" +
    "全7ステージ、各ステージに5か所ずつ隠れています。最後の7ステージだけ7か所です。",

  "tutorial.limit.title": "制限時間とチャンス",
  "tutorial.limit.body":
    "制限時間はステージごとではなく、全体で180秒です。\n" +
    "1つのステージで3回間違えると、そのステージは終了して次に進みます。\n" +
    "間違えるたびに10点減点されます。",

  "tutorial.score.title": "スコアを伸ばす",
  "tutorial.score.body":
    "早く終えるほどタイムボーナスが付きます。\n" +
    "連続で正解するとコンボボーナスが加算されます。\n" +
    "ゲーム終了後はクッパ力ランクが出て、クーポン抽選に進みます。",

  "tutorial.drawLimitDaily": "クーポン抽選は1日{count}回まで参加できます。",
  "tutorial.drawLimitDays": "クーポン抽選は{days}日間で{count}回まで参加できます。",
  "tutorial.drawLimitHours": "クーポン抽選は{hours}時間で{count}回まで参加できます。",

  "preload.preparing": "ゲームを起動中...",
  "preload.sessionError": "ゲームデータの読み込みに失敗しました。ネットワーク状況をご確認ください。",
  "preload.levelSessionError": "ステージ{level}のゲームデータを読み込めませんでした。",
  "preload.imageError": "画像の読み込みに失敗しました。ネットワーク状況をご確認ください。",

  // 로딩 화면 읽을거리 — 근거와 주의사항은 ko.ts의 같은 자리 주석 참고.
  "preload.brandLine1": "あたたかいクッパ一杯で、お客様をお迎えします。",
  "preload.brandLine2": "釜山で煮込む、テジクッパ一杯。",
  "preload.brandLine3": "今日も心をこめて煮込み、お客様をお待ちしています。",

  "gameResult.title": "ゲーム結果",
  "gameResult.stageScore": "ステージ得点",
  "gameResult.timeBonus": "タイムボーナス",
  "gameResult.comboBonus": "コンボボーナス",
  "gameResult.wrongTouchPenalty": "誤タッチ減点",
  "gameResult.incompleteLevelPenalty": "未クリア減点",
  "gameResult.totalLabel": "合計",
  "gameResult.gukbapPowerLabel": "クッパワー: {tier}",
  "gameResult.nextButton": "次へ",

  "gameEnd.nextButton": "結果を見る",

  "dailyResult.title": "今日の結果",
  "dailyResult.nicknameLabel": "今日のニックネーム",
  "dailyResult.gukbapPowerLabel": "クッパワー",
  "dailyResult.finalScoreLabel": "最終得点",
  "dailyResult.restartButton": "最初に戻る",
  "dailyResult.surveyAgainButton": "アンケートに答えてクーポンをもらう",

  "gukbapTier.1953Master": "1953 Master",
  "gukbapTier.regular": "クッパの常連",
  "gukbapTier.gourmet": "クッパ美食家",
  "gukbapTier.explorer": "クッパ探検家",
  "gukbapTier.beginner": "クッパ初心者",


  "surveyIntro.title": "アンケートにご協力いただけますか？",
  "surveyIntro.description": "アンケートに答えるとクーポンカードを引けます。",
  "surveyIntro.participateButton": "参加する",
  "surveyIntro.declineLink": "また今度にします",

  "survey.submitButton": "送信してカードを引く",
  "survey.submitting": "送信中...",
  "survey.submitError": "送信に失敗しました。もう一度お試しください。",
  "survey.requiredNotice": "必須の質問にお答えください。",
  "survey.optional": "（任意）",

  "wheel.title": "幸運のカード",
  "wheel.waiting": "少々お待ちください",
  "wheel.spinning": "カードをシャッフルしています",
  "wheel.flipHint": "カードをタップしてめくってください",
  "card.saveButton": "画像として保存",
  "card.saving": "保存中...",
  "card.saveError": "保存に失敗しました。しばらくしてからお試しください。",
  "card.saveRecommendNotice":
    "「自分のクーポン」から再度ご確認いただけます。ただしご利用環境によって記録が消える場合がありますので、画像として保存されることをおすすめします。",
  "card.saveRecommendNoticeShort":
    "ご利用環境によって記録が消える場合がありますので、画像として保存されることをおすすめします。",

  "sound.muteAria": "音を消す",
  "sound.unmuteAria": "音を出す",

  "wheel.wonTitle": "クーポンが当たりました！",
  "wheel.missTitle": "残念、はずれです",
  "wheel.missDescription": "またの機会にご挑戦ください。",
  "wheel.rejectedHasCoupons": "すでに発行されたクーポンがあります。",
  "wheel.rejected": "現在カードを引けません。しばらくしてからお試しください。",
  "wheel.error": "現在サーバーに接続できません。しばらくしてからお試しください。",
  "start.goToDrawButton": "クーポンを引きに行く",
  "start.inviteButton": "友だちを招待する",
  "start.drawAvailableNotice": "引けるクーポンがあります",
  "start.invitePromo": "クッパマスターは誰だ？\n〈1953 眼力対決〉に参加して、1953 兄弟テジクッパのクーポンをゲットしよう！🍲",
  "start.inviteCopied": "招待リンクをコピーしました！",
  "start.inviteFailed": "コピーできませんでした。しばらくしてからもう一度お試しください。",
  "wheel.nextButton": "次へ",

  "webCoupon.label": "オンラインストアクーポン",
  "webCoupon.copyButton": "コピー",
  "webCoupon.copied": "コードをコピーしました！",
  "webCoupon.copyFailed": "コピーできませんでした。コードを直接入力してください。",
  "webCoupon.grantedTitle": "オンラインストアクーポンを獲得しました！",
  "webCoupon.grantedBody":
    "公式オンラインストアで下記のコードを登録するとご利用いただけます。\n「自分のクーポン」から再度ご確認いただけます。",
  "webCoupon.grantedConfirm": "確認",

  "coupon.myCouponsButton": "自分のクーポンを見る",
  "coupon.myCouponsTitle": "自分のクーポン",
  "coupon.empty": "まだ受け取ったクーポンはありません。",
  "coupon.usedBadge": "使用済み",
  "coupon.expiredBadge": "期限切れ",
  "coupon.remainingToday": "本日まで",
  "coupon.remainingDay": "あと1日",
  "coupon.remainingDays": "あと{days}日",
  "coupon.validPeriod": "{from} ~ {until}",
  "coupon.expiresAt": "{date}まで",
  "coupon.validFrom": "{date}から",
  "coupon.backToAlbum": "一覧へ",
  "coupon.closeButton": "閉じる",
  "coupon.qrUnavailable": "このクーポンのQRコードを表示できません。",
  "coupon.issuedButHidden": "クーポンは発行されましたが、今は表示できません。しばらくしてから「自分のクーポン」でご確認ください。",
  "coupon.wonOnlineDescription":
    "オンラインストア用のクーポンのため、QRカードではなくクーポンコードでお渡しします。「自分のクーポン」でコードの確認とコピーができます。",

  "game.stageProgress": "{current} / {total} ステージ",
  "game.timeRemainingLabel": "残り時間:",
  "game.secondsUnit": "{seconds}秒",
  "game.hintButton": "ヒント",
  "game.remainingCount": "残り: {found}/{total}",
  "game.wrongTouchAria": "誤タッチ {count}/{limit}",
  "game.hintTitle": "本日の注文書",
  "game.hintCloseAria": "ヒントを閉じる",
  "game.hintRemainingAria": "残りヒント {remaining}/{limit}",
  "game.hintExhaustedAria": "ヒントを使い切りました",
  // 가려진 줄. **정답을 읽어주면 안 된다** — 화면에서는 가토(░)로 지워지는 자리다.
  "game.hintMaskedAria": "印刷が消えた行",
  "game.hintSurveyTitle": "アンケート1問",
  "game.hintSurveyCloseAria": "答えずに閉じる",
  "game.hintSurveyNotice": "答えるとヒントが見られます。その間も時間は進みます。",
};

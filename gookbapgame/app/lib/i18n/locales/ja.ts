import type { Dictionary } from "../types.ts";

// 한국 음식 이름은 일본어에 대응 어휘가 없으면 그대로 가타카나로 음차한다
// (국밥 → クッパ, 돼지국밥 → テジクッパ). 값이 없는 키는 en → ko 순으로 폴백된다.
export const ja: Partial<Dictionary> = {
  "meta.title": "間違い探し - クッパ",
  "meta.description": "クッパのお膳で遊ぶ間違い探しゲーム",

  "common.retry": "再試行",

  // ウィンドウのタイトルバー（90s デスクトップ風）に表示するブランド名。画面見出しとは別。
  "window.brand": "1953 兄弟豚クッパ",

  "start.title": "間違い探し",
  "start.welcome": "{nickname} さん、ようこそ",
  "start.regenerateNicknameAria": "ニックネームを再生成",
  "start.playButton": "ゲーム開始",
  "start.myResult": "自分の結果",
  "start.ranking": "ランキング",

  "term.title": "個人情報の取り扱いについて",
  "term.body":
    "このゲームでは、ゲームの運営とクーポン発行のために以下の情報を収集します。\n\n" +
    "· 匿名識別用のクッキー（氏名・連絡先など個人を特定する情報は収集しません）\n" +
    "· ゲームのスコアおよびプレイ記録\n" +
    "· アンケートの回答内容\n" +
    "· クーポンの発行・利用履歴\n\n" +
    "収集した情報はゲームの運営とクーポン発行の目的にのみ使用し、イベント終了後に破棄します。",
  "term.agreeNotice": "「確認」を押すと、上記の内容に同意したものとみなします。",
  "term.confirmButton": "確認",

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
    "制限時間はステージごとではなく、全体で300秒です。\n" +
    "1つのステージで3回間違えると、そのステージは終了して次に進みます。\n" +
    "間違えるたびに10点減点されます。",

  "tutorial.score.title": "スコアを伸ばす",
  "tutorial.score.body":
    "早く終えるほどタイムボーナスが付きます。\n" +
    "連続で正解するとコンボボーナスが加算されます。\n" +
    "ゲーム終了後はクッパ力ランクが出て、クーポン抽選に進みます。",

  "preload.preparing": "ゲームを起動中...",
  "preload.sessionError": "ゲームデータの読み込みに失敗しました。ネットワーク状況をご確認ください。",
  "preload.levelSessionError": "ステージ{level}のゲームデータを読み込めませんでした。",
  "preload.imageError": "画像の読み込みに失敗しました。ネットワーク状況をご確認ください。",

  "gameResult.title": "ゲーム結果",
  "gameResult.stageScore": "ステージ得点",
  "gameResult.timeBonus": "タイムボーナス",
  "gameResult.comboBonus": "コンボボーナス",
  "gameResult.wrongTouchPenalty": "誤タッチ減点",
  "gameResult.incompleteLevelPenalty": "未クリア減点",
  "gameResult.totalLabel": "合計",
  "gameResult.gukbapPowerLabel": "クッパワー: {tier}",
  "gameResult.nextButton": "次へ",

  "countdown.start": "START",
  "gameEnd.gameOver": "GAME OVER",
  "gameEnd.clear": "CLEAR",
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

  "sound.muteAria": "音を消す",
  "sound.unmuteAria": "音を出す",

  "wheel.wonTitle": "クーポンが当たりました！",
  "wheel.missTitle": "残念、はずれです",
  "wheel.missDescription": "またの機会にご挑戦ください。",
  "wheel.rejected": "現在カードを引けません。しばらくしてからお試しください。",
  "wheel.error": "現在サーバーに接続できません。しばらくしてからお試しください。",
  "start.goToDrawButton": "クーポンを引きに行く",
  "start.inviteButton": "友だちを招待する",
  "start.invitePromo": "クッパマスターは誰だ？\n〈1953 眼力対決〉に参加して、1953 兄弟豚クッパのクーポンをゲットしよう！🍲",
  "start.inviteCopied": "招待リンクをコピーしました！",
  "start.inviteFailed": "コピーできませんでした。しばらくしてからもう一度お試しください。",
  "wheel.nextButton": "次へ",

  "coupon.myCouponsButton": "自分のクーポンを見る",
  "coupon.myCouponsTitle": "自分のクーポン",
  "coupon.empty": "まだ受け取ったクーポンはありません。",
  "coupon.usedBadge": "使用済み",
  "coupon.expiredBadge": "期限切れ",
  "coupon.expiresAt": "{date}まで",
  "coupon.showQrButton": "QRコードを表示",
  "coupon.closeButton": "閉じる",
  "coupon.qrUnavailable": "このクーポンのQRコードを表示できません。",
  "coupon.issuedButHidden": "クーポンは発行されましたが、今は表示できません。しばらくしてから「自分のクーポン」でご確認ください。",

  "game.stageProgress": "{current} / {total} ステージ",
  "game.timeRemainingLabel": "残り時間:",
  "game.secondsUnit": "{seconds}秒",
  "game.hintButton": "ヒント",
  "game.remainingCount": "残り: {found}/{total}",
  "game.wrongTouchAria": "誤タッチ {count}/{limit}",
  "game.hintTitle": "本日の注文書",
  "game.hintCloseAria": "ヒントを閉じる",
};

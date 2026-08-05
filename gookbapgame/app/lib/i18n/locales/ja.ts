import type { Dictionary } from "../types.ts";

// 한국 음식 이름은 일본어에 대응 어휘가 없으면 그대로 가타카나로 음차한다
// (국밥 → クッパ, 돼지국밥 → テジクッパ). 값이 없는 키는 en → ko 순으로 폴백된다.
export const ja: Partial<Dictionary> = {
  "meta.title": "間違い探し - クッパ",
  "meta.description": "クッパのお膳で遊ぶ間違い探しゲーム",

  "common.retry": "再試行",

  "start.title": "間違い探し",
  "start.welcome": "{nickname} さん、ようこそ",
  "start.regenerateNicknameAria": "ニックネームを再生成",
  "start.playButton": "ゲーム開始",
  "start.myResult": "自分の結果",
  "start.ranking": "ランキング",

  "preload.preparing": "クッパを準備中...",
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
  "gameResult.gukbapPowerLabel": "クッパ力: {tier}",
  "gameResult.nextButton": "次へ",

  "dailyResult.title": "今日の結果",
  "dailyResult.nicknameLabel": "今日のニックネーム",
  "dailyResult.gukbapPowerLabel": "クッパ力",
  "dailyResult.finalScoreLabel": "最終得点",
  "dailyResult.restartButton": "最初に戻る",
  "dailyResult.surveyAgainButton": "アンケートに答えてクーポンをもらう",

  "gukbapTier.1953Master": "1953 Master",
  "gukbapTier.regular": "クッパの常連",
  "gukbapTier.gourmet": "クッパ美食家",
  "gukbapTier.explorer": "クッパ探検家",
  "gukbapTier.beginner": "クッパ初心者",


  "surveyIntro.title": "アンケートにご協力いただけますか？",
  "surveyIntro.description": "アンケートに答えるとクーポンルーレットを回せます。",
  "surveyIntro.participateButton": "参加する",
  "surveyIntro.declineLink": "また今度にします",

  "survey.submitButton": "送信してルーレットを回す",
  "survey.submitting": "送信中...",
  "survey.submitError": "送信に失敗しました。もう一度お試しください。",
  "survey.requiredNotice": "すべての質問にお答えください。",

  "wheel.title": "幸運のルーレット",
  "wheel.spinning": "クーポンを抽選中...",
  "wheel.wonTitle": "クーポンが当たりました！",
  "wheel.missTitle": "残念、はずれです",
  "wheel.missDescription": "またの機会にご挑戦ください。",
  "wheel.rejected": "現在ルーレットを回せません。しばらくしてからお試しください。",
  "wheel.error": "現在サーバーに接続できません。しばらくしてからお試しください。",
  "start.goToDrawButton": "クーポンを引きに行く",
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

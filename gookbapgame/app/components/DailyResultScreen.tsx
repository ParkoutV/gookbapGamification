"use client";

import React from "react";
import { GukbapTier } from "../lib/stageConfig";
import { gukbapTierKey } from "../lib/i18n/gukbapTierKey";
import { useLocale } from "../lib/i18n/LocaleContext";
import { formatNickname, type Nickname } from "../lib/nicknameParts";
import PixelPanel from "./PixelPanel";

interface DailyResultScreenProps {
  /** 조립 전 재료다. 문자열로 만드는 것은 이 화면의 몫 — `formatNickname` 참고. */
  nickname: Nickname;
  gukbapTier: GukbapTier;
  totalScore: number;
  onRestart: () => void;
  onSurveyAgain?: () => void;
  onOpenMyCoupons?: () => void;
}

export default function DailyResultScreen({
  nickname,
  gukbapTier,
  totalScore,
  onRestart,
  onSurveyAgain,
  onOpenMyCoupons,
}: DailyResultScreenProps) {
  const { t, locale } = useLocale();
  const stubAchievements = ["첫 만남", "형제의 눈썰미"];

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh text-ink p-6">
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("dailyResult.title")}</h1>
        <p className="text-muted mb-1">{t("dailyResult.nicknameLabel")}</p>
        <p className="text-xl text-ink font-bold mb-4">{formatNickname(nickname, locale)}</p>
        <p className="text-muted mb-1">{t("dailyResult.gukbapPowerLabel")}</p>
        <p className="text-xl text-accent font-bold mb-4" style={{ fontFamily: "var(--font-pixel)" }}>
          {t(gukbapTierKey(gukbapTier))}
        </p>
        <p className="text-muted mb-1">{t("dailyResult.finalScoreLabel")}</p>
        {/* 결과표와 같은 이유로 `/1953`을 떼고 점수만 쓴다(2026-08-19, 이란토).
            **한쪽만 떼면 같은 점수가 화면마다 다르게 보인다.** 크기 확대와 twinkle은
            결과표 총점에만 있다 — 요청서가 그 자리의 연출로 한정했다. */}
        <p className="text-xl text-accent font-bold mb-6" style={{ fontFamily: "var(--font-pixel)" }}>
          {totalScore}
        </p>
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {stubAchievements.map((label) => (
            <span
              key={label}
              className="px-3 py-1 rounded-full bg-accent/15 text-accent text-sm border border-accent/40"
            >
              {label}
            </span>
          ))}
        </div>
        {onSurveyAgain && (
          <button
            onClick={onSurveyAgain}
            className="pixel-mask-btn-solid w-full py-3 px-6 mb-3 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
          >
            {t("dailyResult.surveyAgainButton")}
          </button>
        )}
        {onOpenMyCoupons && (
          <button
            onClick={onOpenMyCoupons}
            className="pixel-mask-btn-solid w-full py-3 px-6 mb-3 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
          >
            {t("coupon.myCouponsButton")}
          </button>
        )}
        <PixelPanel size="btn">
          <button onClick={onRestart} className="w-full font-bold text-ink">
            {t("dailyResult.restartButton")}
          </button>
        </PixelPanel>
      </PixelPanel>
    </div>
  );
}

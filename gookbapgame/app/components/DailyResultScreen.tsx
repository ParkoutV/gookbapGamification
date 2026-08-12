"use client";

import React from "react";
import { GukbapTier, DISPLAY_MAX_SCORE } from "../lib/stageConfig";
import { gukbapTierKey } from "../lib/i18n/gukbapTierKey";
import { useLocale } from "../lib/i18n/LocaleContext";
import PixelPanel from "./PixelPanel";

interface DailyResultScreenProps {
  nickname: string;
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
  const { t } = useLocale();
  const stubAchievements = ["첫 만남", "형제의 눈썰미"];

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-bg text-ink p-6">
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("dailyResult.title")}</h1>
        <p className="text-muted mb-1">{t("dailyResult.nicknameLabel")}</p>
        <p className="text-xl text-ink font-bold mb-4">{nickname}</p>
        <p className="text-muted mb-1">{t("dailyResult.gukbapPowerLabel")}</p>
        <p className="text-xl text-accent font-bold mb-4" style={{ fontFamily: "var(--font-pixel)" }}>
          {t(gukbapTierKey(gukbapTier))}
        </p>
        <p className="text-muted mb-1">{t("dailyResult.finalScoreLabel")}</p>
        <p className="text-xl text-accent font-bold mb-6" style={{ fontFamily: "var(--font-pixel)" }}>
          {totalScore} / {DISPLAY_MAX_SCORE}
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

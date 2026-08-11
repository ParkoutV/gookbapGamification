"use client";

import React, { useEffect } from "react";
import { ScoreBreakdown, GukbapTier, DISPLAY_MAX_SCORE } from "../lib/stageConfig";
import { gukbapTierKey } from "../lib/i18n/gukbapTierKey";
import { useLocale } from "../lib/i18n/LocaleContext";
import PixelPanel from "./PixelPanel";
import { playSfx, SFX } from "../lib/sfx";
import Confetti from "./Confetti";

interface GameResultScreenProps {
  scoreBreakdown: ScoreBreakdown;
  gukbapTier: GukbapTier;
  onNext: () => void;
}

export default function GameResultScreen({
  scoreBreakdown,
  gukbapTier,
  onNext,
}: GameResultScreenProps) {
  const { t } = useLocale();

  // 결과표가 뜨는 순간 한 번. 점수와 상관없이 항상 재생한다 —
  // 만점자 전용 연출이 아니라 "결과가 나왔다"는 신호다.
  useEffect(() => {
    playSfx(SFX.coindrop);
  }, []);

  const rows: { label: string; value: number; isPenalty: boolean }[] = [
    { label: t("gameResult.stageScore"), value: scoreBreakdown.stageScore, isPenalty: false },
    { label: t("gameResult.timeBonus"), value: scoreBreakdown.timeBonus, isPenalty: false },
    { label: t("gameResult.comboBonus"), value: scoreBreakdown.comboBonus, isPenalty: false },
    {
      label: t("gameResult.wrongTouchPenalty"),
      value: scoreBreakdown.wrongTouchPenalty,
      isPenalty: true,
    },
    {
      label: t("gameResult.incompleteLevelPenalty"),
      value: scoreBreakdown.incompleteLevelPenalty,
      isPenalty: true,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      {/* 만점자 축하 연출. 1953점이 총점의 실제 만점이고 그때만 이 등급이 나온다
          (stageConfig의 GUKBAP_TIER_CUTOFFS). 소리는 따로 내지 않는다 — 결과표의
          coindrop이 이미 울린다. */}
      {gukbapTier === "1953 Master" && <Confetti />}

      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("gameResult.title")}</h1>
        <dl className="space-y-2 mb-6 text-left">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <dt className="text-muted">{row.label}</dt>
              <dd className="text-ink font-bold">
                {row.isPenalty && row.value > 0 ? "-" : ""}
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-wood pt-4 mb-2">
          <div className="flex justify-between text-xl font-extrabold">
            <span className="text-ink">{t("gameResult.totalLabel")}</span>
            <span className="text-accent" style={{ fontFamily: "var(--font-pixel)" }}>
              {scoreBreakdown.total} / {DISPLAY_MAX_SCORE}
            </span>
          </div>
        </div>
        <p className="text-accent font-bold mb-8" style={{ fontFamily: "var(--font-pixel)" }}>
          {t("gameResult.gukbapPowerLabel", { tier: t(gukbapTierKey(gukbapTier)) })}
        </p>
        <button
          onClick={onNext}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("gameResult.nextButton")}
        </button>
      </PixelPanel>
    </div>
  );
}

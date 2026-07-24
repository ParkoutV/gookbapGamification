"use client";

import React from "react";
import { ScoreBreakdown, GukbapTier, MAX_TOTAL_SCORE } from "../lib/stageConfig";
import PixelPanel from "./PixelPanel";

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
  const rows: { label: string; value: number }[] = [
    { label: "Stage 점수", value: scoreBreakdown.stageScore },
    { label: "완주 보너스", value: scoreBreakdown.completionBonus },
    { label: "시간 보너스", value: scoreBreakdown.timeBonus },
    { label: "정답행진 보너스", value: scoreBreakdown.streakBonus },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-sm w-full">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">게임 결과</h1>
        <dl className="space-y-2 mb-6 text-left">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <dt className="text-muted">{row.label}</dt>
              <dd className="text-ink font-bold">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-wood pt-4 mb-2">
          <div className="flex justify-between text-xl font-extrabold">
            <span className="text-ink">총점</span>
            <span className="text-amber" style={{ fontFamily: "var(--font-pixel)" }}>
              {scoreBreakdown.total} / {MAX_TOTAL_SCORE}
            </span>
          </div>
        </div>
        <p className="text-amber font-bold mb-8" style={{ fontFamily: "var(--font-pixel)" }}>
          국밥력: {gukbapTier}
        </p>
        <button
          onClick={onNext}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          다음
        </button>
      </PixelPanel>
    </div>
  );
}

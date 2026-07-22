"use client";

import React from "react";
import { ScoreBreakdown, GukbapTier, MAX_TOTAL_SCORE } from "../lib/stageConfig";

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-sm w-full bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 text-center">
        <h1 className="text-2xl font-extrabold mb-6">게임 결과</h1>
        <dl className="space-y-2 mb-6 text-left">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <dt className="text-zinc-300">{row.label}</dt>
              <dd className="font-bold">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-white/20 pt-4 mb-2">
          <div className="flex justify-between text-xl font-extrabold">
            <span>총점</span>
            <span>{scoreBreakdown.total} / {MAX_TOTAL_SCORE}</span>
          </div>
        </div>
        <p className="text-yellow-300 font-bold mb-8">국밥력: {gukbapTier}</p>
        <button
          onClick={onNext}
          className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 rounded-xl font-bold shadow-md transition-all active:scale-95"
        >
          다음
        </button>
      </div>
    </div>
  );
}

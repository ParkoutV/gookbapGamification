"use client";

import React from "react";
import { GukbapTier } from "../lib/stageConfig";

interface DailyResultScreenProps {
  nickname: string;
  gukbapTier: GukbapTier;
  totalScore: number;
  onRestart: () => void;
}

export default function DailyResultScreen({
  nickname,
  gukbapTier,
  totalScore,
  onRestart,
}: DailyResultScreenProps) {
  const stubAchievements = ["첫 만남", "형제의 눈썰미"];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-sm w-full bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 text-center">
        <h1 className="text-2xl font-extrabold mb-6">오늘의 결과</h1>
        <p className="text-zinc-300 mb-1">오늘의 별명</p>
        <p className="text-xl font-bold mb-4">{nickname}</p>
        <p className="text-zinc-300 mb-1">국밥력</p>
        <p className="text-xl font-bold mb-4">{gukbapTier}</p>
        <p className="text-zinc-300 mb-1">최종점수</p>
        <p className="text-xl font-bold mb-6">{totalScore} / 1953</p>
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {stubAchievements.map((label) => (
            <span
              key={label}
              className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-300 text-sm border border-yellow-500/40"
            >
              {label}
            </span>
          ))}
        </div>
        <button
          onClick={onRestart}
          className="w-full py-3 px-6 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl font-bold transition-all active:scale-95"
        >
          처음으로
        </button>
      </div>
    </div>
  );
}

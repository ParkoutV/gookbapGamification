"use client";

import React from "react";
import { GukbapTier, MAX_TOTAL_SCORE } from "../lib/stageConfig";
import PixelPanel from "./PixelPanel";

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-sm w-full">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">오늘의 결과</h1>
        <p className="text-muted mb-1">오늘의 별명</p>
        <p className="text-xl text-ink font-bold mb-4">{nickname}</p>
        <p className="text-muted mb-1">국밥력</p>
        <p className="text-xl text-amber font-bold mb-4" style={{ fontFamily: "var(--font-pixel)" }}>
          {gukbapTier}
        </p>
        <p className="text-muted mb-1">최종점수</p>
        <p className="text-xl text-amber font-bold mb-6" style={{ fontFamily: "var(--font-pixel)" }}>
          {totalScore} / {MAX_TOTAL_SCORE}
        </p>
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {stubAchievements.map((label) => (
            <span
              key={label}
              className="px-3 py-1 rounded-full bg-amber/20 text-amber text-sm border border-amber/40"
            >
              {label}
            </span>
          ))}
        </div>
        <PixelPanel size="btn">
          <button onClick={onRestart} className="w-full font-bold text-ink">
            처음으로
          </button>
        </PixelPanel>
      </PixelPanel>
    </div>
  );
}

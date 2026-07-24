"use client";

import React from "react";
import PixelPanel from "./PixelPanel";

interface StageTransitionModalProps {
  type: "stageClear" | "stageFail";
  onNext: () => void;
  isLoading?: boolean;
  loadError?: string | null;
}

export default function StageTransitionModal({
  type,
  onNext,
  isLoading,
  loadError,
}: StageTransitionModalProps) {
  const isClear = type === "stageClear";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80">
      <PixelPanel size="card" className="max-w-sm w-full mx-4 text-center">
        <div className="text-6xl mb-4">{isClear ? "🎉" : "⏳"}</div>
        <h2
          className={`text-2xl font-extrabold mb-4 ${isClear ? "text-amber" : "text-error"}`}
        >
          {isClear ? "축하합니다!!" : "아쉽게도"}
        </h2>
        <p className="text-ink mb-6 text-lg">
          {isClear ? "이번 단계를 통과하셨습니다." : "시간이 종료되었습니다."}
        </p>
        {loadError && <p className="text-error mb-4">{loadError}</p>}
        <button
          onClick={onNext}
          disabled={isLoading}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "로딩 중..." : isClear ? "다음" : "재도전"}
        </button>
      </PixelPanel>
    </div>
  );
}

"use client";

import React from "react";

interface StageTransitionModalProps {
  type: "stageClear" | "stageFail";
  onNext: () => void;
}

export default function StageTransitionModal({ type, onNext }: StageTransitionModalProps) {
  const isClear = type === "stageClear";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
        <div className="text-6xl mb-4">{isClear ? "🎉" : "⏳"}</div>
        <h2
          className={`text-2xl font-extrabold mb-4 ${isClear ? "text-green-500" : "text-red-500"}`}
        >
          {isClear ? "축하합니다!!" : "아쉽게도"}
        </h2>
        <p className="text-zinc-600 dark:text-zinc-300 mb-6 text-lg">
          {isClear ? "이번 단계를 통과하셨습니다." : "시간이 종료되었습니다."}
        </p>
        <button
          onClick={onNext}
          className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl font-bold shadow-md transition-all active:scale-95"
        >
          {isClear ? "다음" : "재도전"}
        </button>
      </div>
    </div>
  );
}

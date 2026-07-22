"use client";

import React from "react";

interface WheelScreenProps {
  onNext: () => void;
}

export default function WheelScreen({ onNext }: WheelScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-sm w-full bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 text-center">
        <h1 className="text-2xl font-extrabold mb-6">행운의 돌림판</h1>
        <div className="text-6xl mb-6">🎡</div>
        <p className="text-zinc-300 mb-8">준비 중입니다.</p>
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

"use client";

import React from "react";

interface StartScreenProps {
  onStart: () => void;
  isLoading: boolean;
}

export default function StartScreen({ onStart, isLoading }: StartScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black text-white p-6">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-white/20 text-center transform transition-all hover:scale-105 duration-300">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-indigo-400">
          다른그림찾기
        </h1>
        <p className="text-lg text-gray-300 mb-8">
          두 이미지 사이에서 서로 다른 부분 2곳을 찾아보세요! 제한시간은 30초입니다.
        </p>
        <button
          onClick={onStart}
          disabled={isLoading}
          className="w-full py-4 px-6 bg-gradient-to-r from-pink-500 to-indigo-500 hover:from-pink-600 hover:to-indigo-600 rounded-full text-xl font-bold transition-all shadow-lg hover:shadow-pink-500/50 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "로딩 중..." : "게임 시작"}
        </button>
      </div>
    </div>
  );
}

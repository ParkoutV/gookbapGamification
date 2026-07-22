"use client";

import React from "react";

interface StartScreenProps {
  nickname: string;
  onRegenerateNickname: () => void;
  onStart: () => void;
  isLoading: boolean;
  loadError: string | null;
}

export default function StartScreen({
  nickname,
  onRegenerateNickname,
  onStart,
  isLoading,
  loadError,
}: StartScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black text-white p-6">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-white/20 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-indigo-400">
          다른그림찾기
        </h1>
        <p className="text-lg text-gray-300 mb-2">게임 제목</p>
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-zinc-300">{nickname} 님 환영합니다</span>
          <button
            type="button"
            onClick={onRegenerateNickname}
            aria-label="닉네임 다시 생성"
            className="text-xl"
          >
            🔄
          </button>
        </div>
        {loadError && <p className="text-red-400 mb-4">{loadError}</p>}
        <button
          onClick={onStart}
          disabled={isLoading}
          className="w-full py-4 px-6 bg-gradient-to-r from-pink-500 to-indigo-500 hover:from-pink-600 hover:to-indigo-600 rounded-full text-xl font-bold transition-all shadow-lg hover:shadow-pink-500/50 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {isLoading ? "로딩 중..." : "게임 시작"}
        </button>
        <div className="flex gap-3">
          <button type="button" className="flex-1 py-2 px-4 bg-white/10 rounded-full font-bold">
            내 결과
          </button>
          <button type="button" className="flex-1 py-2 px-4 bg-white/10 rounded-full font-bold">
            랭킹
          </button>
        </div>
      </div>
    </div>
  );
}

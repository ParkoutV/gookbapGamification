"use client";

import React from "react";

interface ModalProps {
  type: "success" | "fail";
  timeElapsed: number;
  onRestart: () => void;
  onMainMenu: () => void;
}

export default function Modal({ type, timeElapsed, onRestart, onMainMenu }: ModalProps) {
  const isSuccess = type === "success";
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl transform scale-100 animate-in zoom-in-95 duration-300">
        <div className="text-center">
          <div className="text-6xl mb-4">{isSuccess ? "🎉" : "⏳"}</div>
          <h2 className={`text-3xl font-extrabold mb-2 ${isSuccess ? "text-green-500" : "text-red-500"}`}>
            {isSuccess ? "성공!" : "시간 초과!"}
          </h2>
          <p className="text-zinc-600 dark:text-zinc-300 mb-6 text-lg">
            {isSuccess ? `축하합니다! 모든 다른 부분을 찾았습니다.` : `아쉽게도 시간이 다 되었습니다.`}
            <br/>
            <span className="font-bold mt-2 block">플레이 타임: {timeElapsed}초</span>
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={onRestart}
              className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl font-bold shadow-md transition-all active:scale-95"
            >
              다시 시작
            </button>
            <button
              onClick={onMainMenu}
              className="w-full py-3 px-6 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl font-bold transition-all active:scale-95"
            >
              메인 화면으로
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

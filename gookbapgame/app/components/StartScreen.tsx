"use client";

import PixelPanel from "./PixelPanel";

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-md w-full">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
          다른그림찾기
        </h1>
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-ink">{nickname} 님 환영합니다</span>
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
          className="pixel-mask-btn-solid w-full py-4 px-6 bg-accent text-accent-ink text-xl font-bold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {isLoading ? "로딩 중..." : "게임 시작"}
        </button>
        <div className="flex gap-3 w-full">
          <PixelPanel size="btn" className="flex-1">
            <button type="button" className="w-full font-bold text-ink">내 결과</button>
          </PixelPanel>
          <PixelPanel size="btn" className="flex-1">
            <button type="button" className="w-full font-bold text-ink">랭킹</button>
          </PixelPanel>
        </div>
      </PixelPanel>
    </div>
  );
}

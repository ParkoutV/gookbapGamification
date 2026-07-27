"use client";

import PixelPanel from "./PixelPanel";

interface PreloadScreenProps {
  loadError: string | null;
  onRetry: () => void;
}

export default function PreloadScreen({ loadError, onRetry }: PreloadScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <PixelPanel size="card" className="max-w-sm w-full mx-4 text-center">
        {loadError ? (
          <>
            <p className="text-error mb-6 text-lg">{loadError}</p>
            <button
              onClick={onRetry}
              className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
            >
              다시 시도
            </button>
          </>
        ) : (
          <>
            <div className="animate-spin text-6xl mb-4">🍚</div>
            <p className="text-ink text-lg font-bold">국밥 준비 중...</p>
          </>
        )}
      </PixelPanel>
    </div>
  );
}

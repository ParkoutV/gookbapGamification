"use client";

import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { LoadError } from "../lib/preloadGame";

interface PreloadScreenProps {
  loadError: LoadError | null;
  onRetry: () => void;
}

export default function PreloadScreen({ loadError, onRetry }: PreloadScreenProps) {
  const { t } = useLocale();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <PixelPanel size="card" className="max-w-sm w-full mx-4 text-center">
        {loadError ? (
          <>
            <p className="text-error mb-6 text-lg">{t(loadError.key, loadError.params)}</p>
            <button
              onClick={onRetry}
              className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
            >
              {t("common.retry")}
            </button>
          </>
        ) : (
          <>
            <div className="animate-spin text-6xl mb-4">🍚</div>
            <p className="text-ink text-lg font-bold">{t("preload.preparing")}</p>
          </>
        )}
      </PixelPanel>
    </div>
  );
}

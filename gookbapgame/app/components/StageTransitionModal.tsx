"use client";

import React from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { LoadError } from "../lib/preloadGame";
import PixelPanel from "./PixelPanel";

interface StageTransitionModalProps {
  onNext: () => void;
  isLoading?: boolean;
  loadError?: LoadError | null;
}

export default function StageTransitionModal({
  onNext,
  isLoading,
  loadError,
}: StageTransitionModalProps) {
  const { t } = useLocale();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80">
      <PixelPanel size="card" className="max-w-sm w-full mx-4 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-extrabold mb-4 text-amber">{t("stageTransition.clearTitle")}</h2>
        <p className="text-ink mb-6 text-lg">{t("stageTransition.clearMessage")}</p>
        {loadError && <p className="text-error mb-4">{t(loadError.key, loadError.params)}</p>}
        <button
          onClick={onNext}
          disabled={isLoading}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? t("stageTransition.loading") : t("stageTransition.nextButton")}
        </button>
      </PixelPanel>
    </div>
  );
}

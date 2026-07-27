"use client";

import React from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import PixelPanel from "./PixelPanel";

interface WheelScreenProps {
  onNext: () => void;
}

export default function WheelScreen({ onNext }: WheelScreenProps) {
  const { t } = useLocale();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("wheel.title")}</h1>
        <div className="text-6xl mb-6">🎡</div>
        <p className="text-muted mb-8">{t("wheel.preparing")}</p>
        <button
          onClick={onNext}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("wheel.nextButton")}
        </button>
      </PixelPanel>
    </div>
  );
}

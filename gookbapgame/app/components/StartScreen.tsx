"use client";

import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";

interface StartScreenProps {
  nickname: string;
  onRegenerateNickname: () => void;
  onStart: () => void;
}

export default function StartScreen({
  nickname,
  onRegenerateNickname,
  onStart,
}: StartScreenProps) {
  const { t } = useLocale();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
          {t("start.title")}
        </h1>
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-ink">{t("start.welcome", { nickname })}</span>
          <button
            type="button"
            onClick={onRegenerateNickname}
            aria-label={t("start.regenerateNicknameAria")}
            className="text-xl"
          >
            🔄
          </button>
        </div>
        <button
          onClick={onStart}
          className="pixel-mask-btn-solid w-full py-4 px-6 bg-accent text-accent-ink text-xl font-bold transition-opacity active:scale-95 mb-4"
        >
          {t("start.playButton")}
        </button>
        <div className="flex gap-3 w-full">
          <PixelPanel size="btn" className="flex-1">
            <button type="button" className="w-full font-bold text-ink">{t("start.myResult")}</button>
          </PixelPanel>
          <PixelPanel size="btn" className="flex-1">
            <button type="button" className="w-full font-bold text-ink">{t("start.ranking")}</button>
          </PixelPanel>
        </div>
      </PixelPanel>
    </div>
  );
}

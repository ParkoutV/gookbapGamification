"use client";

import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";

interface StartScreenProps {
  nickname: string;
  onRegenerateNickname: () => void;
  isRegeneratingNickname: boolean;
  onStart: () => void;
  onOpenTutorial: () => void;
  onGoToDraw?: () => void;
}

export default function StartScreen({
  nickname,
  onRegenerateNickname,
  isRegeneratingNickname,
  onStart,
  onOpenTutorial,
  onGoToDraw,
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
            disabled={isRegeneratingNickname}
            aria-label={t("start.regenerateNicknameAria")}
            className="text-xl disabled:opacity-40"
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
        {onGoToDraw && (
          <button
            onClick={onGoToDraw}
            className="mt-3 text-sm text-muted underline underline-offset-4 bg-transparent border-0 p-0"
          >
            {t("start.goToDrawButton")}
          </button>
        )}
        <div className="grid grid-cols-3 gap-2 w-full">
          <PixelPanel size="btn">
            <button type="button" className="w-full font-bold text-ink text-sm">{t("start.myResult")}</button>
          </PixelPanel>
          <PixelPanel size="btn">
            <button type="button" className="w-full font-bold text-ink text-sm">{t("start.ranking")}</button>
          </PixelPanel>
          <PixelPanel size="btn">
            <button type="button" onClick={onOpenTutorial} className="w-full font-bold text-ink text-sm">
              {t("tutorial.openButton")}
            </button>
          </PixelPanel>
        </div>
      </PixelPanel>
    </div>
  );
}

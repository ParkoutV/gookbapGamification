"use client";

import { useLocale } from "../lib/i18n/LocaleContext";
import PixelPanel from "./PixelPanel";

interface SurveyIntroScreenProps {
  onParticipate: () => void;
  onDecline: () => void;
}

export default function SurveyIntroScreen({ onParticipate, onDecline }: SurveyIntroScreenProps) {
  const { t } = useLocale();

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-bg text-ink p-6">
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-4 text-ink">{t("surveyIntro.title")}</h1>
        <p className="text-muted mb-8">{t("surveyIntro.description")}</p>

        <button
          onClick={onParticipate}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("surveyIntro.participateButton")}
        </button>

        {/* 거절은 테두리 없는 작은 텍스트로 둔다. 동등한 버튼 두 개면 거절이 실제보다
            매력적인 선택으로 보인다 — 버튼으로 되돌리지 말 것. */}
        <button
          onClick={onDecline}
          className="mt-4 text-sm text-muted underline underline-offset-4 bg-transparent border-0 p-0"
        >
          {t("surveyIntro.declineLink")}
        </button>
      </PixelPanel>
    </div>
  );
}

"use client";

import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";

interface TermNoticeProps {
  onAcknowledge: () => void;
}

/**
 * 최초 접속 시 1회 뜨는 개인정보 처리 안내.
 *
 * 동의를 받아 보관하는 게이트가 아니라 의무 고지다 — 확인을 누르면 동의한 것으로
 * 간주하고, 서버에 아무것도 기록하지 않는다. 닫기(X)나 거부 버튼을 두지 않는 것도
 * 그래서다: 거부라는 선택지가 있으면 동의 게이트가 되어버린다.
 */
export default function TermNotice({ onAcknowledge }: TermNoticeProps) {
  const { t } = useLocale();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("term.title")}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
    >
      <PixelPanel size="card" className="max-w-sm w-full">
        <h2 className="text-xl font-bold text-ink mb-4 text-center">{t("term.title")}</h2>
        <div className="text-sm text-ink text-left whitespace-pre-line max-h-[45vh] overflow-y-auto mb-4">
          {t("term.body")}
        </div>
        <p className="text-xs text-muted text-left mb-5">{t("term.agreeNotice")}</p>
        <button
          type="button"
          onClick={onAcknowledge}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("term.confirmButton")}
        </button>
      </PixelPanel>
    </div>
  );
}

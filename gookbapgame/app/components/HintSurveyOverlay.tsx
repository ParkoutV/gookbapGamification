"use client";

import { useLocale } from "../lib/i18n/LocaleContext";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import type { SurveyQuestion } from "../lib/surveyAnswers";
import PixelPanel from "./PixelPanel";

interface HintSurveyOverlayProps {
  /** phase 0 문항 1건. 단일 선택(type 0) 전용이다. */
  question: SurveyQuestion;
  /** 선택지를 누른 즉시 호출된다. 제출 버튼이 따로 없다. */
  onAnswer: (optionIndex: number) => void;
  onDismiss: () => void;
}

/**
 * 게임 중 힌트 설문. **`SurveyScreen`을 재사용하지 않는다** — 저쪽은 문항 전체를
 * 받는 전체 화면 패널이고, 게임 중에는 게임판이 뒤에 보이는 오버레이여야 한다.
 * phase 0 문항은 전부 단일 선택 · 필수이므로 다중 선택·주관식·필수 검사 분기가
 * 여기에는 필요 없다.
 *
 * **`HintClipboard`와 달리 바깥 탭으로 닫힌다.** 응답 없이 닫으면 힌트 차감이
 * 없으므로 쉽게 빠져나갈 수 있어야 한다 — 그쪽은 닫는 순간 이미 차감됐기 때문에
 * 반대로 실수 탭을 막는다. **두 오버레이가 닫기 핸들러를 공유해서는 안 된다.**
 */
export default function HintSurveyOverlay({
  question,
  onAnswer,
  onDismiss,
}: HintSurveyOverlayProps) {
  const { locale, t } = useLocale();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "var(--scrim)" }}
      onClick={onDismiss}
      role="button"
      tabIndex={0}
      aria-label={t("game.hintSurveyCloseAria")}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onDismiss();
      }}
    >
      <div onClick={(e) => e.stopPropagation()} className="max-w-sm w-full">
        <PixelPanel
          size="card"
          title={t("game.hintSurveyTitle")}
          onClose={onDismiss}
          closeAriaLabel={t("game.hintSurveyCloseAria")}
        >
          <div className="flex flex-col gap-4">
            {/* 문항 텍스트는 DB에서 오므로 픽셀 폰트 서브셋으로 방어할 수 없다 —
                text-ink(본문 폰트)에 담아야 두부가 되지 않는다(AGENTS.md의 서브셋 절). */}
            <p className="font-bold text-ink">{resolveLocalizedName(question.text, locale)}</p>

            {/* 선택지를 누르는 것이 곧 제출이다. 제출 버튼을 따로 두면 게임 시간이
                흐르는 중에 탭이 두 번 필요해진다(설문 중에도 180초는 계속 흐른다). */}
            <div className="flex flex-col gap-2">
              {question.options.map((option, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onAnswer(index)}
                  className="w-full py-2 px-3 text-left border-2 border-ink bg-transparent text-ink"
                >
                  {resolveLocalizedName(option, locale)}
                </button>
              ))}
            </div>

            <p className="text-sm text-muted">{t("game.hintSurveyNotice")}</p>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import type { SurveyAnswerMap, SurveyQuestion } from "../lib/surveyAnswers";
import PixelPanel from "./PixelPanel";

interface SurveyScreenProps {
  questions: SurveyQuestion[];
  isSubmitting: boolean;
  errorMessage: string | null;
  onSubmit: (answers: SurveyAnswerMap) => void;
}

function isAnswered(question: SurveyQuestion, answer: number[] | string | undefined): boolean {
  if (question.questionType === 2) return typeof answer === "string" && answer.trim() !== "";
  return Array.isArray(answer) && answer.length > 0;
}

export default function SurveyScreen({
  questions,
  isSubmitting,
  errorMessage,
  onSubmit,
}: SurveyScreenProps) {
  const { locale, t } = useLocale();
  const [answers, setAnswers] = useState<SurveyAnswerMap>({});

  // 선택 문항(isRequired=false)은 비워도 제출할 수 있다.
  const allAnswered = questions.every(
    (q) => !q.isRequired || isAnswered(q, answers[q.questionId])
  );

  const toggleChoice = (question: SurveyQuestion, index: number) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[question.questionId])
        ? (prev[question.questionId] as number[])
        : [];
      if (question.questionType === 0) {
        return { ...prev, [question.questionId]: [index] };
      }
      const next = current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index].sort((a, b) => a - b);
      return { ...prev, [question.questionId]: next };
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-bg text-ink p-6">
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full">
        <div className="flex flex-col gap-6">
          {questions.map((question) => {
            const answer = answers[question.questionId];
            const selected = Array.isArray(answer) ? answer : [];
            return (
              <div key={question.questionId}>
                <p className="font-bold mb-3 text-ink">
                  {resolveLocalizedName(question.text, locale)}
                  {!question.isRequired && (
                    <span className="ml-1 font-normal text-muted">
                      {t("survey.optional")}
                    </span>
                  )}
                </p>

                {question.questionType === 2 ? (
                  <input
                    type="text"
                    value={typeof answer === "string" ? answer : ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [question.questionId]: e.target.value }))
                    }
                    // 주관식에서 options[0]은 선택지가 아니라 다국어 placeholder다.
                    placeholder={resolveLocalizedName(question.options[0], locale)}
                    className="w-full p-3 bg-transparent border-2 border-ink text-ink"
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {question.options.map((option, index) => (
                      <button
                        key={index}
                        onClick={() => toggleChoice(question, index)}
                        className={`w-full py-2 px-3 text-left border-2 border-ink transition-opacity ${
                          selected.includes(index)
                            ? "bg-accent text-accent-ink font-bold"
                            : "bg-transparent text-ink"
                        }`}
                      >
                        {resolveLocalizedName(option, locale)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {!allAnswered && <p className="text-sm text-muted">{t("survey.requiredNotice")}</p>}
          {errorMessage && <p className="text-sm text-error">{errorMessage}</p>}

          <button
            onClick={() => onSubmit(answers)}
            disabled={!allAnswered || isSubmitting}
            className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? t("survey.submitting") : t("survey.submitButton")}
          </button>
        </div>
      </PixelPanel>
    </div>
  );
}

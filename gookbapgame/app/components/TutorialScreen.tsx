"use client";

import { useState } from "react";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { PreloadStatus } from "../hooks/useGameProgress";
import type { LoadError } from "../lib/preloadGame";

// 페이지 순서. 로케일 키의 중간 세그먼트로 쓴다(tutorial.what.title 등).
const PAGE_KEYS = ["what", "limit", "score"] as const;

interface TutorialScreenProps {
  /**
   * "onboarding": 최초 게임 시작 경로. 마지막 버튼이 프리로드 완료를 기다린다.
   * "review": 시작 화면에서 다시 보는 경로. 프리로드와 무관하다.
   *
   * review 모드에서 프리로드를 시작하면 안 된다 — 이유는 이 파일이 아니라
   * 호출부(page.tsx)와 설계 문서에 있다.
   */
  mode: "onboarding" | "review";
  preloadStatus: PreloadStatus;
  loadError: LoadError | null;
  onRetryPreload: () => void;
  /** onboarding이면 게임으로, review면 시작 화면으로. 판단은 호출부가 한다. */
  onFinish: () => void;
  /** 좌상단 X. 항상 시작 화면으로 돌아간다. */
  onExit: () => void;
}

export default function TutorialScreen({
  mode,
  preloadStatus,
  loadError,
  onRetryPreload,
  onFinish,
  onExit,
}: TutorialScreenProps) {
  const { t } = useLocale();
  const [pageIndex, setPageIndex] = useState(0);

  const pageKey = PAGE_KEYS[pageIndex];
  const isLastPage = pageIndex === PAGE_KEYS.length - 1;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      {/* 닫기는 타이틀바의 ✕가 맡는다 — 본문 좌상단에 두면 타이틀바와 겹친다. */}
      <PixelPanel
        size="card"
        title={t("window.brand")}
        onClose={onExit}
        closeAriaLabel={t("tutorial.exitAria")}
        className="max-w-md w-full relative"
      >
        <p className="text-xs text-muted text-center mb-2">
          {t("tutorial.progress", { current: pageIndex + 1, total: PAGE_KEYS.length })}
        </p>

        <h2 className="text-2xl font-bold text-center mb-4">
          {t(`tutorial.${pageKey}.title`)}
        </h2>

        {/*
          일러스트 자리. 로드맵 A단계(디자인 톤·아이콘)가 끝난 뒤 채운다.
          지금 비워두는 이유는 톤이 확정되기 전에 그리면 재작업이 되기 때문이다.
        */}
        <div className="w-full aspect-[4/3] mb-4 bg-black/20" aria-hidden="true" />

        <p className="text-sm text-left whitespace-pre-line mb-6 min-h-[6rem]">
          {t(`tutorial.${pageKey}.body`)}
        </p>

        <div className="flex gap-3 w-full">
          {pageIndex > 0 && (
            <button
              type="button"
              onClick={() => setPageIndex((i) => i - 1)}
              className="pixel-mask-btn-solid flex-1 py-3 px-4 bg-transparent border border-muted text-ink font-bold active:scale-95"
            >
              {t("tutorial.prevButton")}
            </button>
          )}

          {!isLastPage && (
            <button
              type="button"
              onClick={() => setPageIndex((i) => i + 1)}
              className="pixel-mask-btn-solid flex-1 py-3 px-4 bg-accent text-accent-ink font-bold active:scale-95"
            >
              {t("tutorial.nextButton")}
            </button>
          )}

          {isLastPage && mode === "review" && (
            <button
              type="button"
              onClick={onFinish}
              className="pixel-mask-btn-solid flex-1 py-3 px-4 bg-accent text-accent-ink font-bold active:scale-95"
            >
              {t("tutorial.closeButton")}
            </button>
          )}

          {/*
            onboarding의 마지막 페이지만 프리로드 상태를 반영한다.
            화면을 갈아끼우지 않고 이 버튼 자리 하나가 세 상태를 표현한다 —
            읽던 맥락이 사라지지 않게 하려는 의도적인 선택이다.
          */}
          {isLastPage && mode === "onboarding" && preloadStatus === "error" && (
            <button
              type="button"
              onClick={onRetryPreload}
              className="pixel-mask-btn-solid flex-1 py-3 px-4 bg-accent text-accent-ink font-bold active:scale-95"
            >
              {t("common.retry")}
            </button>
          )}

          {isLastPage && mode === "onboarding" && preloadStatus !== "error" && (
            <button
              type="button"
              onClick={onFinish}
              disabled={preloadStatus !== "ready"}
              className="pixel-mask-btn-solid flex-1 py-3 px-4 bg-accent text-accent-ink font-bold active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {preloadStatus === "ready" ? (
                t("tutorial.startButton")
              ) : (
                <>
                  <span className="animate-spin">🍚</span>
                  {t("tutorial.waiting")}
                </>
              )}
            </button>
          )}
        </div>

        {isLastPage && mode === "onboarding" && preloadStatus === "error" && loadError && (
          <p className="text-error text-sm mt-4">{t(loadError.key, loadError.params)}</p>
        )}
      </PixelPanel>
    </div>
  );
}

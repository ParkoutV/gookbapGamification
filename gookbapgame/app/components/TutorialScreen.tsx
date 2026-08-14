"use client";

import { useState } from "react";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { PreloadStatus } from "../hooks/useGameProgress";
import type { LoadError } from "../lib/preloadGame";
import type { GatchaLimitNotice } from "../lib/gatchaLimit";

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
  /**
   * 뽑기 횟수 제한 안내(마지막 장에 덧붙인다). 조회 실패거나 설정이 비정상이면 null이고
   * 그때는 줄을 넣지 않는다 — 판단은 `gatchaLimitNotice`가 하고 여기는 받기만 한다.
   */
  drawLimitNotice: GatchaLimitNotice | null;
}

export default function TutorialScreen({
  mode,
  preloadStatus,
  loadError,
  onRetryPreload,
  onFinish,
  onExit,
  drawLimitNotice,
}: TutorialScreenProps) {
  const { t } = useLocale();
  const [pageIndex, setPageIndex] = useState(0);

  const pageKey = PAGE_KEYS[pageIndex];
  const isLastPage = pageIndex === PAGE_KEYS.length - 1;

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-bg text-ink p-6">
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
          {/* 뽑기 횟수 제한은 **마지막 장(score)에만** 덧붙인다(2026-08-14, 이란토).
              그 장이 이미 쿠폰 얘기로 끝나므로 맥락이 이어지고, 새 장을 만들지 않아
              단계 수(3장)와 진행 표시가 그대로다.

              고지하는 이유: 두 번째 판부터는 설문 단계가 사라져 곧장 뽑기로 들어가는데
              화면이 그 규칙을 어디에서도 알려주지 않았다 — "설문을 안 했는데 카드가
              뽑힌다"는 제보가 여기서 나왔다.

              **설정을 못 읽으면 줄 자체를 넣지 않는다.** 틀린 횟수를 고지하는 것보다
              아무 말도 하지 않는 편이 낫다(`gatchaLimitNotice`가 null을 준다). */}
          {isLastPage && drawLimitNotice && (
            <>
              {"\n"}
              {t(drawLimitNotice.key, drawLimitNotice.params)}
            </>
          )}
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
              className="pixel-mask-btn-solid flex-1 py-3 px-4 bg-accent text-accent-ink font-bold active:scale-95 disabled:opacity-50"
            >
              {/* 아직 준비 중이면 문구만 바뀐다. 예전엔 회전하는 🍚를 앞에 뒀는데,
                  밥그릇 스피너를 걷어내면서 같이 뺐다(2026-08-11, 이란토).
                  여기에 로딩 바를 대신 넣지는 않는다 — .gatcha-loading__bar는 가로
                  전체 폭이라 버튼 안에서는 문구를 밀어낸다. 이 버튼은 disabled가
                  이미 "아직 못 누른다"를 말하고 있어 별도 표시가 없어도 된다. */}
              {preloadStatus === "ready" ? t("tutorial.startButton") : t("tutorial.waiting")}
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

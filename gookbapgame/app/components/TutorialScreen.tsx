"use client";

import { useEffect, useState } from "react";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { PreloadStatus } from "../hooks/useGameProgress";
import type { LoadError } from "../lib/preloadGame";
import type { GatchaLimitNotice } from "../lib/gatchaLimit";
import { TUTORIAL_SHOTS } from "../lib/tutorialShots";

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

  /* 세 장을 마운트 때 미리 받아둔다(합쳐 70KB). 장을 넘긴 뒤에 받기 시작하면 그
     동안 빈 박스가 보인다 — 아래 `key`가 낡은 비트맵을 지우기 때문에 **찌그러지는
     대신 비어 보이는** 것으로 증상이 바뀌므로, 그 빈 시간을 없애는 것이 여기 몫이다.

     실패는 그냥 둔다(`onerror`를 달지 않는다). 여기서 못 받아도 `<img>`가 제 몫을
     다시 받으므로 굳이 붙잡을 이유가 없고, 알림을 띄우면 그림 하나 때문에 튜토리얼이
     막힌다. 목록은 `TUTORIAL_SHOTS`에서 그대로 파생시킬 것 — 따로 적으면 장이
     늘었을 때 조용히 빠진다. */
  useEffect(() => {
    for (const preloaded of Object.values(TUTORIAL_SHOTS)) {
      // 참조를 붙잡는다(`preloadGame.ts`의 `loadImageInBrowser`와 같은 관용구) —
      // 버리면 로드가 끝나기 전에 GC 대상이 된다.
      const img = new Image();
      img.src = preloaded;
    }
  }, []);

  const pageKey = PAGE_KEYS[pageIndex];
  const isLastPage = pageIndex === PAGE_KEYS.length - 1;
  const shot = TUTORIAL_SHOTS[pageKey];

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh text-ink p-6 pb-[var(--footer-space)]">
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

        {/* 예시 이미지. 실제 게임 화면을 장마다 필요한 만큼만 잘라 쓴다 —
            애셋과 그 근거는 `docs/build-tutorial-assets.sh`.

            **상한 둘만 준다. 코드는 이미지 크기를 모른다**(2026-08-19, 이란토).
            브라우저가 파일에서 실제 크기를 읽어 비율을 적용하므로 `width`도
            `height`도 `aspect-ratio`도 필요 없다 — 애셋을 갈아끼우면 그걸로 끝이다.
            예전에는 장마다 크롭 비율을 `tutorialShots.ts`에 숫자로 적어두고
            `aspect-ratio` + 폭 상한(`높이 상한 × 비율`)을 계산했는데, **그림을 다시
            만들 때마다 그 숫자를 같이 고쳐야 했다** — 안 고치면 조용히 납작해진다.
            비율 상수를 되살리지 말 것.

            **`max-height`는 비율을 깨뜨리지 않는다.** 비율이 깨지는 것은 `width`와
            `height`를 둘 다 확정값으로 줄 때뿐이고, 상한에 걸리면 대체 요소 규칙에
            따라 브라우저가 **폭을 다시 계산해** 비율을 유지한다. 이 화면이 옛날에
            숫자를 필요로 했던 것은 `aspect-ratio`로 만든 **빈 상자**에
            `object-contain`으로 담았기 때문이다 — 상자는 그림이 아니라 자기 비율을
            알 수 없다. 그림 자체에 상한을 걸면 알려줄 것이 없다.

            50dvh는 이미지에 관한 사실이 아니라 "화면 절반까지만 쓴다"는 디자인
            결정이다. 없으면 390px 폰에서 패널이 뷰포트를 150px 넘겨 스크롤된다
            (지금 애셋 630×953 기준 실측).

            래퍼의 `justify-center`는 상한에 걸려 폭이 줄었을 때 왼쪽으로 붙는 것을
            막는 몫이다.

            장식이 아니라 설명의 일부지만 **본문 문구가 같은 내용을 이미 말하고 있어**
            `aria-hidden`으로 둔다 — 스크린리더에 그림 설명을 중복으로 읽히지 않는다.

            **`key`를 빼지 말 것**(2026-08-17, 이란토 제보). 없으면 React가 같은
            `<img>`를 재사용해 `src`만 갈아끼우는데, 브라우저는 새 그림이 도착할
            때까지 **이전 비트맵을 계속 그린다.** `key`가 있으면 언마운트되어 낡은
            비트맵이 존재할 수 없다.

            **로드 완료까지 버튼을 막는 쪽은 택하지 않았다.** 404거나 `onLoad`가
            오지 않으면 버튼이 영구히 죽어 튜토리얼을 빠져나갈 수 없다. */}
        {shot && (
          <div className="flex justify-center mb-4">
            <img
              key={pageKey}
              src={shot}
              alt=""
              aria-hidden="true"
              className="max-w-full max-h-[50dvh]"
            />
          </div>
        )}

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

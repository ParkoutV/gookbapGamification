"use client";

import { useEffect, useState } from "react";
import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { LoadError } from "../lib/preloadGame";
import {
  BRAND_LINE_KEYS,
  INTRO_SLIDES,
  INTRO_SLIDE_FADE_MS,
  INTRO_SLIDE_INTERVAL_MS,
} from "../lib/introSlides";

/** 슬라이드 영역 높이. 세 장의 비율이 달라 고정 높이 + object-contain이 필요하다.
    `vh`가 아니라 `dvh`인 것은 브라우저 툴바 때문이다(AGENTS.md의 전용 절). */
const SLIDE_H = "min(180px, 22dvh)";

interface PreloadScreenProps {
  loadError: LoadError | null;
  onRetry: () => void;
  /**
   * 시작 화면으로 빠져나간다. **에러 화면에 반드시 있어야 한다**(2026-08-15 이란토 제보).
   *
   * 예전에는 '다시 시도'뿐이라, DB 장애처럼 재시도해도 계속 실패하는 상황에서
   * **사용자가 이 화면에 갇혔다** — 뒤로 가기도 SPA라 소용이 없다. 랭킹·쿠폰 보관함은
   * 서버가 죽어도 볼 수 있으므로 시작 화면으로 돌려보내는 것이 실제로 의미가 있다.
   */
  onGoToStart: () => void;
}

export default function PreloadScreen({ loadError, onRetry, onGoToStart }: PreloadScreenProps) {
  const { t } = useLocale();

  /* 소개글은 **마운트 시 한 번 뽑아 고정**한다("이미지는 순환하며, 글은 고정된다").
     렌더 본문에서 Math.random()을 부르면 슬라이드가 바뀔 때마다 글도 바뀐다.
     `phase`의 초기값이 "start"라 이 화면은 SSR에 포함되지 않으므로
     lazy initializer의 난수가 하이드레이션 불일치를 만들지 않는다. */
  const [lineKey] = useState(
    () => BRAND_LINE_KEYS[Math.floor(Math.random() * BRAND_LINE_KEYS.length)]
  );
  const [slide, setSlide] = useState(() => Math.floor(Math.random() * INTRO_SLIDES.length));

  useEffect(() => {
    // 에러 화면에는 슬라이드가 없다 — 타이머도 돌 이유가 없다.
    if (loadError) return;
    const id = setInterval(
      () => setSlide((i) => (i + 1) % INTRO_SLIDES.length),
      INTRO_SLIDE_INTERVAL_MS
    );
    return () => clearInterval(id);
  }, [loadError]);

  return (
    /* 로딩 중일 때만 status다(GatchaLoading과 같은 이유 — 로딩 바가 aria-hidden이라
       문구만이 유일한 안내이고, 그것이 보조기기에 전달되려면 live region이어야 한다).
       에러는 alert으로 올린다: 사용자가 조치해야 하는 상황이라 polite하게 끼워넣을
       것이 아니고, 실제로 읽을 것도 재시도 버튼이 딸린 에러 문구다. */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg"
      role={loadError ? "alert" : "status"}
      aria-live={loadError ? "assertive" : "polite"}
    >
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full mx-4 text-center">
        {loadError ? (
          <>
            <p className="text-error mb-6 text-lg">{t(loadError.key, loadError.params)}</p>
            <button
              onClick={onRetry}
              className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
            >
              {t("common.retry")}
            </button>
            {/* **탈출구.** 재시도해도 계속 실패하는 상황(DB 장애 등)에서 이것이 없으면
                사용자가 이 화면에 갇힌다 — SPA라 뒤로 가기도 듣지 않는다.
                주 행동은 '다시 시도'이므로 이쪽은 보조 스타일로 둔다. */}
            <button
              onClick={onGoToStart}
              className="mt-3 w-full py-2 px-6 text-sm text-muted underline underline-offset-2"
            >
              {t("dailyResult.restartButton")}
            </button>
          </>
        ) : (
          <>
            {/* 슬라이드는 장식이고, 무엇보다 바깥이 role="status" aria-live라
                순환할 때마다 live region이 울린다 — aria-hidden이 맞다.
                세 장을 전부 DOM에 올려 겹쳐두고 opacity만 바꾼다: <img> 하나의
                src를 갈아끼우면 교체할 때마다 빈 프레임이 보인다.
                고정 높이 + object-contain이라 비율이 다른 장으로 바뀌어도
                창 높이가 출렁이지 않는다(rankingLayout.ts와 같은 함정). */}
            <div
              className="relative w-full mb-4"
              style={{ height: SLIDE_H }}
              aria-hidden="true"
            >
              {INTRO_SLIDES.map((src, i) => (
                /* eslint-disable-next-line @next/next/no-img-element -- static local intro
                   asset, already size-capped in the repo */
                <img
                  key={src}
                  src={src}
                  alt=""
                  /* 지금 보이는 장만 급하다. 이 화면은 게임 이미지 14장을 동시에 받는
                     중이라(`preloadGame.ts`의 동시성 4), 세 장을 다 급하게 받으면
                     정작 로딩 화면이 늦게 그려진다 — 빨리 떠야 할 화면이 느려지는
                     자충수다. 나머지 두 장은 3초 뒤에나 필요하다. */
                  fetchPriority={i === slide ? "high" : "low"}
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{
                    opacity: i === slide ? 1 : 0,
                    transition: `opacity ${INTRO_SLIDE_FADE_MS}ms ease-in-out`,
                  }}
                />
              ))}
            </div>
            {/* 뽑기 대기(GatchaLoading의 waiting)와 같은 로딩 바다 — 게임 안에서
                "서버를 기다리는 화면"은 전부 같은 모양이어야 한다(2026-08-11, 이란토).
                진행률이 아니라 무한 반복이므로 aria로 값을 주지 않는다. 바깥
                role="status"의 문구가 유일한 안내다. */}
            <div className="gatcha-loading__bar" aria-hidden="true" />
            <p className="text-ink text-lg font-bold">{t("preload.preparing")}</p>
            {/* 소개글에는 fade가 없다 — 프리워밍이 성공해 로딩이 200ms 만에
                끝나도 "깜빡이고 사라지는" 인상이 남지 않아야 한다. 첫 페인트부터
                완전히 보이는 글은 애초에 깜빡일 수 없다. */}
            <p className="text-ink text-sm mt-3">{t(lineKey)}</p>
          </>
        )}
      </PixelPanel>
    </div>
  );
}

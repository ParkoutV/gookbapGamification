"use client";

import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { LoadError } from "../lib/preloadGame";

interface PreloadScreenProps {
  loadError: LoadError | null;
  onRetry: () => void;
}

export default function PreloadScreen({ loadError, onRetry }: PreloadScreenProps) {
  const { t } = useLocale();

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
          </>
        ) : (
          <>
            {/* 뽑기 대기(GatchaLoading의 waiting)와 같은 로딩 바다 — 게임 안에서
                "서버를 기다리는 화면"은 전부 같은 모양이어야 한다(2026-08-11, 이란토).
                진행률이 아니라 무한 반복이므로 aria로 값을 주지 않는다. 바깥
                role="status"의 문구가 유일한 안내다. */}
            <div className="gatcha-loading__bar" aria-hidden="true" />
            <p className="text-ink text-lg font-bold">{t("preload.preparing")}</p>
          </>
        )}
      </PixelPanel>
    </div>
  );
}

"use client";

import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";

/**
 * 쿠폰 발급(draw API)을 기다리는 동안 띄우는 오버레이.
 *
 * **PreloadScreen과 같은 모양·같은 구조다**(2026-08-11, 이란토). 화면 전체를 덮는
 * 창 하나에 아이콘과 문구만 올리는 형태로, 게임 안의 "기다리는 화면"은 전부 이
 * 형태로 통일한다.
 *
 * 카드가 놓일 자리에 인라인으로 넣지 않는 이유: 그러면 로딩 박스를 카드와 같은
 * 크기로 맞춰야 하고(안 그러면 전환 때 패널이 밀린다), 작은 아이콘 하나를 위해
 * 464px짜리 빈 상자를 띄우게 된다. 별도 레이어로 띄우면 그 제약이 통째로 사라진다.
 */
export default function GatchaLoading() {
  const { t } = useLocale();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg"
      role="status"
      aria-live="polite"
    >
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full mx-4 text-center">
        {/*
          애니메이션 WebP 한 장(250x250, 30ms x 14프레임, 무한 반복).
          <img>라 재생 제어가 없고 그래서 코드도 없다.

          prefers-reduced-motion에서는 CSS가 이걸 감추고 정지 이미지로 바꾼다 —
          애니메이션 WebP는 CSS로 멈출 수 없어서 파일을 갈아끼우는 수밖에 없다.
          정지본은 애니메이션의 첫 프레임이며, 원본을 다시 만들면 이것도 같이
          뽑아야 한다(원본: 기획 폴더 gfx/assets/icon_card/animation/).
        */}
        <img
          src="/icons/card-shuffle.webp"
          alt=""
          aria-hidden="true"
          className="gatcha-loading__anim"
        />
        <img
          src="/icons/card-shuffle-static.webp"
          alt=""
          aria-hidden="true"
          className="gatcha-loading__static"
        />
        <p className="text-ink text-lg font-bold">{t("wheel.spinning")}</p>
      </PixelPanel>
    </div>
  );
}

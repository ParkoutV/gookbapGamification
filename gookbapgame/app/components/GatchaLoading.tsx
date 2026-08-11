"use client";

import { useLocale } from "../lib/i18n/LocaleContext";

/**
 * 쿠폰 발급(draw API)을 기다리는 동안의 연출.
 *
 * **카드와 정확히 같은 크기의 박스를 차지해야 한다.** 그래야 로딩이 끝나고 카드가
 * 들어올 때 레이아웃이 밀리지 않는다 — 예전에는 이 자리를 카드 뒷면으로 채워
 * 시프트를 막았는데, 응답 전에도 카드가 이미 나와 있어서 "눌러도 안 뒤집히는 카드"가
 * 되는 문제가 있었다(2026-08-11, 이란토). 그래서 크기 확보라는 역할만 이 컴포넌트가
 * 이어받고, 보이는 것은 로딩 연출로 바꾼다.
 *
 * 그래서 aspect-ratio는 `.gatcha-card`와 같은 값이어야 하고, 폭 계산식도 같아야 한다.
 * 한쪽만 바꾸면 전환 순간에 화면이 덜컥인다.
 */
export default function GatchaLoading() {
  const { t } = useLocale();

  return (
    <div className="gatcha-loading" role="status" aria-live="polite">
      {/*
        애니메이션 WebP 한 장. <img>라 재생 제어가 없고 그래서 코드도 없다.
        prefers-reduced-motion에서는 CSS가 이걸 감추고 정지 이미지로 바꾼다 —
        애니메이션 WebP는 CSS로 멈출 수 없어서 파일을 갈아끼우는 수밖에 없다.
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
      {/* GatchaCard가 "뽑는 중" 안내로 쓰던 키를 그대로 쓴다 — 응답 대기 안내가
          카드 밖으로 옮겨온 것이라 문구가 새로 필요하지 않다. */}
      <p className="gatcha-loading__label">{t("wheel.spinning")}</p>
    </div>
  );
}

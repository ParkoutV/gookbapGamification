"use client";

import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";

/**
 * 뽑기 화면의 기다리는 오버레이. **성격이 다른 두 단계가 같은 창을 쓴다.**
 *
 * - `variant="waiting"`(1단계): 서버 응답 대기. 결과를 아직 모르므로 중립적인
 *   가로 로딩 바 + "잠시만 기다려 주세요"만 띄운다.
 * - `variant="shuffle"`(2단계): 쿠폰이 실제로 발급된 뒤 재생하는 연출.
 *   카드 섞기 애니메이션 + "카드를 섞고 있어요".
 *
 * **문구와 그림만 갈아끼우고 창 껍데기(오버레이·PixelPanel·role)는 공유한다.**
 * 단계마다 별도 컴포넌트를 두면 1→2 전환에서 Win9x 창의 크기·위치가 눈에 띄게
 * 튄다 — 사용자에게는 한 창이 내용만 바꾸는 것으로 보여야 한다.
 *
 * "카드를 섞고 있어요"를 1단계에 쓰지 않는 이유: 그 문구는 결과가 나오기 **전에**
 * 떠서, 뽑기 기회가 없어 서버가 거절할 사람에게도 똑같이 보인다. 괜히 기대하게
 * 만든다는 실제 제보가 있었다(2026-08-11).
 *
 * **PreloadScreen과 같은 모양·같은 구조다**(2026-08-11, 이란토). 화면 전체를 덮는
 * 창 하나에 아이콘과 문구만 올리는 형태로, 게임 안의 "기다리는 화면"은 전부 이
 * 형태로 통일한다. `waiting`의 로딩 바(`.gatcha-loading__bar`)는 PreloadScreen도
 * 그대로 쓴다 — 한쪽 CSS를 고치면 양쪽이 같이 바뀐다는 뜻이다.
 *
 * 카드가 놓일 자리에 인라인으로 넣지 않는 이유: 그러면 로딩 박스를 카드와 같은
 * 크기로 맞춰야 하고(안 그러면 전환 때 패널이 밀린다), 작은 아이콘 하나를 위해
 * 464px짜리 빈 상자를 띄우게 된다. 별도 레이어로 띄우면 그 제약이 통째로 사라진다.
 */
export default function GatchaLoading({
  variant,
}: {
  variant: "waiting" | "shuffle";
}) {
  const { t } = useLocale();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg"
      role="status"
      aria-live="polite"
    >
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full mx-4 text-center">
        {variant === "shuffle" ? (
          <>
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
          </>
        ) : (
          /* 진행률이 아니라 무한 반복이다 — 서버 응답이 언제 올지 모르므로
             채워지는 게이지를 흉내내면 거짓말이 된다. 그래서 aria로도 값을
             주지 않고, 바깥 role="status"의 문구가 유일한 안내다. */
          <div className="gatcha-loading__bar" aria-hidden="true" />
        )}
        <p className="text-ink text-lg font-bold">
          {t(variant === "shuffle" ? "wheel.spinning" : "wheel.waiting")}
        </p>
      </PixelPanel>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import CouponQR from "./CouponQR";
import { MISS_EMOJI, resolveCouponEmoji } from "../lib/couponEmoji";
import { playSfx, SFX } from "../lib/sfx";
import type { IssuedCoupon } from "../actions";

/**
 * 밝은 카드면 위의 글자색. 현재 테마의 --ink와 같은 값이지만 **상수로 남긴다** —
 * cardImage.ts가 canvas에 같은 글자를 그릴 때 리터럴이 필요하고(CSS 변수를 못 읽는다),
 * 두 곳이 반드시 같은 값이어야 화면과 저장본이 어긋나지 않기 때문이다.
 * 테마가 다시 어두워지면 --ink는 밝아져도 이 값은 어두운 채로 남아야 한다.
 */
const CARD_FACE_INK = "#1A1F24";

interface GatchaCardProps {
  /** null이면 꽝 앞면. 뒷면만 보이는 동안에도 null일 수 있다. */
  coupon: IssuedCoupon | null;
  flipped: boolean;
  /** 아직 뒤집을 수 없는 상태(draw 응답 대기)면 false. */
  canFlip: boolean;
  onFlip: () => void;
  /**
   * 앞면을 감싸는 레이어에 꽂힌다. 저장 이미지를 굽는 쪽(`useCardImageSave`)이
   * 여기서 QR `<svg>`를 찾아간다 — 버튼은 부모에 있고 소재는 여기 있어서 필요하다.
   */
  faceRef?: React.Ref<HTMLDivElement>;
  /** 이미 지역화된 만료 안내 문구. 저장 이미지와 같은 값을 써야 화면과 저장본이 맞는다. */
  expiryText: string | null;
}

export default function GatchaCard({
  coupon,
  flipped,
  canFlip,
  onFlip,
  faceRef,
  expiryText,
}: GatchaCardProps) {
  const { t } = useLocale();

  // 코너 마크. 상품명 앞에도 같은 이모지를 붙이면 한 화면에 셋이 되어 산만해지므로
  // 이모지는 코너에만 두고 상품명은 텍스트만 남긴다(CouponQR의 onLightFace).
  const faceEmoji = coupon ? resolveCouponEmoji(coupon.couponType) : MISS_EMOJI;

  // 뒤집는 동작 자체의 소리. 결과 소리는 아래 effect가 한 박자 늦게 낸다.
  const handleFlip = () => {
    playSfx(SFX.touch);
    onFlip();
  };

  /**
   * 결과 소리는 카드가 실제로 돌아간 뒤에 낸다. 탭하자마자 내면 앞면이 보이기도
   * 전에 당첨/꽝이 소리로 새어나간다. 지연은 뒤집기 트랜지션(700ms)의 후반부다.
   *
   * **최초 1회만 낸다.** 카드는 몇 번이든 다시 뒤집을 수 있는데(2026-08-11),
   * 앞면으로 돌 때마다 당첨 소리가 울리면 시끄럽고 "또 당첨됐나" 하는 오해도 준다.
   * 결과를 알리는 소리는 결과가 처음 드러나는 순간에만 의미가 있다.
   */
  const resultSoundPlayedRef = useRef(false);
  useEffect(() => {
    if (!flipped || resultSoundPlayedRef.current) return;
    resultSoundPlayedRef.current = true;
    const timer = setTimeout(() => {
      playSfx(coupon ? SFX.coupon : SFX.couponLose);
    }, 450);
    return () => clearTimeout(timer);
  }, [flipped, coupon]);

  return (
    /* w-full이 필요하다. items-center 아래에서는 이 래퍼가 shrink-to-fit이 되어
       폭이 내용물에 맞춰지는데, 그러면 .gatcha-card의 width: min(100%, ...)에서
       100%가 기준을 잃고 카드가 패널 밖으로 넘친다. */
    <div className="flex flex-col items-center gap-4 w-full">
      {/* 원본 애셋 비율 1000x1350. aspect-ratio로 고정해야 뒷면 픽셀이 찌그러지지 않는다. */}
      {/* 뒤집은 뒤에도 계속 눌러 앞뒤를 오갈 수 있다(2026-08-11, 이란토) — 그래서
          예전과 달리 flipped를 조건에서 뺐다. 아직 뒤집을 수 없는 동안(canFlip=false)에만
          role/tabIndex를 통째로 뗀다. 이름 없는 button으로 남겨두면 스크린리더가
          정체불명의 버튼으로 읽고, tabIndex={-1}은 포커스를 빼앗는다. */}
      <div
        className={`gatcha-card${canFlip ? " gatcha-card--interactive" : ""}`}
        {...(canFlip
          ? {
              role: "button" as const,
              tabIndex: 0,
              "aria-label": t("wheel.flipHint"),
              onClick: handleFlip,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleFlip();
                }
              },
            }
          : {})}
      >
        <div className={`gatcha-card__inner${flipped ? " gatcha-card__inner--flipped" : ""}`}>
          {/* 뒷면 */}
          <div className="gatcha-card__face">
            {/* eslint-disable-next-line @next/next/no-img-element -- static local pixel-art asset,
                next/image would resample it and defeat image-rendering: pixelated */}
            <img
              src="/icons/card-back.webp"
              alt=""
              className="w-full h-full object-contain select-none pointer-events-none"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          {/* 앞면도 뒷면과 같은 1000x1371 픽셀 애셋을 깐다. 밝은 카드면이라
              테마의 --ink(어두운 배경용 밝은 색)를 그대로 쓰면 글자가 보이지 않는다.
              HintClipboard가 같은 이유로 PAPER_INK를 따로 둔 것과 같은 상황이다. */}
          <div className="gatcha-card__face gatcha-card__face--front">
            {/* eslint-disable-next-line @next/next/no-img-element -- static local pixel-art asset,
                next/image would resample it and defeat image-rendering: pixelated */}
            <img
              src="/icons/card-front.webp"
              alt=""
              className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
              style={{ imageRendering: "pixelated" }}
            />
            {/* 강제 다크모드 방어는 여기가 아니라 layout.tsx의 <meta name="darkreader-lock">에
                있다. Darkreader에는 서브트리만 제외하는 수단이 없어서(실측: 존재한다고 알려진
                data-darkreader-ignore 속성은 실제 코드에 없고, color-scheme도 무시된다)
                페이지 전체를 잠그는 쪽이 유일하게 동작한다. */}
            <div
              className="absolute inset-0 card-face-fixed-colors"
              ref={faceRef}
              style={{ color: CARD_FACE_INK }}
            >
              {/* 트럼프 카드처럼 안쪽 테두리를 하나 두고 내용을 그 안에 담는다.
                  좌상/우하 모서리는 정사각으로 파여 있고, 그 자리에 코너 마크가 앉는다.
                  **테두리 선 자체는 애셋(card-front.webp)에 인쇄돼 있다** — 이 요소는
                  내용물을 그 안쪽에 가두는 자리 잡기만 한다(2026-08-11). */}
              <div className="card-inner-frame absolute inset-x-[13%] inset-y-[11%]">
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-3 overflow-hidden">
                  {coupon ? (
                    <>
                      <CouponQR coupon={coupon} onLightFace />
                      {expiryText && <p className="text-sm opacity-70">{expiryText}</p>}
                    </>
                  ) : (
                    <>
                      <p className="font-extrabold text-lg">{t("wheel.missTitle")}</p>
                      <p className="text-sm text-center opacity-70">{t("wheel.missDescription")}</p>
                    </>
                  )}
                </div>
              </div>

              {/* 코너 마크는 애셋에 파인 자리에 앉는다. card-inner-frame의 자식이
                  아니라 형제 레이어인 것은 예전에 그쪽 clip-path에 잘렸기 때문인데,
                  clip-path가 사라진 지금도 형제로 둔다 — 안에 넣으면 본문 flex 흐름에
                  끼어 중앙 정렬을 흐트러뜨린다.
                  inset은 테두리와 같은 값이어야 위치가 맞는다.
                  실제 트럼프 카드는 우하단을 180° 돌리지만, 이모지를 뒤집으면
                  거꾸로 선 그림이 될 뿐이라 회전은 하지 않는다. */}
              <div className="absolute inset-x-[13%] inset-y-[11%] pointer-events-none card-corner-layer">
                <span aria-hidden="true" className="card-corner-mark card-corner-mark--tl text-2xl">
                  {faceEmoji}
                </span>
                <span aria-hidden="true" className="card-corner-mark card-corner-mark--br text-2xl">
                  {faceEmoji}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 눌러보라는 손 커서. 아직 안 뒤집었을 때만 띄운다.
            **__inner 안에 넣으면 안 된다** — 그쪽은 preserve-3d 컨텍스트라
            카드와 함께 회전해서 뒤집는 순간 커서도 뒤집힌다. 카드 루트의 직속
            자식으로 두어 3D 변환 바깥에 남긴다. */}
        {canFlip && !flipped && (
          /* eslint-disable-next-line @next/next/no-img-element -- static local pixel-art asset,
             next/image would resample it and defeat image-rendering: pixelated */
          <img src="/icons/cursor-hint.webp" alt="" aria-hidden="true" className="cursor-hint" />
        )}
      </div>

      {/* 뒤집기 전에만 안내. 뒤집은 뒤에도 남아 있으면 또 누르라는 뜻으로 읽힌다. */}
      {!flipped && (
        <p className="text-muted text-sm">{canFlip ? t("wheel.flipHint") : t("wheel.spinning")}</p>
      )}

      {/* 저장 버튼은 여기 없다 — WheelScreen 하단에서 '다음'과 한 줄을 나눠 쓴다.
          카드 바로 밑에 두면 '다음'과 멀리 떨어져 둘의 관계가 드러나지 않고,
          같은 행에서 폭을 나누는 연출도 불가능하다. */}
    </div>
  );
}

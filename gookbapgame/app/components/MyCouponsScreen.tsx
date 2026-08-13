"use client";

import { useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import PixelPanel from "./PixelPanel";
import GatchaCard from "./GatchaCard";
import { useCardImageSave } from "../hooks/useCardImageSave";
import type { IssuedCoupon } from "../actions";
import { isCouponExpired } from "../lib/couponUsability";
import { couponDateLines } from "../lib/couponDates";

/**
 * 내 쿠폰 앨범.
 *
 * **격자로 뒷면을 늘어놓고, 누르면 그 카드를 앞면으로 보여준다**(2026-08-13, 이란토).
 * 예전에는 게시판처럼 한 줄씩 나열하고 'QR 코드 보기' 토글로 QR만 펼쳤는데, 뽑기
 * 직후가 아니면 **카드 형식으로 다시 볼 수 없고 이미지 저장 기회도 한 번뿐**이었다.
 * instagram·Google Photos 식 앨범이 그 두 가지를 함께 해결한다.
 *
 * 뒷면은 모든 쿠폰이 같은 그림이므로 **아래 쿠폰명이 유일한 식별자다.**
 *
 * - `WheelScreen`과 공통 컴포넌트로 묶지 않았다. 저쪽은 섞기 연출·draw 응답 4종
 *   분기·'다음' 게이트를 들고 있고 여기는 하나도 필요 없다. 실제로 겹치는 것은
 *   `GatchaCard`와 `useCardImageSave` 두 조각이고, 그것들을 각자 조립하는 편이 짧다.
 * - **`useCardImageSave`는 훅이라 `map` 안에서 부를 수 없다.** 그래서 격자 칸은 순수
 *   `<img>`이고, 훅 인스턴스는 이 컴포넌트에 **하나**만 두고 열린 쿠폰(`openCouponId`)에
 *   물린다. 칸마다 저장 버튼을 두는 구조로 바꾸려면 칸을 별도 컴포넌트로 떼야 한다.
 */
export default function MyCouponsScreen({
  coupons,
  onClose,
}: {
  coupons: IssuedCoupon[];
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const [openCouponId, setOpenCouponId] = useState<string | null>(null);

  const openCoupon = coupons.find((c) => c.couponId === openCouponId) ?? null;

  const stampFor = (coupon: IssuedCoupon): string | null => {
    if (coupon.isUsed) return t("coupon.usedBadge");
    if (isCouponExpired(coupon)) return t("coupon.expiredBadge");
    return null;
  };

  /*
   * 열린 카드의 날짜·도장. **`GatchaCard`와 `useCardImageSave`가 같은 값을 받아야
   * 한다** — 양쪽이 각자 만들면 화면과 저장본이 조용히 달라진다(카드 앞면에서 여러 번
   * 난 사고다).
   */
  const dateLines = openCoupon ? couponDateLines(openCoupon, locale, t) : [];
  const usedStamp = openCoupon ? stampFor(openCoupon) : null;

  /*
   * `flipped`를 항상 true로 준다 — 앨범은 이미 아는 결과를 다시 보는 자리라 뒤집기
   * 연출이 필요 없고, 이 값이 저장 이미지 미리 굽기(iOS 제스처 제약)의 방아쇠다.
   * `announceResult={false}`가 당첨 효과음을 막는다(그쪽 prop 주석 참고).
   */
  const { faceRef, save, saving, saveError } = useCardImageSave(
    openCoupon,
    true,
    locale,
    dateLines,
    usedStamp
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-bg text-ink p-6">
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full">
        <h1 className="text-2xl font-extrabold mb-6 text-ink text-center">
          {t("coupon.myCouponsTitle")}
        </h1>

        {coupons.length === 0 && <p className="text-muted text-center mb-6">{t("coupon.empty")}</p>}

        {openCoupon ? (
          <div className="flex flex-col items-center gap-4 mb-6 w-full">
            <GatchaCard
              coupon={openCoupon}
              flipped
              canFlip={false}
              onFlip={() => {}}
              faceRef={faceRef}
              dateLines={dateLines}
              announceResult={false}
              usedStamp={usedStamp}
            />

            {/* 뽑기 화면과 달리 '이미지로 저장'과 '닫기'를 처음부터 함께 둔다 —
                저쪽이 '다음'을 숨기는 이유는 넘어가면 그 카드를 다시 볼 수 없기
                때문인데, 여기서는 격자로 돌아와 언제든 다시 열 수 있다. */}
            <div className="flex w-full gap-2">
              <button
                onClick={() => save()}
                disabled={saving}
                className="pixel-mask-btn-solid flex-1 py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50"
              >
                {saving ? t("card.saving") : t("card.saveButton")}
              </button>
              <button
                onClick={() => setOpenCouponId(null)}
                className="pixel-mask-btn-solid py-3 px-5 bg-surface text-ink font-bold transition-opacity active:scale-95"
              >
                {t("coupon.backToAlbum")}
              </button>
            </div>
            {saveError && <p className="text-error text-xs">{t("card.saveError")}</p>}
          </div>
        ) : (
          /* 2열 격자. `max-w-sm` 패널 안쪽에서 칸이 약 140px이 되어 아래 쿠폰명이
             한두 줄로 앉는다 — 3열은 이름이 들어갈 폭이 없다. */
          <div className="grid grid-cols-2 gap-3 mb-6">
            {coupons.map((coupon) => {
              const unusable = coupon.isUsed || isCouponExpired(coupon);
              const stamp = stampFor(coupon);

              return (
                <button
                  key={coupon.couponId}
                  onClick={() => setOpenCouponId(coupon.couponId)}
                  className={`flex flex-col items-center gap-1 bg-transparent border-0 p-0 text-left ${
                    unusable ? "opacity-40" : ""
                  }`}
                >
                  {/* 격자 칸은 `.gatcha-card`를 쓰지 않는다 — 그쪽은 뒤집기용
                      perspective·3D·트랜지션을 들고 있고 여기 필요한 것은 비율뿐이다. */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- static local pixel-art asset,
                      next/image would resample it and defeat image-rendering: pixelated */}
                  <img
                    src="/icons/card-back.webp"
                    alt=""
                    aria-hidden="true"
                    className="w-full select-none"
                    style={{ aspectRatio: "1000 / 1371", imageRendering: "pixelated" }}
                  />
                  {/* 이름·상태를 고정 높이 블록에 담는다. 이름 길이가 1줄/2줄로 갈리면
                      행마다 칸 높이가 달라져 격자가 들쭉날쭉해진다(실물로 확인).
                      2줄(leading-tight 기준 약 2rem) + 상태 한 줄이 들어가는 크기다. */}
                  <span className="flex flex-col items-center justify-start h-12 gap-0.5">
                    <span className="text-xs font-bold text-ink text-center leading-tight line-clamp-2">
                      {resolveLocalizedName(coupon.couponType, locale)}
                    </span>
                    {stamp && <span className="text-xs text-muted">{stamp}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={onClose}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("coupon.closeButton")}
        </button>
      </PixelPanel>
    </div>
  );
}

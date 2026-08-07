"use client";

import { useLocale } from "../lib/i18n/LocaleContext";
import CouponQR from "./CouponQR";
import { MISS_EMOJI } from "../lib/couponEmoji";
import { DATE_LOCALES } from "../lib/i18n/dateLocales";
import type { IssuedCoupon } from "../actions";

/** 밝은 카드면 위의 글자색. 테마의 --ink는 어두운 배경용 밝은 색이라 여기서는 안 보인다. */
const CARD_FACE_INK = "#3A2E24";

interface GatchaCardProps {
  /** null이면 꽝 앞면. 뒷면만 보이는 동안에도 null일 수 있다. */
  coupon: IssuedCoupon | null;
  flipped: boolean;
  /** 아직 뒤집을 수 없는 상태(draw 응답 대기)면 false. */
  canFlip: boolean;
  onFlip: () => void;
}

export default function GatchaCard({ coupon, flipped, canFlip, onFlip }: GatchaCardProps) {
  const { t, locale } = useLocale();

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 원본 애셋 비율 1000x1350. aspect-ratio로 고정해야 뒷면 픽셀이 찌그러지지 않는다. */}
      <div
        className="gatcha-card"
        onClick={() => canFlip && !flipped && onFlip()}
        role="button"
        tabIndex={flipped ? -1 : 0}
        aria-label={flipped ? undefined : t("wheel.flipHint")}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && canFlip && !flipped) {
            e.preventDefault();
            onFlip();
          }
        }}
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
            <div
              className="absolute inset-[9%] flex flex-col items-center justify-center gap-3 overflow-hidden"
              style={{ color: CARD_FACE_INK }}
            >
              {coupon ? (
                <>
                  <CouponQR coupon={coupon} showEmoji />
                  {coupon.expiredAt && (
                    <p className="text-xs opacity-70">
                      {t("coupon.expiresAt", {
                        date: new Date(coupon.expiredAt).toLocaleDateString(
                          DATE_LOCALES[locale] ?? "en-US"
                        ),
                      })}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="text-5xl">
                    {MISS_EMOJI}
                  </span>
                  <p className="font-extrabold">{t("wheel.missTitle")}</p>
                  <p className="text-sm text-center opacity-70">{t("wheel.missDescription")}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 뒤집기 전에만 안내. 뒤집은 뒤에도 남아 있으면 또 누르라는 뜻으로 읽힌다. */}
      {!flipped && (
        <p className="text-muted text-sm">{canFlip ? t("wheel.flipHint") : t("wheel.spinning")}</p>
      )}
    </div>
  );
}

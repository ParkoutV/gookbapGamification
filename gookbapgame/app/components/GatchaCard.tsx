"use client";

import { useRef, useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import CouponQR from "./CouponQR";
import { MISS_EMOJI, resolveCouponEmoji } from "../lib/couponEmoji";
import { DATE_LOCALES } from "../lib/i18n/dateLocales";
import { renderCardImage } from "../lib/cardImage";
import { saveOrShareImage } from "../lib/shareCard";
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

  const faceRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // 코너 마크. 상품명 앞에도 같은 이모지를 붙이면 한 화면에 셋이 되어 산만해지므로
  // 이모지는 코너에만 두고 상품명은 텍스트만 남긴다(CouponQR의 onLightFace).
  const faceEmoji = coupon ? resolveCouponEmoji(coupon.couponType) : MISS_EMOJI;

  const expiryText =
    coupon?.expiredAt != null
      ? t("coupon.expiresAt", {
          date: new Date(coupon.expiredAt).toLocaleDateString(DATE_LOCALES[locale] ?? "en-US"),
        })
      : null;

  // navigator.share는 사용자 제스처 안에서 불러야 해서 클릭 핸들러가 끝까지 await 한다.
  const handleSave = async () => {
    if (!coupon || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      const blob = await renderCardImage({
        qrSvg: faceRef.current?.querySelector("svg") ?? null,
        couponName: resolveLocalizedName(coupon.couponType, locale),
        expiryText,
        emoji: faceEmoji,
      });
      const result = await saveOrShareImage(blob, `coupon-${coupon.couponId}.png`);
      if (result === "failed") setSaveError(true);
    } catch (error) {
      console.error("[GatchaCard] 카드 이미지 저장 실패:", error);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 원본 애셋 비율 1000x1350. aspect-ratio로 고정해야 뒷면 픽셀이 찌그러지지 않는다. */}
      <div
        className={`gatcha-card${canFlip && !flipped ? " gatcha-card--interactive" : ""}`}
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
            <div className="absolute inset-0" ref={faceRef} style={{ color: CARD_FACE_INK }}>
              {/* 트럼프 카드처럼 안쪽 테두리를 하나 두고 내용을 그 안에 담는다.
                  좌상/우하 모서리는 정사각으로 파여 있고, 그 자리에 코너 마크가 앉는다. */}
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

              {/* 코너 마크는 테두리의 clip-path 바깥(파인 자리)에 앉아야 하므로
                  card-inner-frame의 자식이 아니라 형제 레이어로 둔다 — 안에 넣으면
                  같은 clip에 잘려 사라진다. inset은 테두리와 같은 값이어야 위치가 맞는다.
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
      </div>

      {/* 뒤집기 전에만 안내. 뒤집은 뒤에도 남아 있으면 또 누르라는 뜻으로 읽힌다. */}
      {!flipped && (
        <p className="text-muted text-sm">{canFlip ? t("wheel.flipHint") : t("wheel.spinning")}</p>
      )}

      {/* 저장은 당첨 카드에만 있다 — 꽝은 남길 것이 없다. */}
      {flipped && coupon && (
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="pixel-mask-btn-solid py-2 px-5 bg-surface text-ink font-bold text-sm transition-opacity active:scale-95 disabled:opacity-50"
          >
            {saving ? t("card.saving") : t("card.saveButton")}
          </button>
          {saveError && <p className="text-error text-xs">{t("card.saveError")}</p>}
        </div>
      )}
    </div>
  );
}

"use client";

import { QRCodeSVG } from "qrcode.react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import { buildCouponQrPayload, isScannableCouponId } from "../lib/couponPayload";
import type { IssuedCoupon } from "../actions";

export default function CouponQR({ coupon }: { coupon: IssuedCoupon }) {
  const { locale, t } = useLocale();

  // buildCouponQrPayload는 형식이 틀리면 예외를 던진다. 렌더 중 예외가 나면
  // 화면 전체가 죽으므로 여기서 먼저 걸러 안내 문구로 대체한다.
  if (!isScannableCouponId(coupon.couponId)) {
    return <p className="text-muted text-sm">{t("coupon.qrUnavailable")}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR은 항상 흰 배경 위에 검은 모듈이어야 스캔이 안정적이다. 다크 배경 위에 직접 그리지 말 것. */}
      <div className="bg-white p-3">
        <QRCodeSVG value={buildCouponQrPayload(coupon.couponId, locale)} size={192} level="M" />
      </div>
      <p className="font-bold text-ink">{resolveLocalizedName(coupon.couponType, locale)}</p>
    </div>
  );
}

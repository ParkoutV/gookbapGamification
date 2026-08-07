"use client";

import { QRCodeSVG } from "qrcode.react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import { buildCouponQrPayload, isScannableCouponId } from "../lib/couponPayload";
import type { IssuedCoupon } from "../actions";

export default function CouponQR({
  coupon,
  onLightFace = false,
}: {
  coupon: IssuedCoupon;
  /**
   * 밝은 배경(가챠 카드 앞면) 위에 놓일 때 켠다. 테마의 --ink는 어두운 배경용
   * 밝은 색이라 그대로 두면 글자가 사라지고, 흰 QR 박스도 카드면에 묻힌다.
   */
  onLightFace?: boolean;
}) {
  const { locale, t } = useLocale();

  // buildCouponQrPayload는 형식이 틀리면 예외를 던진다. 렌더 중 예외가 나면
  // 화면 전체가 죽으므로 여기서 먼저 걸러 안내 문구로 대체한다.
  if (!isScannableCouponId(coupon.couponId)) {
    return <p className="text-muted text-sm">{t("coupon.qrUnavailable")}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR은 항상 흰 배경 위에 검은 모듈이어야 스캔이 안정적이다. 다크 배경 위에 직접 그리지 말 것.
          밝은 카드면 위에서는 흰 박스만으로 경계가 사라지므로 그때만 테두리를 둔다
          (테두리는 quiet zone 바깥이라 스캔에 영향을 주지 않는다). */}
      <div className={`bg-white p-3${onLightFace ? " border border-black/25" : ""}`}>
        {/* size는 SVG의 viewBox 기준값이고, 실제 표시 크기는 아래 style이 정한다.
            카드 앞면에서는 카드가 화면 높이에 따라 줄어드는데 192px 고정이면
            좁은 화면에서 카드 밖으로 넘친다. SVG라 축소해도 모듈이 뭉개지지 않는다. */}
        <QRCodeSVG
          value={buildCouponQrPayload(coupon.couponId, locale)}
          size={192}
          level="M"
          style={onLightFace ? { width: "min(38vw, 148px)", height: "auto" } : undefined}
        />
      </div>
      <p
        className={`font-bold text-center break-keep max-w-full${
          onLightFace ? " text-lg leading-snug" : " text-ink"
        }`}
      >
        {resolveLocalizedName(coupon.couponType, locale)}
      </p>
    </div>
  );
}

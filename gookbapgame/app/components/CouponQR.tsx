"use client";

import { QRCodeSVG } from "qrcode.react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import { buildCouponQrPayload, isScannableCouponId } from "../lib/couponPayload";
import { resolveCouponEmoji } from "../lib/couponEmoji";
import type { IssuedCoupon } from "../actions";

export default function CouponQR({
  coupon,
  showEmoji = false,
}: {
  coupon: IssuedCoupon;
  /** 카드 앞면에서만 켠다. 쿠폰 목록에서는 줄마다 이모지가 붙어 산만해진다. */
  showEmoji?: boolean;
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
          카드 앞면도 밝은 애셋이라 흰 박스만으로는 경계가 사라진다 — 그때만 테두리를 둔다.
          (테두리는 quiet zone 바깥이므로 스캔에 영향을 주지 않는다.) */}
      <div className={`bg-white p-3${showEmoji ? " border border-black/25" : ""}`}>
        {/* size는 SVG의 viewBox 기준값이고, 실제 표시 크기는 아래 style이 정한다.
            카드 앞면에서는 카드가 화면 높이에 따라 줄어드는데 192px 고정이면
            좁은 화면에서 카드 밖으로 넘친다. SVG라 축소해도 모듈이 뭉개지지 않는다. */}
        <QRCodeSVG
          value={buildCouponQrPayload(coupon.couponId, locale)}
          size={192}
          level="M"
          style={showEmoji ? { width: "min(40vw, 160px)", height: "auto" } : undefined}
        />
      </div>
      {/* 이모지는 텍스트로 넣는다 — ::before의 content는 스크린리더가 읽지 못하는
          경우가 있고, 여기서는 얻는 것도 없다. aria-hidden으로 낭독만 건너뛴다. */}
      {/* showEmoji는 카드 앞면에서만 켜진다. 그 면은 밝은 애셋이라 --ink(어두운 배경용
          밝은 색)를 쓰면 글자가 사라진다 — 부모가 정한 색을 그대로 물려받게 둔다. */}
      <p className={`font-bold text-center break-keep max-w-full${showEmoji ? "" : " text-ink"}`}>
        {showEmoji && (
          <span aria-hidden="true" className="mr-1">
            {resolveCouponEmoji(coupon.couponType)}
          </span>
        )}
        {resolveLocalizedName(coupon.couponType, locale)}
      </p>
    </div>
  );
}

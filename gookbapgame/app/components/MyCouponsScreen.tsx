"use client";

import { useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import PixelPanel from "./PixelPanel";
import CouponQR from "./CouponQR";
import type { IssuedCoupon } from "../actions";
import { isCouponExpired } from "../lib/couponUsability";
import { DATE_LOCALES } from "../lib/i18n/dateLocales";

export default function MyCouponsScreen({
  coupons,
  onClose,
}: {
  coupons: IssuedCoupon[];
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const [openCouponId, setOpenCouponId] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-sm w-full">
        <h1 className="text-2xl font-extrabold mb-6 text-ink text-center">
          {t("coupon.myCouponsTitle")}
        </h1>

        {coupons.length === 0 && <p className="text-muted text-center mb-6">{t("coupon.empty")}</p>}

        <div className="flex flex-col gap-3 mb-6">
          {coupons.map((coupon) => {
            const expired = isCouponExpired(coupon);
            const unusable = expired || coupon.isUsed;
            const isOpen = openCouponId === coupon.couponId;

            return (
              <div
                key={coupon.couponId}
                className={`border-2 border-ink p-3 ${unusable ? "opacity-40" : ""}`}
              >
                <p className="font-bold text-ink">
                  {resolveLocalizedName(coupon.couponType, locale)}
                </p>

                {coupon.isUsed && <p className="text-xs text-muted">{t("coupon.usedBadge")}</p>}
                {!coupon.isUsed && expired && (
                  <p className="text-xs text-muted">{t("coupon.expiredBadge")}</p>
                )}
                {!unusable && coupon.expiredAt && (
                  <p className="text-xs text-muted">
                    {t("coupon.expiresAt", {
                      date: new Date(coupon.expiredAt).toLocaleDateString(
                        DATE_LOCALES[locale] ?? "en-US"
                      ),
                    })}
                  </p>
                )}

                {!unusable && (
                  <button
                    onClick={() => setOpenCouponId(isOpen ? null : coupon.couponId)}
                    className="mt-2 text-sm text-ink underline underline-offset-4 bg-transparent border-0 p-0"
                  >
                    {isOpen ? t("coupon.closeButton") : t("coupon.showQrButton")}
                  </button>
                )}

                {isOpen && !unusable && (
                  <div className="mt-3">
                    <CouponQR coupon={coupon} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

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

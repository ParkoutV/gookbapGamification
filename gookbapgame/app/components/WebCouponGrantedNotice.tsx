"use client";

import PixelPanel from "./PixelPanel";
import WebCouponTicket from "./WebCouponTicket";
import { useLocale } from "../lib/i18n/LocaleContext";
import type { WebCoupon, WebCouponSettings } from "../lib/webCoupons";

/**
 * 설문 최초 응답 직후 뜨는 온라인몰 쿠폰 안내(2026-08-13, 이란토).
 *
 * **여기서도 티켓을 그대로 띄운다** — 코드를 즉시 복사할 수 있어야 하기 때문이다.
 * 안내만 하고 '내 쿠폰'으로 보내면, 방금 받은 것을 쓰려고 두 단계를 더 거치게 된다.
 *
 * `TermNotice`와 같은 구조지만 별도 컴포넌트다: 저쪽은 닫기 선택지를 두지 않는
 * 의무 고지(거부 버튼이 있으면 동의 게이트가 된다)이고, 이쪽은 그냥 알림이다.
 */
export default function WebCouponGrantedNotice({
  coupon,
  settings,
  onConfirm,
}: {
  coupon: WebCoupon;
  settings?: WebCouponSettings | null;
  onConfirm: () => void;
}) {
  const { t } = useLocale();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("webCoupon.grantedTitle")}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
    >
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full">
        <h2 className="text-xl font-bold text-ink mb-3 text-center">
          {t("webCoupon.grantedTitle")}
        </h2>
        <p className="text-sm text-ink text-left whitespace-pre-line mb-4">
          {t("webCoupon.grantedBody")}
        </p>

        <div className="mb-5">
          <WebCouponTicket coupon={coupon} settings={settings} />
        </div>

        <button
          type="button"
          onClick={onConfirm}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
        >
          {t("webCoupon.grantedConfirm")}
        </button>
      </PixelPanel>
    </div>
  );
}

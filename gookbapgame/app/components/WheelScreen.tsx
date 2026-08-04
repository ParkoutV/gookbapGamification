"use client";

import { useEffect } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import PixelPanel from "./PixelPanel";
import CouponQR from "./CouponQR";
import type { DrawCouponResult } from "../actions";

interface WheelScreenProps {
  drawResult: DrawCouponResult | null;
  isDrawing: boolean;
  onSpin: () => void;
  onNext: () => void;
}

export default function WheelScreen({
  drawResult,
  isDrawing,
  onSpin,
  onNext,
}: WheelScreenProps) {
  const { t } = useLocale();

  useEffect(() => {
    onSpin();
  }, [onSpin]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("wheel.title")}</h1>

        {(isDrawing || !drawResult) && <p className="text-muted mb-8">{t("wheel.spinning")}</p>}

        {drawResult?.status === "won" && (
          <div className="mb-8">
            <p className="font-extrabold mb-4 text-ink">{t("wheel.wonTitle")}</p>
            <CouponQR coupon={drawResult.coupon} />
          </div>
        )}

        {drawResult?.status === "wonButHidden" && (
          <div className="mb-8">
            <p className="font-extrabold mb-2 text-ink">{t("wheel.wonTitle")}</p>
            <p className="text-muted text-sm">{t("coupon.issuedButHidden")}</p>
          </div>
        )}

        {drawResult?.status === "miss" && (
          <div className="mb-8">
            <p className="font-extrabold mb-2 text-ink">{t("wheel.missTitle")}</p>
            <p className="text-muted text-sm">{t("wheel.missDescription")}</p>
          </div>
        )}

        {drawResult?.status === "rejected" && (
          <p className="text-muted mb-8 text-sm">{t("wheel.rejected")}</p>
        )}

        {/* 요청이 서버에 닿지 못한 경우다. 발급도 쿨타임 갱신도 일어나지 않았으므로
            나중에 다시 시도하면 된다 — 전용 재시도 버튼 대신 오늘의 결과의
            '설문하고 쿠폰 받기' 재진입 경로를 쓴다. */}
        {drawResult?.status === "error" && (
          <p className="text-muted mb-8 text-sm">{t("wheel.error")}</p>
        )}

        <button
          onClick={onNext}
          disabled={isDrawing || !drawResult}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50"
        >
          {t("wheel.nextButton")}
        </button>
      </PixelPanel>
    </div>
  );
}

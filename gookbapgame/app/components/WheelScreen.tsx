"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import PixelPanel from "./PixelPanel";
import GatchaCard from "./GatchaCard";
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
  const [flipped, setFlipped] = useState(false);

  // draw는 마운트 시 1회. 카드를 뒤집는 동작은 연출일 뿐이고 API를 다시 부르지
  // 않는다 — 호출 타이밍과 연출 타이밍을 분리하라는 ROADMAP B 메모대로다.
  // 여기서 옮기면 drawStartedRef가 막아주던 중복 호출 위험이 되살아난다.
  useEffect(() => {
    onSpin();
  }, [onSpin]);

  /**
   * 카드를 쓰는 건 실제로 뽑기가 성립한 두 결과뿐이다.
   * - wonButHidden: 앞면에 올릴 payload가 아예 없다(couponType도 couponId도 없음).
   * - rejected/error: 뽑기가 소진되지 않은 상태다. 카드를 뒤집으면 소비한 것처럼 보인다.
   */
  const usesCard = drawResult?.status === "won" || drawResult?.status === "miss";
  const canFlip = !isDrawing && usesCard;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("wheel.title")}</h1>

        {/* 응답 전에도 뒷면을 먼저 보여준다. 카드가 늦게 나타나면 화면이 한 번
            덜컥이고, 어차피 뒤집기는 canFlip이 막는다. */}
        {(isDrawing || !drawResult || usesCard) && (
          <div className="mb-6">
            <GatchaCard
              coupon={drawResult?.status === "won" ? drawResult.coupon : null}
              flipped={flipped}
              canFlip={canFlip}
              onFlip={() => setFlipped(true)}
            />
          </div>
        )}

        {drawResult?.status === "wonButHidden" && (
          <div className="mb-8">
            <p className="font-extrabold mb-2 text-ink">{t("wheel.wonTitle")}</p>
            <p className="text-muted text-sm">{t("coupon.issuedButHidden")}</p>
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

        {/* 카드가 있는데 아직 안 뒤집었으면 '다음'을 막는다. 열어보지도 않고
            넘어가면 뽑기를 한 기억이 남지 않는다. */}
        <button
          onClick={onNext}
          disabled={isDrawing || !drawResult || (usesCard && !flipped)}
          className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50"
        >
          {t("wheel.nextButton")}
        </button>
      </PixelPanel>
    </div>
  );
}

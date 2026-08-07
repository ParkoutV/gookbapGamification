"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { DATE_LOCALES } from "../lib/i18n/dateLocales";
import { useCardImageSave } from "../hooks/useCardImageSave";
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
  const { t, locale } = useLocale();
  const [flipped, setFlipped] = useState(false);
  /**
   * 저장을 한 번이라도 시도했는지. 이걸로 '다음'을 드러낸다 — 처음부터 띄워두면
   * 카드를 저장하려던 사람이 실수로 눌러 넘어가고, 그 카드는 이 화면에서 다시 볼 수 없다.
   * 성공 여부는 보지 않는다: 공유 시트는 앨범 저장인지 전송인지 알려주지 않고,
   * 취소했다고 숨겨두면 "눌렀는데 왜 안 생기지"가 된다.
   */
  const [saveAttempted, setSaveAttempted] = useState(false);

  const coupon = drawResult?.status === "won" ? drawResult.coupon : null;

  // 화면과 저장 이미지가 같은 문구를 써야 한다 — 한쪽만 바뀌면 조용히 달라진다.
  const expiryText =
    coupon?.expiredAt != null
      ? t("coupon.expiresAt", {
          date: new Date(coupon.expiredAt).toLocaleDateString(DATE_LOCALES[locale] ?? "en-US"),
        })
      : null;

  const { faceRef, save, saving, saveError } = useCardImageSave(
    coupon,
    flipped,
    locale,
    expiryText
  );

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
          <div className="mb-6 w-full">
            <GatchaCard
              coupon={coupon}
              flipped={flipped}
              canFlip={canFlip}
              onFlip={() => setFlipped(true)}
              faceRef={faceRef}
              expiryText={expiryText}
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

        {/* 당첨 카드를 뒤집은 뒤에는 '이미지로 저장'이 주된 행동이다 — 그 자리를
            차지하고 있다가, 한 번 누르면 폭을 줄여 옆에 '다음'(화살표)을 들인다.
            처음부터 둘 다 띄우면 저장하려던 사람이 '다음'을 눌러 넘어가 버리고,
            이 화면의 카드는 다시 볼 수 없다.

            꽝이거나 카드가 없는 경우엔 저장할 것이 없으므로 '다음'이 곧바로 전체 폭이다. */}
        {flipped && coupon ? (
          <div className="flex flex-col items-center gap-1 w-full">
            {/* w-full이 있어야 이 행의 w-full이 기준을 갖는다 — items-center 아래에서
                바깥 래퍼가 shrink-to-fit이 되면 버튼이 내용물 폭으로 쪼그라든다. */}
            <div className="flex w-full gap-2">
              <button
                onClick={() => save(() => setSaveAttempted(true))}
                disabled={saving}
                className="pixel-mask-btn-solid flex-1 py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50"
              >
                {saving ? t("card.saving") : t("card.saveButton")}
              </button>
              {saveAttempted && (
                <button
                  onClick={onNext}
                  aria-label={t("wheel.nextButton")}
                  className="pixel-mask-btn-solid py-3 px-5 bg-surface text-ink font-bold transition-opacity active:scale-95"
                >
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
            {saveError && <p className="text-error text-xs">{t("card.saveError")}</p>}
          </div>
        ) : (
          /* 카드가 있는데 아직 안 뒤집었으면 '다음'을 막는다. 열어보지도 않고
             넘어가면 뽑기를 한 기억이 남지 않는다. */
          <button
            onClick={onNext}
            disabled={isDrawing || !drawResult || (usesCard && !flipped)}
            className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50"
          >
            {t("wheel.nextButton")}
          </button>
        )}
      </PixelPanel>
    </div>
  );
}

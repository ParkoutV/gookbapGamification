"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { DATE_LOCALES } from "../lib/i18n/dateLocales";
import { useCardImageSave } from "../hooks/useCardImageSave";
import PixelPanel from "./PixelPanel";
import GatchaCard from "./GatchaCard";
import GatchaLoading from "./GatchaLoading";
import { remainingLoadingMs } from "../lib/minimumDelay";
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
   * 로딩 연출을 최소 시간만큼은 보여준다.
   *
   * `isDrawing`이 false가 되는 즉시 카드로 바꾸면, 응답이 빠를 때 로딩 아이콘이
   * 한 번 깜빡이고 사라져 연출이 아니라 결함처럼 보인다. 그래서 화면 전환은
   * `showLoading`이 담당하고, 이 값은 응답과 최소 시간을 **둘 다** 만족해야 내려간다.
   *
   * 마운트 시각을 기준으로 삼는 이유: onSpin()이 이 컴포넌트 마운트와 함께 불리므로
   * 마운트 = 요청 시작이다. isDrawing이 true로 바뀌는 것을 기다리면 첫 렌더 한 프레임을
   * 놓친다.
   */
  const startedAtRef = useRef<number>(Date.now());
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const wait = remainingLoadingMs(startedAtRef.current, Date.now());
    if (wait === 0) {
      setMinElapsed(true);
      return;
    }
    const timer = setTimeout(() => setMinElapsed(true), wait);
    return () => clearTimeout(timer);
  }, []);

  const showLoading = isDrawing || !drawResult || !minElapsed;

  /**
   * 카드를 쓰는 건 실제로 뽑기가 성립한 두 결과뿐이다.
   * - wonButHidden: 앞면에 올릴 payload가 아예 없다(couponType도 couponId도 없음).
   * - rejected/error: 뽑기가 소진되지 않은 상태다. 카드를 뒤집으면 소비한 것처럼 보인다.
   */
  const usesCard = drawResult?.status === "won" || drawResult?.status === "miss";
  // 카드는 showLoading이 내려간 뒤에만 렌더되고, 그 조건이 이미 !isDrawing과
  // drawResult 존재를 포함한다 — 즉 카드가 보이는 시점은 언제나 뒤집을 수 있는
  // 시점이다. 그래도 조건을 남겨두는 이유는 GatchaCard가 canFlip=false일 때
  // 커서·스케일 피드백을 죽이기 때문이다. 렌더 조건이 나중에 느슨해져도
  // "못 누르는 카드"가 눌리는 것처럼 보이지는 않는다.
  const canFlip = !isDrawing && usesCard;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-ink p-6">
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("wheel.title")}</h1>

        {/* 발급을 기다리는 동안은 카드가 아니라 로딩을 보여준다. 예전에는 이 자리에
            카드 뒷면을 미리 띄웠는데, 응답 전에도 카드가 나와 있어서 "눌러도 안
            뒤집히는 카드"가 됐다(2026-08-11, 이란토).

            GatchaLoading은 이 패널 안이 아니라 화면 전체를 덮는 **별도 레이어**다
            (PreloadScreen과 같은 구조). 그래서 여기서 자리를 비워둘 필요가 없고,
            로딩 박스를 카드 크기에 맞추는 제약도 없다. */}
        {showLoading && <GatchaLoading />}

        {/* 주의: 카드 앞면(card-front.webp) 안쪽 색이 패널 배경(--surface)과 가깝다.
            지금은 앞면 테두리 덕에 형체가 유지되지만, 배경을 더 밝게 바꾸면 카드가
            묻힌다. 이 화면은 뽑기 연출용으로 따로 꾸밀 예정이라 그때 같이 볼 것. */}
        {!showLoading && usesCard && (
          <div className="mb-6 w-full">
            <GatchaCard
              coupon={coupon}
              flipped={flipped}
              canFlip={canFlip}
              /* 한 번 뒤집은 뒤에도 다시 눌러 앞뒤를 오갈 수 있다(2026-08-11, 이란토).
                 저장 기능은 영향을 받지 않는다 — useCardImageSave는 flipped가 true가
                 되는 시점에 이미지를 구워 ref에 들고 있으므로, 뒷면으로 돌려놔도
                 저장할 것은 남아 있다. */
              onFlip={() => setFlipped((v) => !v)}
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
            나중에 다시 시도하면 된다 — 전용 재시도 버튼 대신 `markPendingDraw()`가
            남긴 표시로 **시작 화면**에 뽑기 진입 버튼을 띄우는 경로를 쓴다.
            오늘의 결과의 '설문하고 쿠폰 받기'를 여기 기대하지 말 것: 그 버튼은
            설문 안내를 거절한 사람에게만 뜬다(page.tsx의 declinedSurvey). */}
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
             넘어가면 뽑기를 한 기억이 남지 않는다.
             로딩 조건은 showLoading을 그대로 쓴다 — isDrawing만 보면 응답이 온 뒤
             최소 노출 시간이 남은 구간에서 버튼만 먼저 살아난다. */
          <button
            onClick={onNext}
            disabled={showLoading || (usesCard && !flipped)}
            className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50"
          >
            {t("wheel.nextButton")}
          </button>
        )}
      </PixelPanel>
    </div>
  );
}

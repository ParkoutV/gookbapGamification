"use client";

import { useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import PixelPanel from "./PixelPanel";
import GatchaCard from "./GatchaCard";
import { useCardImageSave } from "../hooks/useCardImageSave";
import type { IssuedCoupon, WebCoupon, WebCouponSettings } from "../actions";
import WebCouponTicket from "./WebCouponTicket";
import { isCouponExpired } from "../lib/couponUsability";
import { resolveCouponRemaining } from "../lib/couponRemaining";
import { couponDateLines } from "../lib/couponDates";

/**
 * 내 쿠폰 앨범.
 *
 * **격자로 뒷면을 늘어놓고, 누르면 그 카드를 앞면으로 보여준다**(2026-08-13, 이란토).
 * 예전에는 게시판처럼 한 줄씩 나열하고 'QR 코드 보기' 토글로 QR만 펼쳤는데, 뽑기
 * 직후가 아니면 **카드 형식으로 다시 볼 수 없고 이미지 저장 기회도 한 번뿐**이었다.
 * instagram·Google Photos 식 앨범이 그 두 가지를 함께 해결한다.
 *
 * 뒷면은 모든 쿠폰이 같은 그림이므로 **아래 쿠폰명이 유일한 식별자다.**
 *
 * - `WheelScreen`과 공통 컴포넌트로 묶지 않았다. 저쪽은 섞기 연출·draw 응답 4종
 *   분기·'다음' 게이트를 들고 있고 여기는 하나도 필요 없다. 실제로 겹치는 것은
 *   `GatchaCard`와 `useCardImageSave` 두 조각이고, 그것들을 각자 조립하는 편이 짧다.
 * - **`useCardImageSave`는 훅이라 `map` 안에서 부를 수 없다.** 그래서 격자 칸은 순수
 *   `<img>`이고, 훅 인스턴스는 이 컴포넌트에 **하나**만 두고 열린 쿠폰(`openCouponId`)에
 *   물린다. 칸마다 저장 버튼을 두는 구조로 바꾸려면 칸을 별도 컴포넌트로 떼야 한다.
 */
export default function MyCouponsScreen({
  coupons,
  webCoupons = [],
  webCouponSettings = null,
  onClose,
  onGoToDraw,
}: {
  coupons: IssuedCoupon[];
  /**
   * 온라인몰 쿠폰. **매장 쿠폰과 별도 배열로 받는다** — 한 배열에 섞으면 화면이
   * 필드 유무로 종류를 판정하게 되는데 그건 타입이 할 일이다(`webCoupons.ts` 주석).
   */
  webCoupons?: WebCoupon[];
  /** 티켓 문구(`web_coupon_settings`). 없으면 로케일 파일 기본값으로 떨어진다. */
  webCouponSettings?: WebCouponSettings | null;
  onClose: () => void;
  /** 뽑기 기회가 남았을 때만 넘어온다. undefined면 버튼을 띄우지 않는다. */
  onGoToDraw?: () => void;
}) {
  const { locale, t } = useLocale();
  const [openCouponId, setOpenCouponId] = useState<string | null>(null);

  const openCoupon = coupons.find((c) => c.couponId === openCouponId) ?? null;

  const stampFor = (coupon: IssuedCoupon): string | null => {
    if (coupon.isUsed) return t("coupon.usedBadge");
    if (isCouponExpired(coupon)) return t("coupon.expiredBadge");
    return null;
  };

  /**
   * 격자 칸 아래 상태 줄. 쓸 수 없는 쿠폰은 이유를, 쓸 수 있는 쿠폰은 남은 기간을
   * 보여준다(2026-08-13, 이란토) — **여러 칸을 한눈에 보는 자리라 급한 것이 드러나야
   * 한다.** 카드 앞면에는 넣지 않았다: 저장 이미지(`cardImage.ts`)에도 함께 실려야
   * 하는데, 남은 일수는 저장한 다음 날부터 틀린 값이 된다.
   *
   * `soon`(3일 이하)이면 굵게 + 경고색이다. 색은 `--warning`이 아니라 `--error`다 —
   * 주황 계열은 밝은 바탕에서 글자 대비가 모자라 면에만 쓴다(게임 화면 시간 경고와
   * 같은 판단).
   */
  const statusLineFor = (coupon: IssuedCoupon): { text: string; soon: boolean } | null => {
    const remaining = resolveCouponRemaining(coupon);
    switch (remaining.kind) {
      case "used":
        return { text: t("coupon.usedBadge"), soon: false };
      case "expired":
        return { text: t("coupon.expiredBadge"), soon: false };
      case "none":
        return null;
      case "remaining":
        if (remaining.days === 0) return { text: t("coupon.remainingToday"), soon: true };
        if (remaining.days === 1) return { text: t("coupon.remainingDay"), soon: true };
        return {
          text: t("coupon.remainingDays", { days: String(remaining.days) }),
          soon: remaining.soon,
        };
    }
  };

  /*
   * 열린 카드의 날짜·도장. **`GatchaCard`와 `useCardImageSave`가 같은 값을 받아야
   * 한다** — 양쪽이 각자 만들면 화면과 저장본이 조용히 달라진다(카드 앞면에서 여러 번
   * 난 사고다).
   */
  const dateLines = openCoupon ? couponDateLines(openCoupon, locale, t) : [];
  const usedStamp = openCoupon ? stampFor(openCoupon) : null;

  /*
   * `flipped`를 항상 true로 준다 — 앨범은 이미 아는 결과를 다시 보는 자리라 뒤집기
   * 연출이 필요 없고, 이 값이 저장 이미지 미리 굽기(iOS 제스처 제약)의 방아쇠다.
   * `announceResult={false}`가 당첨 효과음을 막는다(그쪽 prop 주석 참고).
   */
  const { faceRef, save, saving, saveError } = useCardImageSave(
    openCoupon,
    true,
    locale,
    dateLines,
    usedStamp
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-bg text-ink p-6">
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full">
        <h1 className="text-2xl font-extrabold mb-6 text-ink text-center">
          {t("coupon.myCouponsTitle")}
        </h1>

        {/* 뽑기 진입. **첫 화면이 아니라 여기 있다**(2026-08-13, 이란토) — 첫 화면에
            조건부로 나타나고 사라지는 항목이 있으면 레이아웃이 흔들리고, 뽑기와 쿠폰
            목록은 같은 자리에 있는 편이 자연스럽다. 첫 화면에서는 '내 쿠폰' 버튼의
            red-dot이 기회가 남았다는 것만 알린다.

            카드를 열었을 때는 감춘다 — 지금 보고 있는 카드와 무관한 행동이라, 저장·목록
            버튼 사이에 끼면 어느 것이 이 카드에 대한 것인지 흐려진다.

            쿠폰이 하나도 없을 때도 띄운다. 그때가 뽑기가 가장 필요한 상황이다. */}
        {!openCoupon && onGoToDraw && (
          <button
            onClick={onGoToDraw}
            className="pixel-mask-btn-solid w-full py-3 px-6 mb-4 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
          >
            {t("start.goToDrawButton")}
          </button>
        )}

        {/* **두 목록이 모두 비었을 때만** 빈 상태다. 매장 쿠폰만 보면, 설문만 하고
            뽑기를 안 한 사람(온라인몰 쿠폰만 가진 사람)에게 티켓과 "쿠폰이 없어요"가
            함께 뜬다. */}
        {coupons.length === 0 && webCoupons.length === 0 && (
          <p className="text-muted text-center mb-6">{t("coupon.empty")}</p>
        )}

        {openCoupon ? (
          <div className="flex flex-col items-center gap-4 mb-6 w-full">
            <GatchaCard
              coupon={openCoupon}
              flipped
              canFlip={false}
              /* canFlip=false면 GatchaCard가 클릭 핸들러를 아예 배선하지 않으므로
                 이 콜백은 불리지 않는다. prop이 필수라 자리만 채운다. */
              onFlip={() => {}}
              faceRef={faceRef}
              dateLines={dateLines}
              announceResult={false}
              usedStamp={usedStamp}
            />

            {/* 뽑기 화면과 달리 '이미지로 저장'과 '닫기'를 처음부터 함께 둔다 —
                저쪽이 '다음'을 숨기는 이유는 넘어가면 그 카드를 다시 볼 수 없기
                때문인데, 여기서는 격자로 돌아와 언제든 다시 열 수 있다. */}
            <div className="flex w-full gap-2">
              <button
                onClick={() => save()}
                disabled={saving}
                className="pixel-mask-btn-solid flex-1 py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50"
              >
                {saving ? t("card.saving") : t("card.saveButton")}
              </button>
              <button
                onClick={() => setOpenCouponId(null)}
                className="pixel-mask-btn-solid py-3 px-5 bg-surface text-ink font-bold transition-opacity active:scale-95"
              >
                {t("coupon.backToAlbum")}
              </button>
            </div>
            {saveError && <p className="text-error text-xs">{t("card.saveError")}</p>}
            {/* 유실 주의문. 뽑기 화면과 달리 "'내 쿠폰'에서 다시 볼 수 있다"는 문장은
                빼고 유실 주의만 남긴다 — 여기가 이미 그 '내 쿠폰'이다. */}
            <p className="text-muted text-xs text-center leading-snug">
              {t("card.saveRecommendNoticeShort")}
            </p>
          </div>
        ) : (
          /* 2열 격자. `max-w-sm` 패널 안쪽에서 칸이 약 140px이 되어 아래 쿠폰명이
             한두 줄로 앉는다 — 3열은 이름이 들어갈 폭이 없다. */
          <div className="grid grid-cols-2 gap-3 mb-6">
            {/* 온라인몰 쿠폰은 **한 행을 통째로 쓴다**(`col-span-2`, 2026-08-13 이란토).
                가로로 긴 티켓 형태라 세로로 긴 카드 칸(1000/1371)에 넣으면 위아래
                여백이 크게 남고, 칸마다 비율이 다르면 격자가 들쭉날쭉해진다 —
                이름 블록을 `h-14`로 고정한 것과 같은 이유다.

                맨 위에 두는 것은 **누를 필요 없이 코드가 바로 보이는 유일한 항목**이라
                아래 카드 격자에 섞이면 흐름이 끊기기 때문이다. 카드는 눌러야 열린다. */}
            {webCoupons.map((webCoupon) => (
              <div key={webCoupon.code} className="col-span-2">
                <WebCouponTicket coupon={webCoupon} settings={webCouponSettings} />
              </div>
            ))}
            {coupons.map((coupon) => {
              const unusable = coupon.isUsed || isCouponExpired(coupon);
              const status = statusLineFor(coupon);

              return (
                <button
                  key={coupon.couponId}
                  onClick={() => setOpenCouponId(coupon.couponId)}
                  className={`flex flex-col items-center gap-1 bg-transparent border-0 p-0 text-left ${
                    unusable ? "opacity-40" : ""
                  }`}
                >
                  {/* 격자 칸은 `.gatcha-card`를 쓰지 않는다 — 그쪽은 뒤집기용
                      perspective·3D·트랜지션을 들고 있고 여기 필요한 것은 비율뿐이다. */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- static local pixel-art asset,
                      next/image would resample it and defeat image-rendering: pixelated */}
                  <img
                    src="/icons/card-back.webp"
                    alt=""
                    aria-hidden="true"
                    className="w-full select-none"
                    style={{ aspectRatio: "1000 / 1371", imageRendering: "pixelated" }}
                  />
                  {/* 이름·상태를 고정 높이 블록에 담는다. 이름 길이가 1줄/2줄로 갈리면
                      행마다 칸 높이가 달라져 격자가 들쭉날쭉해진다(실물로 확인).

                      **높이 예산이 빡빡하다.** 최악의 경우(이름 2줄 + 상태 한 줄)가
                      `text-xs leading-tight` 기준 30 + 2 + 15 = 47px이고 h-14는 56px이다
                      (2026-08-13 실측: 영어 "3,000 KRW off boiled pork" + "3 days left").
                      h-12(48px)로도 딱 맞아 잘리지는 않았지만 여유가 1px뿐이라, 폰트나
                      문구가 조금만 길어져도 조용히 겹친다 — 남은 일수 표시가 붙으면서
                      **모든** 쿠폰이 상태 줄을 갖게 되어 이 최악의 경우가 흔한 경우가 됐다.
                      글자 크기나 줄 수를 늘리려면 여기 높이를 먼저 올릴 것. */}
                  <span className="flex flex-col items-center justify-start h-14 gap-0.5">
                    <span className="text-xs font-bold text-ink text-center leading-tight line-clamp-2">
                      {resolveLocalizedName(coupon.couponType, locale)}
                    </span>
                    {status && (
                      <span
                        className={`text-xs ${
                          status.soon ? "font-bold text-error" : "text-muted"
                        }`}
                      >
                        {status.text}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

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

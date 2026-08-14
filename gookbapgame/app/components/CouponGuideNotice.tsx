"use client";

import PixelPanel from "./PixelPanel";
import { useLocale } from "../lib/i18n/LocaleContext";
import { couponGuideBody, pickLegalLocale } from "../lib/legalDocs";

/**
 * 쿠폰 이용안내 팝업.
 *
 * **약관 창(`LegalNotice`)의 탭이 아니다**(2026-08-14, 이란토). 약관·개인정보처리방침은
 * 서비스 전체에 걸린 고지라 시작 화면 푸터에서 열지만, 쿠폰 안내는 **쿠폰을 받거나
 * 볼 때** 필요한 설명이라 뽑기 화면(`WheelScreen`)과 보관함(`MyCouponsScreen`)에서
 * 각자 연다 — 사용기한·1회 사용·재발급 불가처럼 그 자리에서 바로 알아야 하는 내용이다.
 *
 * 본문 로케일이 UI 로케일과 다른 것은 약관 창과 같다(`pickLegalLocale`) — ja·zh
 * 사용자는 en 본문을 본다.
 */
export default function CouponGuideNotice({ onClose }: { onClose: () => void }) {
  const { t, locale } = useLocale();
  const legalLocale = pickLegalLocale(locale);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("couponGuide.title")}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
    >
      <PixelPanel
        size="card"
        title={t("window.brand")}
        onClose={onClose}
        closeAriaLabel={t("legal.closeAria")}
        className="max-w-sm w-full"
      >
        <h2 className="text-lg font-bold text-ink mb-3 text-center">{t("couponGuide.title")}</h2>
        {/* 높이 상한이 `dvh`인 이유는 `LegalNotice`의 같은 자리 주석 참고. */}
        <div className="legal-doc-body text-xs text-ink text-left whitespace-pre-line max-h-[45dvh] overflow-y-auto leading-relaxed">
          {couponGuideBody(legalLocale)}
        </div>
        {legalLocale !== "ko" && (
          <p className="text-[0.65rem] text-muted text-left mt-3">{t("legal.originalNotice")}</p>
        )}
        {/* **닫기는 타이틀바 ✕뿐이다.** 본문 아래에 '확인'을 또 두지 않는다 —
            `PixelPanel`의 prop 주석대로 창 컨셉에서 닫기는 타이틀바의 몫이고,
            여기는 이미 아는 내용을 다시 읽는 열람용이라 동의를 받을 것이 없다
            (`LegalNotice`의 푸터 열람 경로와 같은 성격이다). */}
      </PixelPanel>
    </div>
  );
}

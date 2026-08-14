"use client";

import { useCallback, useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { resolveLocalizedName, MISSING_NAME_PLACEHOLDER } from "../lib/i18n/localizedName";
import type { WebCoupon, WebCouponSettings } from "../lib/webCoupons";

/**
 * 온라인몰 쿠폰 티켓.
 *
 * **매장 쿠폰(`GatchaCard`)과 공통 컴포넌트로 묶지 않았다.** 저쪽은 앞뒤 뒤집기,
 * QR, 상품명, 사용기한, 도장, 저장 이미지 굽기를 들고 있고 여기에는 **하나도** 없다.
 * 겹치는 것이 사실상 없어서 합치면 분기만 늘어난다 — 앨범이 두 컴포넌트를 각자
 * 그리는 편이 짧다(`MyCouponsScreen`이 `WheelScreen`과 합쳐지지 않은 것과 같은 판단).
 *
 * 형태는 `globals.css`의 `.web-coupon-ticket`이 clip-path로 만든다.
 */
export default function WebCouponTicket({
  coupon,
  settings,
}: {
  coupon: WebCoupon;
  /** `web_coupon_settings`. 없거나 비어 있으면 로케일 파일의 기본 문구로 떨어진다. */
  settings?: WebCouponSettings | null;
}) {
  const { t, locale } = useLocale();
  const [feedback, setFeedback] = useState<"copied" | "failed" | null>(null);

  /*
   * **혜택 내용은 DB에서 온다** — 할인율을 담는 숫자 컬럼이 없고, 운영자가
   * `web_coupon_settings.title`에 문장으로 적는다("1원 할인 쿠폰" 등).
   * 화면에 하드코딩하면 대시보드에서 고쳐도 반영되지 않는다.
   *
   * `resolveLocalizedName`이 빈 문자열을 "없는 것"으로 보고 locale → en → ko로
   * 떨어뜨린다 — 실제 데이터가 `ja: ""`, `zh` 키 없음이라 **늘 걸리는 경로다.**
   * 셋 다 없으면 `—`가 오는데, 그때는 이름 자리가 비는 것이라 로케일 파일의
   * 기본 문구("온라인몰 쿠폰")를 쓴다.
   */
  const resolvedTitle = resolveLocalizedName(settings?.title, locale);
  const title = resolvedTitle === MISSING_NAME_PLACEHOLDER ? t("webCoupon.label") : resolvedTitle;

  const resolvedDescription = resolveLocalizedName(settings?.description, locale);
  // 설명은 지금 전부 비어 있다. 없으면 줄 자체를 그리지 않는다.
  const description =
    resolvedDescription === MISSING_NAME_PLACEHOLDER ? null : resolvedDescription;

  /*
   * **`await` 없이 곧바로 `writeText`를 부른다.** 앞에 비동기 작업이 끼면 iOS Safari가
   * 사용자 제스처와 끊긴 것으로 보고 거부한다(`StartScreen`의 초대 링크 복사, 그리고
   * `useCardImageSave`의 `navigator.share`와 같은 제약). 코드는 이미 props로 들어와
   * 있으므로 조회할 것이 없다.
   */
  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(coupon.code)
      .then(() => setFeedback("copied"))
      .catch((error) => {
        console.error("[WebCouponTicket] 코드 복사 실패:", error);
        setFeedback("failed");
      });
  }, [coupon.code]);

  return (
    <div className="w-full">
      {/* 좌우 패딩이 상하보다 크다(px-[21px] vs py-4). 노치가 좌우 변 한가운데를
          파고들어와 있어 같은 값을 주면 그쪽만 답답해 보인다. */}
      <div className="web-coupon-ticket flex items-stretch w-full px-[21px] py-4">
        {/* 왼쪽 몸통 — 무엇에 쓰는 쿠폰인지. */}
        <div className="flex-1 min-w-0 flex flex-col justify-center pr-4">
          {/* **위계는 이름이 위다**(2026-08-13, 이란토). 격자에서 먼저 읽혀야 하는 것은
              "이게 무슨 쿠폰인가"이고, 코드는 복사 버튼으로 옮기는 값이라 눈으로 읽어
              옮겨 적는 일이 드물다. 처음엔 코드를 크게 뒀다가 뒤집었다. */}
          <span className="text-base font-bold leading-tight line-clamp-2">{title}</span>
          {description && (
            <span className="text-xs opacity-80 leading-tight line-clamp-2">{description}</span>
          )}
          {/* 코드는 **본문 폰트로 둔다.** 픽셀 폰트(Galmuri)는 0과 O, 1과 I가
              비슷해 보이는데, 눈으로 옮겨 적는 경우 혼동이 곧 등록 실패가 된다.
              `tabular-nums`와 넓은 자간이 그 위험을 줄인다 — 작게 두는 만큼 더 필요하다. */}
          <span className="text-xs opacity-80 tracking-[0.15em] tabular-nums break-all leading-snug">
            {coupon.code}
          </span>
        </div>

        {/* 절취선. 노치와 노치 사이를 잇는다(위 clip-path의 좌우 중앙 노치). */}
        <div className="relative w-px shrink-0">
          <span className="web-coupon-ticket__perforation left-0" aria-hidden="true" />
        </div>

        {/* 오른쪽 반쪽 — 복사 버튼. 실제 티켓의 '절취해서 내는 부분'에 해당한다. */}
        <div className="shrink-0 flex items-center justify-center pl-4">
          {/* **이 버튼만 예외적으로 베벨(`pixel-mask-btn-solid`)을 쓰지 않는다**
              (2026-08-13, 이란토). 티켓은 clip-path로 깎아낸 한 장의 종이라, 그 위에
              입체 버튼을 얹으면 별개의 부품이 올라온 것처럼 보여 일체감이 깨진다.
              면을 채우지 않고 현재 글자색으로 얇은 테두리만 둘러 티켓의 일부로 남긴다
              (`currentColor`라 티켓 색이 바뀌어도 따라온다). */}
          <button
            onClick={handleCopy}
            className="border border-current bg-transparent font-bold text-sm py-2 px-3 transition-opacity active:opacity-60"
          >
            {t("webCoupon.copyButton")}
          </button>
        </div>
      </div>

      {/* 복사 결과. `aria-live`로 스크린리더에도 알린다 — 버튼을 눌러도 화면이
          거의 바뀌지 않아서, 이것이 없으면 성공했는지 알 수 없다. */}
      <p className="text-xs text-center mt-1 min-h-4" aria-live="polite">
        {feedback === "copied" && <span className="text-accent">{t("webCoupon.copied")}</span>}
        {feedback === "failed" && <span className="text-error">{t("webCoupon.copyFailed")}</span>}
      </p>
    </div>
  );
}

"use client";

import { QRCodeSVG } from "qrcode.react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import { buildCouponQrPayload, isScannableCouponId } from "../lib/couponPayload";
import type { IssuedCoupon } from "../actions";

export default function CouponQR({
  coupon,
  onLightFace = false,
}: {
  coupon: IssuedCoupon;
  /**
   * 밝은 배경(가챠 카드 앞면) 위에 놓일 때 켠다. 테마의 --ink는 어두운 배경용
   * 밝은 색이라 그대로 두면 글자가 사라지고, 흰 QR 박스도 카드면에 묻힌다.
   *
   * ponytail: 지금은 **호출부가 전부 `onLightFace`를 켠다**(GatchaCard 한 곳뿐이다).
   * 내 쿠폰 목록이 QR을 직접 펼치던 경로가 앨범 개편으로 사라졌기 때문이다
   * (2026-08-13). 천장 — false 쪽 4개 분기가 죽은 코드로 남아 있다. 업그레이드 경로 —
   * 어두운 배경에 QR을 놓는 화면이 다시 생기지 않으면 prop째로 지우고 밝은 면
   * 스타일을 기본값으로 굳힐 것.
   */
  onLightFace?: boolean;
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
          밝은 카드면 위에서는 흰 박스만으로 경계가 사라지므로 그때만 테두리를 둔다
          (테두리는 quiet zone 바깥이라 스캔에 영향을 주지 않는다).

          **흰 배경과 quiet zone은 바깥 div가 아니라 SVG 안에서 해결한다**(marginSize).
          Darkreader 같은 강제 다크모드 확장이 div의 배경색은 뒤집으면서 SVG 내부
          경로는 그대로 두기 때문에, 여백을 div의 padding으로 만들면 그 부분만
          어두워져 QR을 둘러싼 quiet zone이 사라진다 — 스캐너가 코드를 못 읽는다.
          SVG 안에 넣으면 배경 <path>와 모듈이 함께 살아남는다. */}
      <div className={onLightFace ? "border border-black/25" : undefined}>
        {/* size는 SVG의 viewBox 기준값이고, 실제 표시 크기는 아래 style이 정한다.
            SVG라 축소해도 모듈이 뭉개지지 않는다.

            카드 앞면에서는 뷰포트(vw)가 아니라 **카드 폭**에 비례시킨다(cqw).
            카드는 컨테이너에 갇혀 있어서 뷰포트와 크기가 따로 노는데, vw로 잡으면
            좁은 패널 안에서 카드만 줄고 QR은 그대로라 프레임 밖으로 삐져나온다.
            44cqw는 저장 이미지(cardImage.ts)의 CARD_W * 0.44와 같은 비율이다 —
            둘이 어긋나면 화면과 저장본의 QR 크기가 조용히 달라진다.

            marginSize=4는 QR 규격이 요구하는 quiet zone 모듈 수다. bgColor/fgColor를
            기본값과 같더라도 명시하는 것은, 값이 SVG 속성으로 박혀 나가야 강제 다크모드
            확장이 건드리기 어렵기 때문이다. */}
        <QRCodeSVG
          value={buildCouponQrPayload(coupon.couponId, locale)}
          size={192}
          level="M"
          marginSize={4}
          bgColor="#FFFFFF"
          fgColor="#000000"
          style={onLightFace ? { width: "44cqw", height: "auto", display: "block" } : { display: "block" }}
        />
      </div>
      <p
        className={`font-bold text-center break-keep max-w-full${
          onLightFace ? " text-lg leading-snug" : " text-ink"
        }`}
      >
        {resolveLocalizedName(coupon.couponType, locale)}
      </p>
    </div>
  );
}

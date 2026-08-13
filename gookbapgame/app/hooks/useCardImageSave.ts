"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { renderCardImage } from "../lib/cardImage";
import { saveOrShareImage } from "../lib/shareCard";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import { resolveCouponEmoji } from "../lib/couponEmoji";
import type { Locale } from "../lib/i18n/types";
import type { IssuedCoupon } from "../actions";
import type { CouponDateLine } from "../lib/couponDates";

/**
 * 카드 앞면을 이미지로 굽고 저장/공유한다.
 *
 * 버튼(`WheelScreen`)과 그림 소재(`GatchaCard` 안의 QR `<svg>`)가 서로 다른
 * 컴포넌트에 있어서 훅으로 뺐다. 호출부는 `faceRef`를 카드에 꽂아주고
 * `save()`를 버튼에 걸면 된다.
 */
export function useCardImageSave(
  coupon: IssuedCoupon | null,
  flipped: boolean,
  locale: Locale,
  dateLines: CouponDateLine[],
  /** 사용 완료·만료 도장 문구. 화면(`GatchaCard`의 `usedStamp`)과 같은 값이어야 한다. */
  usedStamp: string | null = null
) {
  const faceRef = useRef<HTMLDivElement>(null);
  /** 뒤집힐 때 미리 구워두는 카드 이미지. 저장 버튼이 await 없이 공유할 수 있게 한다. */
  const imageBlobRef = useRef<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const emoji = coupon ? resolveCouponEmoji(coupon.couponType) : "";

  /**
   * 의존성 비교용 값. `dateLines`는 매 렌더 새로 만들어지는 배열이라 그대로 넣으면
   * 참조가 항상 달라져 이미지를 무한히 다시 굽는다. 내용이 같으면 같은 문자열이 된다.
   */
  const dateLinesKey = dateLines.map((line) => line.text).join("\n");

  const buildInput = useCallback(
    () => ({
      qrSvg: faceRef.current?.querySelector("svg") ?? null,
      couponName: resolveLocalizedName(coupon?.couponType, locale),
      dateTexts: dateLinesKey === "" ? [] : dateLinesKey.split("\n"),
      emoji,
      usedStamp,
    }),
    [coupon?.couponType, locale, dateLinesKey, emoji, usedStamp]
  );

  /**
   * 카드가 뒤집히는 순간 이미지를 미리 굽는다. 저장 버튼을 눌렀을 때 굽기
   * 시작하면 안 된다 — iOS Safari는 navigator.share를 "사용자 제스처가 아직
   * 유효한 동안"에만 허용하는데, 탭과 share 호출 사이에 이미지 로드·직렬화가
   * 끼면 그 유효 시간이 소모되어 NotAllowedError로 거부된다.
   * 미리 구워두면 클릭 핸들러가 곧바로 share를 부를 수 있다.
   *
   * **굽기 전에 이전 blob을 반드시 버린다.** `cancelled` 플래그는 늦게 도착한 결과가
   * 새 blob을 덮어쓰는 것만 막고, **이미 들고 있는 옛 blob은 그대로 남는다.**
   * 내 쿠폰 앨범은 같은 훅 인스턴스에서 쿠폰을 갈아끼우므로(A 열기 → 목록 → B 열기)
   * B의 굽기가 끝나기 전에 저장을 누르면 `save()`가 A의 이미지를 `coupon-B.png`라는
   * 이름으로 내보낸다 — **다른 쿠폰의 QR과 도장이 찍힌 파일을 손에 쥐여주는 것이다.**
   * (`WheelScreen`은 마운트당 쿠폰이 하나라 이 경로가 없었다.)
   * 비워두면 그 탭은 아래 폴백 경로로 떨어져 다시 굽는다 — iOS 공유 시트를 한 번
   * 놓칠 수 있지만, 엉뚱한 쿠폰을 저장하는 쪽이 비교할 수 없이 나쁘다.
   */
  useEffect(() => {
    if (!flipped || !coupon) return;
    let cancelled = false;
    imageBlobRef.current = null;

    renderCardImage(buildInput())
      .then((blob) => {
        if (!cancelled) imageBlobRef.current = blob;
      })
      .catch((error) => {
        // 실패해도 버튼은 남긴다. 누르면 그때 한 번 더 시도한다.
        console.error("[useCardImageSave] 카드 이미지 준비 실패:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [flipped, coupon, buildInput]);

  /**
   * `onAttempt`는 결과를 기다리지 않고 곧바로 불린다 — 공유 시트가 떠 있는 동안
   * '다음' 버튼이 이미 준비돼 있어야 시트를 닫자마자 넘어갈 수 있고, 애초에
   * "저장 완료"는 신뢰성 있게 감지할 수 없다(시트는 앨범 저장인지 전송인지
   * 알려주지 않고, 다운로드도 브라우저에 넘긴 시점까지만 안다).
   */
  const save = useCallback(
    async (onAttempt?: () => void) => {
      if (!coupon || saving) return;
      setSaveError(false);
      onAttempt?.();

      const filename = `coupon-${coupon.couponId}.png`;
      const ready = imageBlobRef.current;

      // 준비된 이미지가 있으면 await 없이 곧장 공유한다(위 useEffect 주석 참고).
      if (ready) {
        const result = await saveOrShareImage(ready, filename);
        if (result === "failed") setSaveError(true);
        return;
      }

      // 프리렌더가 실패했거나 아직 안 끝난 경우의 폴백. 이 경로에서는 공유 시트가
      // 뜨지 않고 다운로드로 떨어질 수 있다 — 아무것도 안 되는 것보다는 낫다.
      setSaving(true);
      try {
        const blob = await renderCardImage(buildInput());
        imageBlobRef.current = blob;
        const result = await saveOrShareImage(blob, filename);
        if (result === "failed") setSaveError(true);
      } catch (error) {
        console.error("[useCardImageSave] 카드 이미지 저장 실패:", error);
        setSaveError(true);
      } finally {
        setSaving(false);
      }
    },
    [coupon, saving, buildInput]
  );

  return { faceRef, save, saving, saveError };
}

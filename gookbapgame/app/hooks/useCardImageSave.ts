"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { renderCardImage } from "../lib/cardImage";
import { saveOrShareImage } from "../lib/shareCard";
import { resolveLocalizedName } from "../lib/i18n/localizedName";
import { resolveCouponEmoji } from "../lib/couponEmoji";
import type { Locale } from "../lib/i18n/types";
import type { CardFace } from "../lib/cardFace";
import type { CouponDateLine } from "../lib/couponDates";

/**
 * 카드 앞면을 이미지로 굽고 저장/공유한다.
 *
 * 버튼(`WheelScreen`)과 그림 소재(`GatchaCard` 안의 QR `<svg>`)가 서로 다른
 * 컴포넌트에 있어서 훅으로 뺐다. 호출부는 `faceRef`를 카드에 꽂아주고
 * `save()`를 버튼에 걸면 된다.
 */
export function useCardImageSave(
  /**
   * 앞면 구성. `GatchaCard`에 넘긴 것과 **같은 값**이어야 한다 — 화면과 저장본이
   * 같은 소재로 그려져야 하기 때문이다. null이면 굽지 않는다(카드가 없는 상태).
   */
  face: CardFace | null,
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

  /* 꽝 카드는 저장 대상이 아니다(아래 가드) — 이모지가 빈 문자열인 것은 그 자리를
     실제로는 쓰지 않는다는 뜻이다. */
  const emoji =
    face?.kind === "store"
      ? resolveCouponEmoji(face.coupon.couponType)
      : face?.kind === "online"
        ? face.emoji
        : "";

  /* 온라인몰 쿠폰은 QR이 없어 `querySelector("svg")`가 자연히 null이 되고,
     그 자리에 이 코드가 그려진다(`cardImage.ts`의 codeText). */
  const codeText = face?.kind === "online" ? face.code : null;
  const couponName =
    face?.kind === "store"
      ? resolveLocalizedName(face.coupon.couponType, locale)
      : face?.kind === "online"
        ? face.name
        : "";

  /**
   * 의존성 비교용 키. `face`는 호출부가 매 렌더 새로 만드는 객체라(`resolveCardFace`)
   * 그대로 이펙트 의존성에 넣으면 **이미지를 끝없이 다시 굽는다** — 아래
   * `dateLinesKey`와 똑같은 함정이다. 어느 쿠폰인지만 알면 되므로 그것을 가리키는
   * 값 하나로 줄인다.
   */
  const faceKey =
    face === null
      ? "none"
      : face.kind === "store"
        ? `store:${face.coupon.couponId}`
        : face.kind === "online"
          ? `online:${face.code}`
          : "miss";

  /**
   * 의존성 비교용 값. `dateLines`는 매 렌더 새로 만들어지는 배열이라 그대로 넣으면
   * 참조가 항상 달라져 이미지를 무한히 다시 굽는다. 내용이 같으면 같은 문자열이 된다.
   */
  const dateLinesKey = dateLines.map((line) => line.text).join("\n");

  const buildInput = useCallback(
    () => ({
      qrSvg: faceRef.current?.querySelector("svg") ?? null,
      codeText,
      couponName,
      dateTexts: dateLinesKey === "" ? [] : dateLinesKey.split("\n"),
      emoji,
      usedStamp,
    }),
    [codeText, couponName, dateLinesKey, emoji, usedStamp]
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
    /* 꽝은 저장할 것이 없다(QR도 코드도 상품명도 없는 안내 문구뿐). 예전에는
       `!coupon`으로 걸렀는데, 종류가 셋으로 늘면서 조건을 명시적으로 적는다. */
    if (!flipped || faceKey === "none" || faceKey === "miss") return;
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
  }, [flipped, faceKey, buildInput]);

  /**
   * 저장/공유를 시작한다.
   *
   * **"저장 완료"는 신뢰성 있게 감지할 수 없다** — 공유 시트는 앨범 저장인지 전송인지
   * 알려주지 않고, 다운로드도 브라우저에 넘긴 시점까지만 안다. 그래서 성공을 조건으로
   * 삼는 UI를 만들지 말 것. 한때 `onAttempt` 콜백으로 뽑기 화면의 '다음'을 드러냈는데
   * (저장을 눌러야 넘어갈 수 있었다), 앨범이 생겨 카드를 다시 열 수 있게 되면서
   * 그 게이트 자체가 없어졌다(2026-08-13, 이란토).
   */
  const save = useCallback(
    async () => {
      if (!face || face.kind === "miss" || saving) return;
      setSaveError(false);

      /* 파일명은 그 쿠폰을 가리키는 값으로 짓는다 — 매장은 쿠폰 id, 온라인몰은
         코드 자체다(그쪽에는 id에 해당하는 것이 코드뿐이다). */
      const filename =
        face.kind === "store" ? `coupon-${face.coupon.couponId}.png` : `coupon-${face.code}.png`;
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
    [face, saving, buildInput]
  );

  return { faceRef, save, saving, saveError };
}

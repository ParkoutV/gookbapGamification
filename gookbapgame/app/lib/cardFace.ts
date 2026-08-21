import type { IssuedCoupon } from "./issuedCoupons.ts";
import type { LocalizedName } from "./i18n/localizedName.ts";
import type { Locale } from "./i18n/types.ts";
import { resolveLocalizedName } from "./i18n/localizedName.ts";
import { DEFAULT_COUPON_EMOJI, ONLINE_COUPON_EMOJI, resolveCouponEmoji } from "./couponEmoji.ts";

/**
 * 뽑기 결과가 카드 앞면에 무엇을 올릴지.
 *
 * **`null`이면 카드를 쓰지 않는다** — 그 판정까지 여기서 한다. 예전에는
 * `WheelScreen`이 `usesCard = status === "won" || status === "miss"`로 직접
 * 갈랐는데, 거기에 `wonOnline`이 빠져 있어서 **가챠가 온라인몰 쿠폰을 뽑으면
 * 카드 연출이 통째로 건너뛰어졌다**(2026-08-21 실기 확인). `gatcha_logs`는
 * 이미 들어간 뒤라 뽑기 한 판을 쓰고도 카드를 한 번 못 보는 상태였다.
 * 같은 증상이 2026-08-17에 `wonButHidden`에서 한 번 났고("랜덤뽑기를 그대로
 * 건너뛴다"), 그때 분기만 갈랐지 이 판정은 고치지 않아 되살아난 것이다.
 *
 * 판정과 앞면 구성을 **한 함수에 묶어 둔 것이 요점이다.** 둘이 갈라져 있으면
 * "카드를 쓴다고 해놓고 올릴 것이 없는" 조합이 다시 생긴다.
 */
export type CardFace =
  /** 매장 쿠폰. QR을 스캐너에 보여준다. */
  | { kind: "store"; coupon: IssuedCoupon }
  /**
   * 온라인몰 쿠폰. **QR도 사용기한도 없다** — 평문 코드를 온라인몰에 붙여넣는
   * 물건이라 QR 자리에 코드를 대신 올린다(2026-08-21, 이란토).
   *
   * 이름을 여기서 문자열로 확정하는 이유: 출처가 `web_coupon_settings.title`
   * (운영자가 대시보드에서 적는 다국어 맵)이라 `IssuedCoupon.couponType`과
   * 형태가 같지 않고, 화면과 저장 이미지가 **같은 문자열**을 써야 하기 때문이다.
   */
  | { kind: "online"; code: string; name: string; emoji: string }
  /** 꽝. 앞면에 안내 문구만 올린다. */
  | { kind: "miss" };

/**
 * `resolveCardFace`의 입력.
 *
 * `DrawCouponResult`를 그대로 받지 않는다 — 그 타입은 `app/actions.ts`(서버 액션)에
 * 있어서 여기서 import하면 이 파일이 `next/headers`를 타고 단위 테스트가 죽는다.
 * `sessionPlan.ts`·`participantId.ts`를 갈라낸 것과 같은 이유다.
 */
export type CardFaceInput = {
  status: string;
  /** `won`일 때의 매장 쿠폰. */
  coupon?: IssuedCoupon | null;
  /** `wonOnline`일 때의 평문 코드. */
  code?: string | null;
  /** `web_coupon_settings.title`. 없거나 이 로케일이 비면 `fallbackName`으로 떨어진다. */
  settingsTitle?: LocalizedName | null;
  locale: Locale;
  /** 설정 조회가 실패했을 때 쓸 이름. 호출부가 `t("webCoupon.label")`을 넘긴다. */
  fallbackName: string;
};

/**
 * 뽑기 결과에서 카드 앞면 구성을 만든다. 카드를 쓰지 않는 결과면 `null`.
 *
 * 카드를 쓰지 않는 셋:
 * - `rejected` / `error`: 뽑기가 성립하지 않았다. 카드를 뒤집으면 기회를 쓴 것처럼 보인다.
 * - `wonButHidden`: 앞면에 올릴 것이 아무것도 없다(id도 이름도 없음).
 *
 * **`wonOnline`을 여기 넣지 말 것.** 그것이 이 함수가 생긴 이유다(위 주석).
 */
export function resolveCardFace(input: CardFaceInput): CardFace | null {
  if (input.status === "miss") return { kind: "miss" };

  if (input.status === "won") {
    // 이름·QR이 전부 쿠폰 행에서 나오므로 행이 없으면 올릴 것이 없다.
    return input.coupon ? { kind: "store", coupon: input.coupon } : null;
  }

  if (input.status === "wonOnline") {
    const code = (input.code ?? "").trim();
    // 코드가 이 쿠폰의 전부다. 없으면 카드에 올릴 것이 없어 `wonButHidden`과 같은
    // 처지가 된다 — 빈 카드를 뒤집게 하느니 텍스트 분기로 보낸다.
    if (code === "") return null;
    const name = resolveOnlineName(input.settingsTitle, input.locale, input.fallbackName);
    return { kind: "online", code, name, emoji: resolveOnlineEmoji(name) };
  }

  return null;
}

/**
 * 온라인몰 쿠폰의 표시 이름.
 *
 * **로케일 파일의 문구는 기본값일 뿐이다** — 혜택 내용은 운영자가
 * `web_coupon_settings.title`에 문장으로 적는다(실제 값: "1원 할인 쿠폰
 * (쿠폰삭제 필수)"). 화면에 하드코딩하지 말 것.
 *
 * 실제 데이터가 `ja: ""`, `zh` 키 없음이라 **폴백이 늘 걸리는 경로다**
 * (`webCoupons.ts` 참고). `resolveLocalizedName`이 요청 로케일 → en → ko 순으로
 * 떨어뜨리고, 그것마저 비면 여기 `fallbackName`이 받는다.
 */
function resolveOnlineName(
  title: LocalizedName | null | undefined,
  locale: Locale,
  fallbackName: string
): string {
  const resolved = title ? resolveLocalizedName(title, locale).trim() : "";
  return resolved === "" ? fallbackName : resolved;
}

/**
 * 코너 마크 이모지.
 *
 * 매장 쿠폰과 **같은 표를 탄다** — 온라인 쿠폰 이름도 "…할인 쿠폰"처럼 적히므로
 * `resolveCouponEmoji`가 이미 🎫를 뽑아준다. 표에 안 걸릴 때만 온라인 전용
 * 기본값으로 떨어뜨린다(음식 이모지인 `DEFAULT_COUPON_EMOJI`는 온라인몰 쿠폰에
 * 어울리지 않는다).
 */
function resolveOnlineEmoji(name: string): string {
  const matched = resolveCouponEmoji({ ko: name });
  // 표에 안 걸리면 `resolveCouponEmoji`는 음식 이모지(🍽)를 준다 — 온라인몰
  // 쿠폰에는 어울리지 않으므로 그때만 티켓으로 바꾼다.
  return matched === DEFAULT_COUPON_EMOJI ? ONLINE_COUPON_EMOJI : matched;
}

/**
 * 카드 앞면에서 **코드 블록**이 차지하는 자리. 온라인몰 쿠폰은 QR 대신 평문
 * 코드를 그 자리에 올린다(2026-08-21, 이란토).
 *
 * **화면(`GatchaCard`)과 저장 이미지(`cardImage.ts`)가 이 값을 함께 쓴다.**
 * 카드 앞면은 DOM 캡처가 아니라 같은 구성을 canvas에 다시 그리는 구조라,
 * 양쪽이 좌표를 각자 들고 있으면 조용히 어긋난다 — QR 크기(44cqw ↔ CARD_W*0.44)와
 * 날짜 줄에서 실제로 반복해서 났던 사고다. 여기 모아두면 갈릴 수가 없다.
 *
 * 화면은 `cqw`(카드 폭 기준 컨테이너 단위), canvas는 `CARD_W` 배수로 쓴다 —
 * 기준이 같은 카드 폭이라 숫자가 그대로 통한다. **`vw`를 쓰지 말 것**: 카드는
 * 패널 안에 갇혀 뷰포트와 따로 논다(`CouponQR` 주석).
 */
export const CODE_BLOCK = {
  /** 폭. QR과 같은 값이라 두 종류의 카드가 같은 폭의 블록을 갖는다. */
  width: 0.44,
  /** 높이. QR은 정사각이지만 코드는 한 줄이라 낮다. */
  height: 0.16,
  /** 코드 글자 크기. 13자(`B43BF088282C4`)가 폭 안에 들어가는 값이다. */
  font: 0.052,
} as const;

import type { LocalizedName } from "./i18n/localizedName.ts";

/**
 * `get_my_coupons` RPC가 돌려주는 한 줄.
 *
 * **이 응답에 상품명은 없다.** 반환 컬럼은 `coupon_id` / `participant_id` /
 * `coupon_effect_id` / `is_used` / `issued_at` / `expired_at`뿐이다
 * (gookbapanalyze/AGENTS.md의 반환 예시). 이름은 `coupon_effect_id`로
 * `coupon_effects`를 따로 읽어야 나온다 — `row.coupon_type`을 기대하면
 * `undefined`가 되어 **에러 없이** 상품명이 "—", 코너 이모지가 기본값으로
 * 떨어진다(2026-08-07 배포에서 실제로 났다).
 */
export type IssuedCouponRow = {
  coupon_id: string;
  coupon_effect_id: string;
  is_used: boolean;
  issued_at?: string;
  expired_at: string | null;
};

export type IssuedCoupon = {
  couponId: string;
  couponType: LocalizedName;
  isUsed: boolean;
  /** ISO 문자열. null이면 만료 없음. */
  expiredAt: string | null;
};

/**
 * 최신 발급순으로 정렬한다. RPC의 정렬 순서는 코드로 확인할 수 없어서
 * (마이그레이션 파일이 없는 프로덕션 전용 함수) 여기서 강제한다 —
 * `drawCoupon()`이 `[0]`을 "방금 발급된 쿠폰"으로 쓰기 때문에, 순서가 뒤집히면
 * 오래된 쿠폰의 QR을 새 당첨 상품인 것처럼 보여준다.
 *
 * 시각 컬럼은 `created_at`이 아니라 **`issued_at`**이다. 이름을 틀리면 아래
 * `every()`가 false가 되어 정렬이 통째로 건너뛰어진다 — 조용히, 에러 없이.
 */
export function sortByIssuedAt(rows: IssuedCouponRow[]): IssuedCouponRow[] {
  if (!rows.every((r) => typeof r.issued_at === "string")) return rows;
  return [...rows].sort((a, b) => (a.issued_at! < b.issued_at! ? 1 : -1));
}

/** 이름 맵을 붙여 화면이 쓰는 형태로 만든다. 이름이 없으면 undefined로 두어 "—"가 뜬다. */
export function toIssuedCoupon(
  row: IssuedCouponRow,
  names: Map<string, LocalizedName>
): IssuedCoupon {
  return {
    couponId: row.coupon_id,
    couponType: names.get(row.coupon_effect_id),
    isUsed: row.is_used,
    expiredAt: row.expired_at,
  };
}

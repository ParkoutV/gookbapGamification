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
  /**
   * 발급 시각(ISO 문자열). RPC 응답에 없으면 undefined —
   * `isFreshlyIssued`가 이 경우를 "최근 아님"으로 친다.
   */
  issuedAt?: string;
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
    issuedAt: row.issued_at,
  };
}

/**
 * "방금 발급된 쿠폰인가". draw가 거절됐을 때 **가지고 있던 쿠폰을 당첨으로 띄워도
 * 되는지**를 가른다.
 *
 * 서버 뽑기 제한이 1일 1회에서 **1일 3회**로 바뀌면서, 거절 복구가 "쓸 수 있는 쿠폰
 * 아무거나"를 골라 `won`으로 띄우던 것이 실제 버그가 됐다 — 며칠 전 안 쓴 쿠폰이
 * 매번 새로 당첨된 것처럼 카드 뒤집기 연출과 당첨 효과음까지 달고 나왔다.
 * 복구가 노리는 것은 오직 "룰렛 도중 새로고침"이고, 그건 발급 직후 몇 분 안이다.
 *
 * `issuedAt`이 없거나 파싱되지 않으면 **최근이 아닌 것으로 친다**(fail closed).
 * 오래된 쿠폰을 새 당첨으로 보여주는 쪽이, 드물게 새로고침한 사람에게 거절 문구를
 * 보여주는 쪽보다 훨씬 나쁘다.
 *
 * ponytail: 임계값은 고정 상수다. 천장 — 창을 넓히면 같은 날 앞서 뽑은 쿠폰이
 * 다시 새 당첨으로 새어 들어온다(서버가 하루 3회를 허용하므로 정당한 두 번의 뽑기가
 * 몇 시간 떨어져 있을 수 있다). 업그레이드 경로 — 서버가 거절 응답에 방금 발급한
 * 쿠폰 id를 실어주면 시각 비교 자체가 필요 없어진다.
 */
const FRESHLY_ISSUED_WINDOW_MS = 5 * 60 * 1000;

export function isFreshlyIssued(coupon: IssuedCoupon, now: number): boolean {
  if (coupon.issuedAt == null) return false;
  const issued = new Date(coupon.issuedAt).getTime();
  if (Number.isNaN(issued)) return false;
  // 미래 시각(서버·기기 시계 어긋남)도 창 안으로 본다 — 방금 발급된 것이 맞다.
  return now - issued < FRESHLY_ISSUED_WINDOW_MS;
}

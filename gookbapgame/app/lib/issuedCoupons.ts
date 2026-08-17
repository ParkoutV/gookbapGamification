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
  /**
   * 쿠폰이 실제로 유효해지는 시작 시각.
   *
   * **아직 `get_my_coupons` 응답에 없다**(2026-08-12 기준). `issued_coupons` 테이블에는
   * 있고 스캐너(`get_coupon_info_for_scan`)와 draw 응답은 받지만, 이 RPC의 반환 컬럼에는
   * 빠져 있다 — `issued_coupons` 직접 SELECT는 RLS로 막혀 있어 우회로도 없다.
   * 그래서 옵셔널이며, 서버가 컬럼을 추가하면 코드 수정 없이 화면에 나타난다.
   */
  valid_from?: string | null;
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
  /** 사용 시작 시각(ISO 문자열). RPC가 아직 안 준다 — `IssuedCouponRow` 주석 참고. */
  validFrom?: string | null;
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
    validFrom: row.valid_from,
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

/**
 * draw가 "당첨"이라고 알려준 그 쿠폰을 목록에서 집어낸다.
 *
 * **`couponId`가 있으면 그것으로만 짝짓는다.** 저쪽 draw 응답은 2026-08-04부터
 * `coupon_id`를 돌려주는데(`gatchaApi.ts`), 우리 문서가 "없다"고 적어둔 탓에
 * 오래도록 `fetchMyCoupons()[0]`을 "방금 그것"으로 **추측**해 왔다. 그 추측은 두
 * 자리에서 조용히 틀린다:
 *
 * 1. 뽑힌 것이 온라인몰 전용 효과면 `withoutOnlineCoupons`가 그 행을 걷어내므로
 *    `[0]`은 **다른 쿠폰**이다. 보관함이 비어 있으면 "발급됐지만 표시할 수 없어요"로
 *    떨어지고, 비어 있지 않으면 **며칠 전 매장 쿠폰이 새 당첨으로** 카드 뒤집기와
 *    당첨 효과음까지 달고 나온다(2026-08-11에 rejected 경로에서 고쳤던 바로 그 버그가
 *    won 경로에 그대로 열려 있었다).
 * 2. `sortByIssuedAt`이 `issued_at` 누락으로 정렬을 건너뛰면 `[0]`의 의미가 사라진다.
 *
 * id로 짝지으면 시각 휴리스틱 없이 둘 다 원천 차단된다.
 *
 * **`couponId`가 없을 때만 `[0]` 폴백을 쓰고, 그때는 `isFreshlyIssued`를 건다.**
 * 저쪽이 응답 형식을 되돌리는 경우의 보험이며, 폴백에 가드가 없으면 위 1번 증상이
 * 그대로 되살아난다. 찾지 못하면 `null`이고, 호출부는 그것을 **읽기 실패**로 다뤄야
 * 한다 — 발급 자체는 서버에서 이미 일어났다.
 */
export function matchIssuedCoupon(
  coupons: IssuedCoupon[],
  couponId: string | undefined,
  now: number
): IssuedCoupon | null {
  if (couponId != null) {
    return coupons.find((c) => c.couponId === couponId) ?? null;
  }
  const latest = coupons[0];
  return latest && isFreshlyIssued(latest, now) ? latest : null;
}

/**
 * 온라인몰 전용 쿠폰 효과를 목록에서 걷어낸다.
 *
 * **`coupon_effects`의 '웹 쿠폰'은 손님에게 보여줄 상품이 아니라 지시자다**
 * (2026-08-15 이란토). 구조상 '쿠폰' 카테고리 아래에 '웹 쿠폰' 항목이 있고, 그것이
 * 뽑히면 아임웹 기반 외부 쿠폰(`web_coupons`)이 따로 발급돼 연결된다. 저쪽 문서도
 * `is_online_coupon`을 "true면 **스캐너 조회·KPI 수집에서 제외**되며 web_coupons
 * 할당을 트리거한다"고 적고 있다(`gookbapanalyze/AGENTS.md`).
 *
 * 그런데 발급 자체는 `issued_coupons`에 매장 쿠폰과 같은 모양으로 남아서, 앨범이
 * 그것을 **QR 달린 카드로 그리고 서버가 준 `is_used: true` 때문에 '사용 완료'
 * 도장까지 찍었다**(실기 스크린샷). 스캐너가 애초에 받지 않는 QR이라 손님에게는
 * 아무 의미가 없고, 같은 혜택이 온라인몰 티켓으로 이미 따로 뜬다 — 중복이자 오해다.
 *
 * **`fetchMyCoupons` 한 곳에서 거른다.** 화면마다 거르면 새 화면이 생길 때 빠뜨린다.
 */
export function withoutOnlineCoupons(
  rows: IssuedCouponRow[],
  onlineEffectIds: ReadonlySet<string>
): IssuedCouponRow[] {
  if (onlineEffectIds.size === 0) return rows;
  return rows.filter((r) => !onlineEffectIds.has(r.coupon_effect_id));
}

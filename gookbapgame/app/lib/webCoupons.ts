/**
 * 온라인몰 전용 쿠폰.
 *
 * **일반(매장) 쿠폰과 별개의 물건이다.** 매장 쿠폰은 QR을 스캐너에 보여주는 것이고,
 * 이쪽은 평문 코드를 공식 온라인몰에 **붙여넣어** 등록한다. 그래서 QR도, 사용기한도,
 * 사용 여부도 없다 — `IssuedCoupon`과 타입을 합치지 말 것. 필드가 겹치지 않아
 * 합치면 한쪽에는 늘 `undefined`인 칸이 생기고, 화면이 어느 쪽인지 판정하려고
 * 그 `undefined`를 보게 된다.
 *
 * 서버는 `web_coupons` 테이블과 `get_my_web_coupons` / `assign_web_coupon` RPC,
 * 그리고 `POST /api/web-coupons/assign` 엔드포인트를 이미 갖고 있다
 * (`gookbapanalyze/AGENTS.md`의 12번 절과 Web Coupon API Guide).
 */

/**
 * `web_coupon_settings`의 단일 행. **혜택 내용이 여기 문장으로 들어간다** —
 * 할인율·금액을 담는 숫자 컬럼은 없다(2026-08-13 실물 확인). 운영자가 대시보드에서
 * 적는 값이므로 화면에 하드코딩하지 말 것.
 *
 * `Everyone: SELECT`라 anon이 직접 읽을 수 있다(RPC 불필요).
 * 실제 값 예: `title: { ko: "1원 할인 쿠폰 (쿠폰삭제 필수)", en: "Web Coupon", ja: "" }`
 * — **`ja`가 빈 문자열이고 `zh`는 키 자체가 없다.** `resolveLocalizedName`이 둘 다
 * "없는 것"으로 보고 en → ko로 떨어뜨리므로 그대로 쓴다.
 */
export type WebCouponSettings = {
  /** 티켓에 뜨는 이름. 비어 있으면 화면이 로케일 파일의 기본 문구로 폴백한다. */
  title: Record<string, string> | null;
  /** 부연 설명. 지금은 비어 있으며, 비면 줄 자체를 그리지 않는다. */
  description: Record<string, string> | null;
};

/** `get_my_web_coupons` RPC가 돌려주는 한 줄. */
export type WebCouponRow = {
  /**
   * 코드 컬럼 이름이 **테이블과 RPC에서 다르다.** 테이블은 `coupon_code`인데
   * RPC 반환 예시는 `code`다(저쪽 AGENTS.md 430행 부근). 둘 다 받아 두는 이유가
   * 이것이다 — 한쪽만 읽으면 `undefined`가 되어 **에러 없이** 코드가 빈칸으로 뜬다.
   * `coupon_effects`에서 `row.coupon_type`을 기대했다가 상품명이 "—"로 떨어진
   * 2026-08-07 사고와 같은 구조다.
   */
  code?: string | null;
  coupon_code?: string | null;
  assigned_at?: string | null;
  id?: string | number | null;
};

export type WebCoupon = {
  /** 온라인몰에 붙여넣는 평문 코드. 예: `7FB6E68B838F4` */
  code: string;
  /** 배정 시각(ISO 문자열). 없으면 undefined. */
  assignedAt?: string;
};

/**
 * RPC 행을 화면이 쓰는 형태로 바꾼다. 코드가 없는 행은 **버린다** —
 * 코드가 이 쿠폰의 전부라, 빈 칸을 격자에 띄우면 누를 수는 있는데 복사할 것이 없다.
 */
export function toWebCoupons(rows: WebCouponRow[]): WebCoupon[] {
  const out: WebCoupon[] = [];
  for (const row of rows) {
    const code = (row.code ?? row.coupon_code ?? "").trim();
    if (code === "") continue;
    /* 시각이 없으면 **키 자체를 넣지 않는다.** `assignedAt: undefined`를 실으면 값 없는
       키가 생겨 호출부의 deepEqual 비교가 어긋난다 — `gatchaApi.ts`의 `code`에서 같은
       이유로 테스트 2건이 깨진 적이 있다. */
    out.push(
      typeof row.assigned_at === "string" ? { code, assignedAt: row.assigned_at } : { code }
    );
  }
  return out;
}

/**
 * 최신 배정순. `sortByIssuedAt`과 같은 방침이다 — RPC의 정렬 순서를 신뢰할 수 없어
 * 여기서 강제하고, **한 행이라도 시각이 없으면 통째로 건너뛴다**(뒤섞느니 원래
 * 순서를 두는 편이 낫다).
 */
export function sortByAssignedAt(coupons: WebCoupon[]): WebCoupon[] {
  if (!coupons.every((c) => typeof c.assignedAt === "string")) return coupons;
  return [...coupons].sort((a, b) => (a.assignedAt! < b.assignedAt! ? 1 : -1));
}

export type GatchaDrawResult =
  /**
   * 당첨. **상품명은 여기서 가져가지 않는다** — 화면에 뜨는 것은 `get_my_coupons`가
   * 돌려준 쿠폰이고, 여기에 이름을 실어두면 아무도 쓰지 않는 두 번째 진실이 생긴다
   * (실제로 그랬고, 소비처가 없다 보니 파싱이 빠진 것도 오래 눈에 띄지 않았다).
   *
   * 대신 **식별에 필요한 두 가지만** 나른다. 둘 다 표시용이 아니다.
   *
   * - `couponId`: 방금 발급된 `issued_coupons.coupon_id`. 저쪽은 insert에
   *   `.select('coupon_id')`를 붙여 **2026-08-04(`9774e07`)부터 이걸 돌려준다** —
   *   우리 AGENTS.md가 오래도록 "없다"고 적어둔 탓에 `drawCoupon()`이 목록의
   *   `[0]`을 "방금 그것"으로 **추측**해 왔다. 그 추측은 온라인몰 쿠폰이 뽑혀
   *   목록에서 걸러지면 무너진다(아래 `webCouponCode` 참고).
   * - `webCouponCode`: 뽑힌 것이 온라인몰 전용 효과(`is_online_coupon`)일 때만 온다
   *   (2026-08-06 `504cfa7`). 저쪽이 `web_coupons` 한 장을 배정했다는 뜻이며,
   *   그 발급은 `issued_coupons`에도 남지만 우리는 그 행을 걷어내므로
   *   (`withoutOnlineCoupons`) **매장 쿠폰 목록에서는 영영 찾을 수 없다.**
   *   이 값이 있으면 목록을 뒤지지 말고 곧장 온라인 당첨으로 처리해야 한다.
   *
   * **둘 다 옵셔널이고 없으면 키를 넣지 않는다** — `code`와 같은 이유다(아래).
   */
  | { ok: true; won: true; couponId?: string; webCouponCode?: string }
  | { ok: true; won: false }
  /**
   * 서버가 의도적으로 거절(4xx) — 기간 제한/플레이 부족/설문 미완료.
   * 재시도해도 소용없다.
   *
   * `code`는 거절 사유(`LIMIT_EXCEEDED` / `PLAY_LIMIT_EXCEEDED` /
   * `SURVEY_REQUIRED`)다. **지금은 아무도 읽지 않는다** — 세 사유가 모두
   * `wheel.rejected` 하나로 떨어진다. 배선만 미리 깔아둔 것이며, 쿨타임 조건이
   * 확정되면("N시간 후 다시 가능") 그때 사유별 문구를 붙인다.
   *
   * 서버가 `code` 없이 거절할 수도 있으므로 옵셔널이다. `error`(서버가 만든
   * 한국어 문자열)는 화면에 그대로 띄우지 말 것 — 다른 로케일 사용자에게
   * 한글이 노출된다(AGENTS.md).
   */
  | { ok: false; rejected: true; error: string; code?: string }
  /** 네트워크·5xx·파싱 실패 — 재시도 버튼을 보여줄 상황. */
  | { ok: false; rejected: false; error: string };

export async function requestGatchaDraw(
  apiUrl: string,
  participantId: string
): Promise<GatchaDrawResult> {
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId }),
    });
  } catch (error) {
    return {
      ok: false,
      rejected: false,
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, rejected: false, error: `Invalid JSON response (status ${res.status})` };
  }

  const record = (body ?? {}) as Record<string, unknown>;

  if (!res.ok) {
    const message =
      typeof record.error === "string" ? record.error : `Unexpected response (status ${res.status})`;
    // 4xx는 서버가 조건을 보고 거절한 것이라 재시도가 의미 없다. 5xx는 일시적일 수 있다.
    // code가 없으면 키 자체를 넣지 않는다 — `code: undefined`를 실으면 값 없는 키가
    // 생겨 호출부의 deepEqual 비교가 어긋난다(실제로 기존 테스트 2건이 깨졌다).
    const code = typeof record.code === "string" ? { code: record.code } : null;
    return { ok: false, rejected: res.status < 500, error: message, ...code };
  }

  if (record.success !== true) {
    return { ok: false, rejected: false, error: `Unexpected response (status ${res.status})` };
  }

  if (record.coupon_type == null) {
    return { ok: true, won: false };
  }

  // 값이 있을 때만 키를 만든다 — `code`와 같은 이유로, `undefined`를 실으면 값 없는
  // 키가 생겨 호출부의 deepEqual 비교가 어긋난다.
  const couponId = typeof record.coupon_id === "string" ? { couponId: record.coupon_id } : null;
  // 저쪽은 매장 쿠폰일 때 이 자리를 `undefined`로 둔다(JSON에서는 키가 통째로 빠진다).
  const webCouponCode =
    typeof record.web_coupon_code === "string" ? { webCouponCode: record.web_coupon_code } : null;

  return { ok: true, won: true, ...couponId, ...webCouponCode };
}

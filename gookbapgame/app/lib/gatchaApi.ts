export type GatchaDrawResult =
  /**
   * 당첨 여부만 알린다. **상품명은 여기서 가져가지 않는다** — draw 응답에는
   * `coupon_id`가 없어서 `drawCoupon()`이 어차피 `get_my_coupons`로 쿠폰을 다시
   * 읽고, 화면에 뜨는 것은 그쪽 결과다. 여기에 이름을 실어두면 아무도 쓰지 않는
   * 두 번째 진실이 생긴다 — 실제로 그랬고, 소비처가 없다 보니 파싱이 빠진 것도
   * 오래 눈에 띄지 않았다.
   */
  | { ok: true; won: true }
  | { ok: true; won: false }
  /** 서버가 의도적으로 거절(4xx) — 쿨타임/설문 미완료. 재시도해도 소용없다. */
  | { ok: false; rejected: true; error: string }
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

  let body: any;
  try {
    body = await res.json();
  } catch {
    return { ok: false, rejected: false, error: `Invalid JSON response (status ${res.status})` };
  }

  if (!res.ok) {
    const message =
      typeof body?.error === "string" ? body.error : `Unexpected response (status ${res.status})`;
    // 4xx는 서버가 조건을 보고 거절한 것이라 재시도가 의미 없다. 5xx는 일시적일 수 있다.
    return { ok: false, rejected: res.status < 500, error: message };
  }

  if (body?.success !== true) {
    return { ok: false, rejected: false, error: `Unexpected response (status ${res.status})` };
  }

  if (body.coupon_type == null) {
    return { ok: true, won: false };
  }

  return { ok: true, won: true };
}

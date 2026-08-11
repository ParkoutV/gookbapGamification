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
    // code가 없으면 키 자체를 넣지 않는다 — `code: undefined`를 실으면 값 없는 키가
    // 생겨 호출부의 deepEqual 비교가 어긋난다(실제로 기존 테스트 2건이 깨졌다).
    const code = typeof body?.code === "string" ? { code: body.code } : null;
    return { ok: false, rejected: res.status < 500, error: message, ...code };
  }

  if (body?.success !== true) {
    return { ok: false, rejected: false, error: `Unexpected response (status ${res.status})` };
  }

  if (body.coupon_type == null) {
    return { ok: true, won: false };
  }

  return { ok: true, won: true };
}

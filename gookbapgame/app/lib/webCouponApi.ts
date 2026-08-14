/**
 * 온라인몰 쿠폰 발급 API 클라이언트(`POST /api/web-coupons/assign`).
 *
 * 서버가 **설문(survey_phase = 1) 완료를 직접 검증**하고, `FOR UPDATE SKIP LOCKED`로
 * 원자적으로 미배정 코드를 하나 집어준다(`gookbapanalyze/AGENTS.md`의 Web Coupon API
 * Guide). 그래서 클라이언트는 자격을 판정하지 않는다 — 자격이 없으면 403이 온다.
 *
 * 응답이 **이중으로 감싸여 있다**: `{ success: true, data: { success: true, code } }`.
 * 바깥 `success`만 보고 `body.code`를 읽으면 `undefined`가 된다.
 */
export type WebCouponAssignResult =
  | { ok: true; code: string }
  /**
   * 서버가 의도적으로 거절(4xx). 대부분 설문 미완료(`survey_required: true`)이고,
   * **재고 소진도 여기로 온다**(미배정 쿠폰이 없으면 집어줄 것이 없다).
   * 재시도해도 소용없다.
   */
  | { ok: false; rejected: true; error: string }
  /** 네트워크·5xx·파싱 실패. 다음 기회에 다시 시도할 수 있다. */
  | { ok: false; rejected: false; error: string };

export async function requestWebCouponAssign(
  apiUrl: string,
  participantId: string
): Promise<WebCouponAssignResult> {
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
    // 4xx는 서버가 조건을 보고 거절한 것이라 재시도가 의미 없다(설문 미완료·재고 소진).
    return { ok: false, rejected: res.status < 500, error: message };
  }

  // 껍데기 두 겹을 벗긴다. 바깥이 `{ success, data }`, 안쪽이 `{ success, code }`다.
  const data = (record.data ?? {}) as Record<string, unknown>;
  const code = typeof data.code === "string" ? data.code.trim() : "";
  if (code === "") {
    return { ok: false, rejected: false, error: `Response has no coupon code (status ${res.status})` };
  }

  return { ok: true, code };
}

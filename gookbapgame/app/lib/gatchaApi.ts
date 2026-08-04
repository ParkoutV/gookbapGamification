import type { LocalizedName } from "./i18n/localizedName.ts";

export type GatchaDrawResult =
  | { ok: true; won: true; couponType: LocalizedName }
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

  return { ok: true, won: true, couponType: body.coupon_type };
}

import { randomUUID, createHash } from "node:crypto";

const TOKEN_COOKIE_NAME = "gookbapgame_token";
/**
 * 산출된 `participant_id`를 그대로 담는 두 번째 쿠키(2026-08-21, 이란토).
 *
 * **토큰 쿠키의 이중화다.** `participant_id`는 원래 `gookbapgame_token`에서 매번
 * 다시 계산되는 값이라, 그 쿠키 하나가 유실되면 새 id가 발급되어 설문 이력·쿠폰·
 * 랭킹이 통째로 끊긴다. 둘 중 하나만 살아 있어도 세션이 이어지도록 값을 직접 남긴다.
 *
 * **`httpOnly`인 것이 중요하다.** `/api/web-coupons/assign`과 `/api/gatcha/draw`는
 * `participant_id` **하나만으로 인증 없이** 동작하므로, JS가 읽을 수 있는 쿠키에
 * 두면 남의 id로 쿠폰을 발급받거나 뽑기를 소진시킬 수 있다. 쿠키는 httpOnly여도
 * 브라우저에 저장되므로 세션 연속성이라는 목적은 그대로 달성된다.
 * **이 플래그를 떼지 말 것.**
 */
const PARTICIPANT_ID_COOKIE_NAME = "gookbapgame_pid";
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2; // 2년

export async function getOrIssueToken(): Promise<string> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const existing = cookieStore.get(TOKEN_COOKIE_NAME)?.value;
  if (existing) return existing;

  const issued = randomUUID();
  cookieStore.set(TOKEN_COOKIE_NAME, issued, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE_SECONDS,
  });
  return issued;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 저장된 `participant_id`. 형식 검증은 `participantId.ts`가 한다 — 여기서는 읽기만. */
export async function readStoredParticipantId(): Promise<string | undefined> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  return cookieStore.get(PARTICIPANT_ID_COOKIE_NAME)?.value;
}

/**
 * `participant_id`를 쿠키에 심는다.
 *
 * **실패해도 던지지 않는다.** 쿠키 쓰기는 서버 액션·route handler 안에서만
 * 허용되는데(Next 15), 이 값은 어디까지나 토큰 쿠키의 **이중화**라 못 심어도
 * 기존 경로(토큰 → 해시)가 그대로 살아 있다. 세션 이중화를 못 했다고 게임이
 * 멈추는 쪽이 훨씬 나쁘다.
 */
export async function storeParticipantId(participantId: string): Promise<void> {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    cookieStore.set(PARTICIPANT_ID_COOKIE_NAME, participantId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TOKEN_MAX_AGE_SECONDS,
    });
  } catch (error) {
    console.error("[storeParticipantId] participant_id 쿠키 저장 실패:", error);
  }
}

import { randomUUID, createHash } from "node:crypto";

const TOKEN_COOKIE_NAME = "gookbapgame_token";
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

const TERM_ACK_COOKIE = "gookbapgame_term_ack";
const TUTORIAL_SEEN_COOKIE = "gookbapgame_tutorial_seen";

// 2년. 참여자 식별 토큰(gookbapgame_token)의 만료와 맞췄다.
const MAX_AGE_SEC = 63072000;

/**
 * "이 브라우저에서 TERM 고지를 봤다 / 튜토리얼을 봤다"는 표시.
 *
 * localStorage를 쓰는 pendingDraw.ts / surveySubmitted.ts와 달리 쿠키를 쓰는 이유는
 * 만료가 있기 때문이다. TERM은 의무 고지라서 2년 뒤 다시 노출되는 것이 방어 가능한
 * 동작인 반면 localStorage는 만료되지 않는다.
 *
 * 서버는 이 값을 읽지 않는다(그래서 httpOnly가 아니다). 동의 이력을 서버에 남기는
 * 설계로 확장하지 말 것 — 자세한 이유는
 * docs/superpowers/specs/2026-08-06-first-run-sequence-design.md 참고.
 */
function isAvailable(): boolean {
  return typeof document !== "undefined";
}

function readFlag(name: string): boolean {
  if (!isAvailable()) return false;
  return document.cookie
    .split(";")
    .some((entry) => entry.trim() === `${name}=1`);
}

function writeFlag(name: string): void {
  if (!isAvailable()) return;
  document.cookie = `${name}=1; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax`;
}

export function hasAcknowledgedTerm(): boolean {
  return readFlag(TERM_ACK_COOKIE);
}

export function markTermAcknowledged(): void {
  writeFlag(TERM_ACK_COOKIE);
}

export function hasSeenTutorial(): boolean {
  return readFlag(TUTORIAL_SEEN_COOKIE);
}

export function markTutorialSeen(): void {
  writeFlag(TUTORIAL_SEEN_COOKIE);
}

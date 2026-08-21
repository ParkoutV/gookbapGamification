/**
 * `participant_id`의 형식과 출처를 정하는 순수 계산.
 *
 * **`participantToken.ts`(쿠키 I/O)와 갈라 둔 이유**: 저쪽은 `next/headers`를 타서
 * 단위 테스트가 안 된다. 여기 있는 것은 값 계산뿐이라 `participantId.test.ts`가
 * 전부 검사할 수 있고, 실기에서 뽑아온 (토큰 → id) 골든 쌍도 그 테스트가 지킨다.
 * 이 파일에 `cookies()`를 들여놓지 말 것 — 들어오는 순간 검사할 수 없어진다.
 */

/**
 * uuid **형식**만 본다. 버전·variant 비트는 검사하지 않는다.
 *
 * `participant_id`는 진짜 uuid가 아니라 **SHA-256 앞 32자를 uuid 모양으로 자른 것**이라
 * 버전 니블이 무엇이든 나올 수 있다(실측: `…-6a50-84dd-…`는 v6/variant8 자리에 걸린다).
 * `couponPayload.ts`가 쓰는 스캐너 정규식(`[1-5]`, `[89ab]`)을 여기 복사해 오면
 * 멀쩡한 세션의 절반쯤이 "손상됨"으로 버려진다. 두 정규식은 목적이 다르다.
 */
const PARTICIPANT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SHA-256 hex(64자)의 **앞 32자**를 `8-4-4-4-12`로 배열한다.
 *
 * **이 배열을 바꾸면 기존 방문자 전원의 `participant_id`가 갈린다.** 설문 이력도
 * 쿠폰도 랭킹도 그 id에 묶여 있어 모두가 신규 참여자가 된다.
 * `participants.participant_id`가 프로덕션에서 실제 `uuid` 타입 컬럼이라
 * 하이픈 배열 자체가 요구사항이다.
 */
export function formatParticipantId(hash: string): string {
  const hex32 = hash.slice(0, 32);
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20, 32)}`;
}

export function isValidParticipantId(value: unknown): value is string {
  return typeof value === "string" && PARTICIPANT_ID_RE.test(value);
}

/**
 * 이번 요청에서 쓸 `participant_id`와, 그것을 쿠키에 새로 심어야 하는지를 정한다.
 *
 * **저장된 값이 유효하면 그쪽이 이긴다**(2026-08-21, 이란토). 토큰 쿠키가 유실돼
 * 새로 발급되면 계산값이 달라지는데, 그때 `participant_id`까지 함께 바뀌면 설문
 * 이력·쿠폰·랭킹이 통째로 끊긴다. 두 쿠키 중 하나라도 살아 있으면 세션을 잇는 것이
 * 이 분기의 목적이다.
 *
 * **손상된 값은 조용히 버린다.** 쿠키는 사용자가 편집할 수 있고 옛 형식이 남아
 * 있을 수도 있는데, 그대로 흘려보내면 `participants` INSERT가 `22P02`로 죽는다.
 * 세션을 잇는 것보다 게임이 도는 것이 먼저다.
 */
export function pickParticipantId(
  stored: unknown,
  fromToken: string
): { id: string; shouldStore: boolean; diverged: boolean } {
  if (isValidParticipantId(stored)) {
    return { id: stored, shouldStore: false, diverged: stored !== fromToken };
  }
  /* 저장된 값이 없거나 버린 경우는 **갈림이 아니다.** 대조할 대상이 애초에 없다 —
     첫 방문 전원을 경고로 찍으면 정작 봐야 할 신호가 묻힌다. */
  return { id: fromToken, shouldStore: true, diverged: false };
}

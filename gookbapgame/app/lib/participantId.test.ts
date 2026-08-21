import { test } from "node:test";
import assert from "node:assert/strict";
import { hashToken } from "./participantToken.ts";
import { formatParticipantId, isValidParticipantId, pickParticipantId } from "./participantId.ts";

/*
 * 실기에서 뽑아온 (토큰 → participant_id) 쌍이다. 2026-08-21에 배포본
 * game.1953bros.com에 Playwright로 붙어 httpOnly 쿠키를 직접 읽고, 그 세션이
 * 실제로 만든 participants 행과 대조해 확인했다.
 *
 * **이 값이 바뀌면 기존 방문자 전원의 participant_id가 갈린다** — 설문 이력도
 * 쿠폰도 랭킹도 전부 그 id에 묶여 있으므로, 포맷을 건드리는 순간 모두가 신규
 * 참여자가 된다. 골든 값으로 박아두는 이유다.
 */
const GOLDEN = [
  ["aaf7afef-a92d-4867-bb30-1ed51d79f7b7", "f0af488f-fe9d-521c-922f-467cd3e80c1e"],
  ["724d3efb-429b-4129-bec0-2580fbca63c8", "895d611e-e5a3-6a50-84dd-211613f63e4a"],
] as const;

test("formatParticipantId: 실기에서 확인한 토큰→id 변환을 그대로 재현한다", () => {
  for (const [token, expected] of GOLDEN) {
    assert.equal(formatParticipantId(hashToken(token)), expected);
  }
});

test("formatParticipantId: SHA-256 앞 32자만 써서 8-4-4-4-12로 배열한다", () => {
  const hash = "0123456789abcdef".repeat(4); // 64자
  assert.equal(formatParticipantId(hash), "01234567-89ab-cdef-0123-456789abcdef");
});

test("formatParticipantId: 결과는 언제나 자기 검증을 통과한다", () => {
  for (const seed of ["a", "국밥", "", "aaf7afef-a92d-4867-bb30-1ed51d79f7b7"]) {
    assert.ok(isValidParticipantId(formatParticipantId(hashToken(seed))));
  }
});

test("isValidParticipantId: 올바른 형식을 통과시킨다", () => {
  assert.ok(isValidParticipantId("f0af488f-fe9d-521c-922f-467cd3e80c1e"));
  assert.ok(isValidParticipantId("00000000-0000-0000-0000-000000000000"));
});

test("isValidParticipantId: 손상되거나 없는 값을 거부한다", () => {
  // 쿠키는 사용자가 편집할 수 있고 옛 버전의 값이 남아 있을 수도 있다.
  // 여기서 걸러내지 못하면 participants.participant_id(uuid 타입)에 그대로
  // 나가 INSERT가 22P02로 죽는다.
  const bad = [
    undefined,
    null,
    "",
    "   ",
    "not-a-uuid",
    "f0af488ffe9d521c922f467cd3e80c1e", // 하이픈 없음
    "f0af488f-fe9d-521c-922f-467cd3e80c1", // 한 자 짧음
    "f0af488f-fe9d-521c-922f-467cd3e80c1ee", // 한 자 김
    "g0af488f-fe9d-521c-922f-467cd3e80c1e", // hex 아닌 문자
    "f0af488f_fe9d_521c_922f_467cd3e80c1e", // 구분자 다름
    123,
    {},
  ];
  for (const value of bad) {
    assert.equal(isValidParticipantId(value), false, `거부해야 한다: ${String(value)}`);
  }
});

test("isValidParticipantId: 대문자 hex도 통과시킨다", () => {
  // Postgres uuid는 대소문자를 가리지 않는다. 거부하면 멀쩡한 세션을 버리게 된다.
  assert.ok(isValidParticipantId("F0AF488F-FE9D-521C-922F-467CD3E80C1E"));
});

test("pickParticipantId: 저장된 값이 유효하면 그것을 쓴다", () => {
  const stored = "f0af488f-fe9d-521c-922f-467cd3e80c1e";
  const fromToken = "895d611e-e5a3-6a50-84dd-211613f63e4a";
  assert.deepEqual(pickParticipantId(stored, fromToken), {
    id: stored,
    shouldStore: false,
    diverged: true,
  });
});

test("pickParticipantId: 저장된 값이 없으면 토큰에서 계산한 값을 쓰고 저장하라고 알린다", () => {
  const fromToken = "895d611e-e5a3-6a50-84dd-211613f63e4a";
  assert.deepEqual(pickParticipantId(undefined, fromToken), {
    id: fromToken,
    shouldStore: true,
    diverged: false,
  });
});

test("pickParticipantId: 저장된 값이 손상됐으면 버리고 토큰 계산값으로 덮어쓴다", () => {
  const fromToken = "895d611e-e5a3-6a50-84dd-211613f63e4a";
  // 손상된 쿠키를 그대로 신뢰하면 DB INSERT가 죽는다. 조용히 복구하는 편이 맞다.
  assert.deepEqual(pickParticipantId("깨진값", fromToken), {
    id: fromToken,
    shouldStore: true,
    diverged: false,
  });
});

test("pickParticipantId: 두 출처가 갈리면 diverged로 알린다", () => {
  /*
   * 이 값이 없으면 **관측 수단이 통째로 사라진다.** 저장된 id는 형식만 맞으면
   * 무조건 이기고 토큰 계산값과 대조되는 일이 영영 없으므로, 엉뚱한 값이 한 번
   * 들어간 사람은 영구히 잘못된 신원에 묶인 채 아무 흔적도 남기지 않는다.
   * 호출부가 이걸 보고 경고를 남긴다.
   */
  const stored = "f0af488f-fe9d-521c-922f-467cd3e80c1e";
  const fromToken = "895d611e-e5a3-6a50-84dd-211613f63e4a";
  assert.equal(pickParticipantId(stored, fromToken).diverged, true);
});

test("pickParticipantId: 두 출처가 같으면 diverged가 아니다", () => {
  const same = "f0af488f-fe9d-521c-922f-467cd3e80c1e";
  assert.equal(pickParticipantId(same, same).diverged, false);
});

test("pickParticipantId: 저장된 값이 없으면 갈린 것이 아니다", () => {
  // 첫 방문은 정상 경로다. 여기서 경고가 뜨면 로그가 전원분으로 뒤덮인다.
  assert.equal(pickParticipantId(undefined, "895d611e-e5a3-6a50-84dd-211613f63e4a").diverged, false);
});

test("pickParticipantId: 손상된 값을 버린 것도 갈린 것이 아니다", () => {
  // 버렸으므로 대조할 대상이 없다. 이걸 갈림으로 치면 신호가 흐려진다.
  assert.equal(pickParticipantId("깨진값", "895d611e-e5a3-6a50-84dd-211613f63e4a").diverged, false);
});

test("pickParticipantId: 저장된 값과 토큰 계산값이 달라도 저장된 쪽을 유지한다", () => {
  /*
   * 이 함수의 존재 이유다(2026-08-21, 이란토). 토큰 쿠키가 유실돼 새로 발급되면
   * 계산값이 바뀌는데, 그때 participant_id까지 함께 바뀌면 설문 이력·쿠폰·랭킹이
   * 전부 끊긴다. participant_id 쿠키가 살아 있는 한 그쪽을 세션의 진실로 삼는다.
   */
  const stored = "f0af488f-fe9d-521c-922f-467cd3e80c1e";
  const fromToken = "895d611e-e5a3-6a50-84dd-211613f63e4a";
  const result = pickParticipantId(stored, fromToken);
  assert.equal(result.id, stored);
  assert.notEqual(result.id, fromToken);
});

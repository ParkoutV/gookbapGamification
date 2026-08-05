/**
 * `get_participant` RPC 응답에서 이미 배정된 닉네임을 꺼낸다.
 *
 * 재방문자에게 `assign_random_nickname`을 다시 호출하면 닉네임이 새로 뽑혀서
 * 새로고침마다 바뀐다(2026-08-05 확인). 그래서 재방문 경로에서는 배정 대신
 * 이 조회를 쓴다.
 */

type NameMap = Record<string, unknown>;

const KO = "ko";

function pickKorean(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const text = (value as NameMap)[KO];
  return typeof text === "string" && text.trim() !== "" ? text.trim() : null;
}

/**
 * 닉네임 문자열, 또는 아직 배정되지 않았거나 응답이 비정상이면 null.
 *
 * null일 때 호출부는 배정 API로 넘어간다. 여기서 한쪽 단어만으로 닉네임을
 * 지어내면 서버에 저장된 값과 어긋나므로, 조합이 온전할 때만 반환한다.
 */
export function nicknameFromParticipantRows(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;

  const first = pickKorean((row as NameMap).nickname_first);
  const last = pickKorean((row as NameMap).nickname_last);
  if (!first || !last) return null;

  return `${first} ${last}`;
}

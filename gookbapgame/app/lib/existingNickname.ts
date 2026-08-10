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
 *
 * **`nickname_number`를 빠뜨리지 말 것.** 이 경로는 재방문자가 타는데,
 * 번호를 안 붙이면 배정 직후(`#0023` 있음)와 다시 접속했을 때(번호 없음)
 * 이름이 달라 보인다. 같은 사람인데 화면마다 다른 이름이 뜨는 셈이라
 * "닉네임 다시 뽑기"가 안 먹는 것처럼 보인다(2026-08-10 제보).
 *
 * `#` 앞은 non-breaking space다(`gookbapanalyze`의 CouponScanner와 같은 규칙).
 * 좁은 화면에서 번호만 다음 줄로 떨어지지 않게 한다. 단어 사이는 기존대로
 * 일반 공백을 유지한다. `nickname_number`는 nullable이라 없으면 붙이지 않는다.
 */
export function nicknameFromParticipantRows(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;

  const first = pickKorean((row as NameMap).nickname_first);
  const last = pickKorean((row as NameMap).nickname_last);
  if (!first || !last) return null;

  const number = (row as NameMap).nickname_number;
  const suffix =
    typeof number === "string" && number.trim() !== "" ? `\u00A0#${number.trim()}` : "";

  return `${first} ${last}${suffix}`;
}

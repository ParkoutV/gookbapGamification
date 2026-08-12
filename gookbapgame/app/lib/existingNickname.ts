/**
 * `get_participant` RPC 응답에서 이미 배정된 닉네임을 꺼낸다.
 *
 * 재방문자에게 `assign_random_nickname`을 다시 호출하면 닉네임이 새로 뽑혀서
 * 새로고침마다 바뀐다(2026-08-05 확인). 그래서 재방문 경로에서는 배정 대신
 * 이 조회를 쓴다.
 *
 * **다국어 맵을 그대로 돌려준다 — 여기서 문자열로 확정하지 말 것**(2026-08-12).
 * 예전에는 `pickKorean`이 `"ko"` 키만 뽑아 써서, 영문·일본어 환경에서도 닉네임만
 * 한국어로 나왔다(gookbapanalyze 담당자 제보). **DB와 RPC는 처음부터 다국어를
 * 통째로 주고 있었고**(`{"ko": "든든한", "en": "Hearty"}`), 그것을 받은 쪽에서
 * 버린 것이 원인이었다. 언어 선택은 화면이 렌더 시점에 한다(`formatNickname`) —
 * 접속 후 언어 토글을 눌러도 따라오게 하려면 여기서 확정하면 안 된다.
 */

import type { NicknameParts } from "./nicknameParts.ts";
import type { LocalizedName } from "./i18n/localizedName.ts";

type Row = Record<string, unknown>;

/**
 * jsonb 맵이 온전한 객체일 때만 통과시킨다. 문자열·null은 이름이 없는 것으로 친다.
 *
 * 배정 경로(`nicknameApi.ts`)도 이걸 쓴다 — 두 경로가 각자 검사하면 한쪽만 느슨해진다.
 */
export function asLocalizedNameMap(value: unknown): LocalizedName | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as LocalizedName;
}

/**
 * `nickname_number`는 nullable이다. 빈 문자열·공백도 없는 것으로 친다.
 *
 * **조회·배정 두 경로가 반드시 같은 규칙을 써야 한다.** 한쪽만 공백을 남기면 배정
 * 직후와 재방문의 닉네임이 달라 보인다(2026-08-10 제보와 같은 증상).
 */
export function normalizeNicknameNumber(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * 닉네임 재료, 또는 아직 배정되지 않았거나 응답이 비정상이면 null.
 *
 * null일 때 호출부는 배정 API로 넘어간다. 한쪽 단어만으로 닉네임을 지어내면 서버에
 * 저장된 값과 어긋나므로, 조합이 온전할 때만 반환한다.
 *
 * **`nickname_number`를 빠뜨리지 말 것.** 이 경로는 재방문자가 타는데, 번호를 안
 * 붙이면 배정 직후(`#0023` 있음)와 다시 접속했을 때(번호 없음) 이름이 달라 보인다.
 * 같은 사람인데 화면마다 다른 이름이 뜨는 셈이라 "닉네임 다시 뽑기"가 안 먹는 것처럼
 * 보인다(2026-08-10 제보). 번호를 붙이는 것은 `formatNickname`이 한다.
 */
export function nicknameFromParticipantRows(data: unknown): NicknameParts | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;

  const first = asLocalizedNameMap((row as Row).nickname_first);
  const last = asLocalizedNameMap((row as Row).nickname_last);
  if (!first || !last) return null;

  return { first, last, number: normalizeNicknameNumber((row as Row).nickname_number) };
}

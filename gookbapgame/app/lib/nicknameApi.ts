/**
 * 배정 API(`POST /api/nickname/assign`) 호출.
 *
 * **응답은 조립된 문자열이 아니라 다국어 맵이다**(2026-08-12 반영, 요청서
 * `docs/client/20260812-nickname-locale.md`). 조립은 `formatNickname`이 하므로
 * 여기서 문자열로 확정하지 말 것 — 접속 후 언어 토글을 눌러도 따라와야 한다.
 *
 * 응답 필드명이 요청서와 다르다: 요청서는 `get_participant`와 맞춘
 * `nickname_first`/`nickname_last`를 제안했으나 실제로는 **`first_nickname`/
 * `last_nickname`**으로 왔다. 조회 경로(`existingNickname.ts`)와 키 이름이 다르니
 * 한쪽을 복사해 오지 말 것.
 *
 * **하위 호환용 `nickname` 문자열은 사라졌다.** 요청서에서 유지를 부탁했지만 실제
 * 응답에는 없어서, 맵이 오지 않으면 폴백할 곳이 없다(→ `ok: false`).
 */

import { asLocalizedNameMap, normalizeNicknameNumber } from "./existingNickname.ts";
import type { NicknameParts } from "./nicknameParts.ts";

export type NicknameAssignResult = { ok: true; nickname: NicknameParts } | { ok: false; error: string };

export async function requestNicknameAssign(
  apiUrl: string,
  participantId: string
): Promise<NicknameAssignResult> {
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId }),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown fetch error" };
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: `Invalid JSON response (status ${res.status})` };
  }

  const first = asLocalizedNameMap(body?.first_nickname);
  const last = asLocalizedNameMap(body?.last_nickname);

  if (!res.ok || body?.success !== true || !first || !last) {
    const message = typeof body?.error === "string" ? body.error : `Unexpected response (status ${res.status})`;
    return { ok: false, error: message };
  }

  return { ok: true, nickname: { first, last, number: normalizeNicknameNumber(body.number) } };
}

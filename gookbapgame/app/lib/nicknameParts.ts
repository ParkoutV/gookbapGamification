import type { Locale } from "./i18n/types.ts";
import { resolveLocalizedName, type LocalizedName } from "./i18n/localizedName.ts";

/**
 * 닉네임을 **문자열이 아니라 조립 전 재료로** 들고 다닌다.
 *
 * 서버 액션이 `"든든한 국밥 #0023"`처럼 확정해서 넘기면, 접속 후 언어 토글을 눌러도
 * 닉네임만 그대로 남는다 — 서버 액션은 그때 다시 불리지 않기 때문이다. 그래서 DB가
 * 주는 다국어 맵을 그대로 나르고 **화면이 렌더 시점에 로케일로 고른다.**
 * 설문·쿠폰 등 다른 다국어 데이터가 이미 그 방식이다(`resolveLocalizedName`).
 *
 * `get_participant` RPC가 이 형태로 준다(`gookbapanalyze/AGENTS.md`):
 *   nickname_first: { "ko": "든든한", "en": "Hearty" }
 *   nickname_last:  { "ko": "국밥",   "en": "Gookbap" }
 *   nickname_number: "0023"
 */
export type NicknameParts = {
  first: LocalizedName;
  last: LocalizedName;
  /** nullable이다. 없으면 번호를 붙이지 않는다. */
  number: string | null;
};

/**
 * 이미 조립된 문자열밖에 없을 때 쓰는 형태.
 *
 * 배정 API(`/api/nickname/assign`)가 지금은 `"든든한 국밥 #0023"` 한국어 문자열만
 * 돌려주기 때문에 첫 방문 경로가 여기 해당한다. 로컬 폴백(`generateNickname`)도 같다.
 *
 * **저쪽이 응답에 다국어 맵을 추가하기로 했으므로(2026-08-12 협의) 그때 이 분기는
 * 줄어든다.** 그전까지는 한국어로 표시되며, 이는 지금과 같은 동작이라 회귀가 아니다.
 */
export type NicknameText = { text: string };

export type Nickname = NicknameParts | NicknameText;

function isParts(value: Nickname): value is NicknameParts {
  return "first" in value;
}

/**
 * 화면에 표시할 닉네임 문자열.
 *
 * **`#` 앞은 non-breaking space다**(`gookbapanalyze`의 CouponScanner와 같은 규칙).
 * 좁은 화면에서 번호만 다음 줄로 떨어지지 않게 한다. 단어 사이는 일반 공백이다.
 *
 * 맵에 해당 로케일이 없으면 `resolveLocalizedName`이 한국어로 떨어뜨린다. 번역이
 * 아직 채워지지 않은 항목은 그래서 지금과 같은 모습으로 보인다.
 */
export function formatNickname(nickname: Nickname, locale: Locale): string {
  if (!isParts(nickname)) return nickname.text;

  const first = resolveLocalizedName(nickname.first, locale);
  const last = resolveLocalizedName(nickname.last, locale);
  const suffix = nickname.number ? ` #${nickname.number}` : "";
  return `${first} ${last}${suffix}`;
}

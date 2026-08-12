import type { Locale } from "./i18n/types.ts";
import { FALLBACK_LOCALE, resolveLocalizedName, type LocalizedName } from "./i18n/localizedName.ts";

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
 * **이제 로컬 폴백(`generateNickname`) 전용이다** — 배정 API도 2026-08-12부터 맵을
 * 주므로 서버에서 오는 경로는 전부 `NicknameParts`다. 폴백은 환경변수 미설정·장애
 * 경로라 한국어 전용으로 남긴다(요청서 `docs/client/20260812-nickname-locale.md`).
 */
export type NicknameText = { text: string };

export type Nickname = NicknameParts | NicknameText;

function isParts(value: Nickname): value is NicknameParts {
  return "first" in value;
}

/** 해당 로케일 값이 실제로 들어 있을 때만 문자열, 아니면 null(→ 통째로 한국어 폴백). */
function pickExact(name: LocalizedName, locale: Locale): string | null {
  const value = name?.[locale];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * 화면에 표시할 닉네임 문자열.
 *
 * **`#` 앞은 non-breaking space다**(`gookbapanalyze`의 CouponScanner와 같은 규칙).
 * 좁은 화면에서 번호만 다음 줄로 떨어지지 않게 한다. 단어 사이는 일반 공백이다.
 *
 * **폴백은 단어별이 아니라 닉네임 전체 단위다**(2026-08-12, 이란토). 앞말·뒷말이
 * 각자 `resolveLocalizedName`을 타면 한쪽만 번역된 프리셋에서 `Hearty 국밥`처럼
 * 언어가 섞인다 — 한 사람의 이름인데 두 언어가 붙어 있는 꼴이라 어색하다("판교
 * 사투리"로 놀림거리가 되는 그 형태다). 그래서 **두 단어 모두 해당 로케일 값이
 * 있을 때만** 그 언어로 쓰고, 하나라도 비면 통째로 한국어로 떨어뜨린다.
 *
 * `nickname_presets.text`의 `en`·`ja`가 아직 부분적으로만 채워져 있어 실제로 자주
 * 걸리는 경로다. 번역이 채워지면 자동으로 해당 언어가 나온다.
 *
 * 둘 다 한국어조차 없으면 `resolveLocalizedName`이 `—`로 떨어뜨린다.
 */
export function formatNickname(nickname: Nickname, locale: Locale): string {
  if (!isParts(nickname)) return nickname.text;

  // 두 단어가 모두 이 로케일로 번역돼 있을 때만 그 언어를 쓴다(위 주석 참고).
  const exactFirst = pickExact(nickname.first, locale);
  const exactLast = pickExact(nickname.last, locale);
  const bothTranslated = exactFirst !== null && exactLast !== null;

  const first = bothTranslated ? exactFirst : resolveLocalizedName(nickname.first, FALLBACK_LOCALE);
  const last = bothTranslated ? exactLast : resolveLocalizedName(nickname.last, FALLBACK_LOCALE);
  const suffix = nickname.number ? ` #${nickname.number}` : "";
  return `${first} ${last}${suffix}`;
}

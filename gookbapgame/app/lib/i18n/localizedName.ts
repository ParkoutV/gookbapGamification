// app/lib/i18n/localizedName.ts
import type { Locale } from "./types.ts";

/** DB에 jsonb로 저장된 이름 맵. 키는 국가 코드 없는 언어 코드다: {"ko": "...", "en": "..."} */
export type LocalizedName = Record<string, string> | null | undefined;

/**
 * 이름을 찾지 못했을 때 쓰는 문자열.
 * 빈 문자열이면 안 된다 — 힌트 목록의 줄 수는 차이 슬롯 개수와 항상 같아야 하고,
 * 줄이 사라지면 플레이어가 문제를 다 찾은 것으로 착각한다.
 */
export const MISSING_NAME_PLACEHOLDER = "—";

/** 번역이 없을 때 최종적으로 떨어지는 언어. 닉네임 전체 폴백(`formatNickname`)도 이걸 쓴다. */
export const FALLBACK_LOCALE = "ko";

/**
 * 요청 로케일 다음에 시도하는 언어. `translate.ts`의 문구 폴백 체인과 같은 순서다
 * (요청 → en → ko) — 두 경로가 갈리면 같은 화면에서 상품명만 한국어로 뜬다.
 *
 * 중국어 추가(2026-08-13) 요청서가 명시한 순서이기도 하다. DB의 `coupon_effects`·
 * 설문 문항에 zh가 아직 없으므로 당분간 zh 사용자는 이 경로를 항상 탄다 —
 * 한국어보다 영어가 나은 자리다.
 */
const SECONDARY_FALLBACK_LOCALE = "en";

function pick(name: NonNullable<LocalizedName>, key: string): string | null {
  const value = name[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function resolveLocalizedName(name: LocalizedName, locale: Locale): string {
  if (!name) return MISSING_NAME_PLACEHOLDER;
  return (
    pick(name, locale) ??
    pick(name, SECONDARY_FALLBACK_LOCALE) ??
    pick(name, FALLBACK_LOCALE) ??
    MISSING_NAME_PLACEHOLDER
  );
}

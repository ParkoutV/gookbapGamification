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

const FALLBACK_LOCALE = "ko";

function pick(name: NonNullable<LocalizedName>, key: string): string | null {
  const value = name[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function resolveLocalizedName(name: LocalizedName, locale: Locale): string {
  if (!name) return MISSING_NAME_PLACEHOLDER;
  return pick(name, locale) ?? pick(name, FALLBACK_LOCALE) ?? MISSING_NAME_PLACEHOLDER;
}

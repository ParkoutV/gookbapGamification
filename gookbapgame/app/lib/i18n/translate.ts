import type { Locale } from "./types.ts";
import { ko } from "./locales/ko.ts";
import { en } from "./locales/en.ts";
import { ja } from "./locales/ja.ts";

export type Dictionaries = Record<Locale, Partial<Record<string, string>>>;

const DICTIONARIES: Dictionaries = { ko, en, ja };

/**
 * 폴백 체인(요청 로케일 → en → ko → 키 이름)을 사전과 분리해 노출한다.
 * 테스트가 실제 번역 데이터에 기대지 않고 이 순서 자체를 검증할 수 있게 하려는 것이다
 * (ja 사전이 채워지면 "ja에 키가 없을 때" 케이스를 실제 데이터로는 만들 수 없다).
 */
export function translateWith(
  dictionaries: Dictionaries,
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const raw = dictionaries[locale][key] ?? dictionaries.en[key] ?? dictionaries.ko[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? `{${name}}`));
}

export function t(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  return translateWith(DICTIONARIES, locale, key, params);
}

import type { Locale } from "./types.ts";
import { ko } from "./locales/ko.ts";
import { en } from "./locales/en.ts";
import { ja } from "./locales/ja.ts";

const DICTIONARIES: Record<Locale, Partial<Record<string, string>>> = { ko, en, ja };

export function t(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const raw = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? DICTIONARIES.ko[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? `{${name}}`));
}

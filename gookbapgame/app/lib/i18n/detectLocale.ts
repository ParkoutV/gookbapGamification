// app/lib/i18n/detectLocale.ts
import { SUPPORTED_LOCALES, type Locale } from "./types.ts";

export function detectLocale(navigatorLanguage: string): Locale {
  const primary = navigatorLanguage.split("-")[0].toLowerCase();
  return (SUPPORTED_LOCALES as string[]).includes(primary) ? (primary as Locale) : "en";
}

// app/lib/i18n/types.ts
export type Locale = "ko" | "en" | "ja" | "zh";

export const SUPPORTED_LOCALES: Locale[] = ["ko", "en", "ja", "zh"];

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  /* 사전은 간체 하나뿐이고 `detectLocale`이 zh-TW·zh-HK도 여기로 모으지만, 라벨은
     `简体中文`이 아니라 `中文`이다 — **1953 형제돼지국밥 공식 홈페이지 표기를 따른다**
     (2026-08-13, 이란토). 번체를 실제로 추가하게 되면 그때 둘을 갈라 적을 것. */
  zh: "中文",
};

export type Dictionary = Record<string, string>;

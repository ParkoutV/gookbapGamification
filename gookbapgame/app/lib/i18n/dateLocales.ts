/** toLocaleDateString에 넘길 BCP 47 태그. 앱의 locale 코드는 국가 코드가 없다. */
export const DATE_LOCALES: Record<string, string> = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
  // 간체 기준이므로 zh-TW(번체 관습)가 아니라 zh-CN이다.
  zh: "zh-CN",
};

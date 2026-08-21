// app/lib/i18n/LocaleContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Locale } from "./types";
import { SUPPORTED_LOCALES } from "./types";
import { detectLocale } from "./detectLocale";
import { t as translate } from "./translate";

const STORAGE_KEY = "gukbap_locale";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function isSupportedLocale(value: string | null): value is Locale {
  return value !== null && (SUPPORTED_LOCALES as string[]).includes(value);
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ko");

  // 최초 마운트 시: 수동 저장된 로케일이 있으면 그걸 쓰고, 없으면 시스템 언어를 감지한다.
  // 서버 렌더링 시점엔 window가 없으므로 이 로직은 항상 클라이언트 마운트 이후에만 실행되고,
  // 그 전까지는 SSR과 동일한 기본값(ko)으로 렌더링돼 하이드레이션 불일치가 나지 않는다.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 서버에 없다(위 주석).
    setLocaleState(isSupportedLocale(stored) ? stored : detectLocale(window.navigator.language));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, "meta.title");
  }, [locale]);

  const setLocale = (next: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  };

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}
